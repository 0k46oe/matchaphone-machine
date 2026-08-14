import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Globe2,
  Heart,
  Home,
  ImagePlus,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Plus,
  Repeat2,
  Search,
  SendHorizonal,
  Share2,
  SmilePlus,
  Sparkles,
  SquarePen,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, Modal } from "../components/ui";
import { StickerPicker } from "../components/ChatMedia";
import {
  addForumReply,
  appendForumDirectMessage,
  createForumPost,
  deleteForumPost,
  ensureForumStarterData,
  generateCharacterForumReply,
  generateForumDirectReply,
  generateForumProactiveDirectMessages,
  generateForumProfileLikes,
  generateForumProfileReplies,
  generateForumReplyToComment,
  incrementForumPostShare,
  markForumDirectThreadRead,
  normalizeForumServer,
  runForumGeneration,
  searchForumPosts,
  toggleForumPostReaction,
  toggleForumReplyReaction,
  updateForumCommunity,
  type ForumDirectParticipant,
} from "../core/forum";
import { db } from "../core/db";
import { deleteMediaIfUnused, saveImageMedia } from "../core/mediaAssets";
import { useStore } from "../core/store";
import { autoTranslateCharacter } from "../core/bilingual";
import {
  now,
  type ForumChannel,
  type ForumCommunityProfile,
  type ForumDirectThread,
  type ForumImageSource,
  type ForumMemberProfile,
  type ForumPost,
  type ForumPostImage,
  type ForumReactionKind,
  type ForumReply,
  type ForumServer,
} from "../core/types";

type ForumSection = "square" | "messages" | "likes" | "profile";
const relativeTime = (value: number) => {
  const diff = Math.max(0, Date.now() - value),
    minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days} 天`
    : new Date(value).toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      });
};
const sourceUrl = (
  source: ForumImageSource | undefined,
  assets: Map<string, string>,
) =>
  source?.type === "asset"
    ? (assets.get(source.value) ?? "")
    : (source?.value ?? "");
const participantKey = (participant: { type: string; id: string }) =>
  `${participant.type}:${participant.id}`;
const threadIdOf = (
  serverId: string,
  participant: { type: string; id: string },
) => `forum-dm:${serverId}:${participant.type}:${participant.id}`;
const memberProfileKey = (type: string, id: string) => `${type}:${id}`;
const cleanHandle = (value: string) =>
  value.trim().replace(/^@/, "").replace(/\s+/g, "_").slice(0, 24);
function AuthorAvatar({
  name,
  src,
  user = false,
  onClick,
}: {
  name: string;
  src?: string;
  user?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Avatar text={name} src={src} size="sm" />
      <i />
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`forum-author-avatar clickable ${user ? "user" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={`查看 ${name} 的主页`}
    >
      {content}
    </button>
  ) : (
    <span className={`forum-author-avatar ${user ? "user" : ""}`}>
      {content}
    </span>
  );
}

export default function ForumPage() {
  const { serverId: routeServerId, postId: routePostId } = useParams(),
    nav = useNavigate(),
    { characters, provider, settings } = useStore();
  const [servers, setServers] = useState<ForumServer[]>([]),
    [channels, setChannels] = useState<ForumChannel[]>([]),
    [posts, setPosts] = useState<ForumPost[]>([]),
    [assets, setAssets] = useState<Map<string, string>>(new Map());
  const [serverId, setServerId] = useState(routeServerId ?? ""),
    [channelId, setChannelId] = useState(""),
    [postId, setPostId] = useState(routePostId ?? ""),
    [query, setQuery] = useState(""),
    [forumSearchOpen, setForumSearchOpen] = useState(false),
    [directoryQuery, setDirectoryQuery] = useState(""),
    [directorySearchOpen, setDirectorySearchOpen] = useState(false);
  const [section, setSection] = useState<ForumSection>("square"),
    [newPostOpen, setNewPostOpen] = useState(false),
    [content, setContent] = useState(""),
    [postImages, setPostImages] = useState<ForumPostImage[]>([]),
    [imageDescription, setImageDescription] = useState(""),
    [descriptionOpen, setDescriptionOpen] = useState(false),
    [stickerPickerOpen, setStickerPickerOpen] = useState(false),
    [sharePost, setSharePost] = useState<ForumPost | null>(null),
    [postMenu, setPostMenu] = useState<ForumPost | null>(null),
    [postDeleteOpen, setPostDeleteOpen] = useState(false),
    [postUploading, setPostUploading] = useState(false),
    [reply, setReply] = useState(""),
    [replyTarget, setReplyTarget] = useState<ForumReply | null>(null),
    [characterPicker, setCharacterPicker] = useState(false),
    [autoCommenting, setAutoCommenting] = useState(false),
    [busy, setBusy] = useState(false),
    [shareBusyKey, setShareBusyKey] = useState(""),
    [generatingThreadIds, setGeneratingThreadIds] = useState<Set<string>>(new Set()),
    [directErrors, setDirectErrors] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState("");
  const pendingPostAssets = useRef(new Set<string>()),
    autoCommentedPosts = useRef(new Set<string>()),
    replyInputRef = useRef<HTMLTextAreaElement>(null),
    pendingProfileBannerAssets = useRef(new Set<string>()),
    obsoleteProfileBannerAssets = useRef(new Set<string>());
  const [dmQuery, setDmQuery] = useState(""),
    [dmParticipantKey, setDmParticipantKey] = useState(""),
    [dmText, setDmText] = useState("");
  const [profileEditing, setProfileEditing] = useState(false),
    [profileAuthor, setProfileAuthor] = useState<{
      authorType: string;
      authorId?: string;
      authorName: string;
      authorHandle?: string;
      authorAvatar?: ForumImageSource;
    } | null>(null),
    [profileName, setProfileName] = useState(""),
    [profileHandle, setProfileHandle] = useState(""),
    [profileBio, setProfileBio] = useState(""),
    [profilePersona, setProfilePersona] = useState(""),
    [profileFollowing, setProfileFollowing] = useState(0),
    [profileFollowers, setProfileFollowers] = useState(0),
    [profileInterop, setProfileInterop] = useState(false),
    [profileInteropCharacters, setProfileInteropCharacters] = useState<
      string[]
    >([]),
    [profileBanner, setProfileBanner] = useState<
      ForumImageSource | undefined
    >(),
    [memberEditing, setMemberEditing] = useState(false),
    [memberName, setMemberName] = useState(""),
    [memberHandle, setMemberHandle] = useState(""),
    [memberBio, setMemberBio] = useState(""),
    [memberPersona, setMemberPersona] = useState(""),
    [memberAvatar, setMemberAvatar] = useState<ForumImageSource | undefined>(),
    [memberBanner, setMemberBanner] = useState<ForumImageSource | undefined>(),
    [profileAnonymous, setProfileAnonymous] = useState(false),
    [profileTab, setProfileTab] = useState<"posts" | "replies" | "likes">(
      "posts",
    ),
    [profileGenerating, setProfileGenerating] = useState(false),
    mountedRef = useRef(true);
  const load = async () => {
    const [nextServers, nextChannels, nextPosts, nextAssets] =
      await Promise.all([
        db.forumServers.orderBy("order").toArray(),
        db.forumChannels.orderBy("order").toArray(),
        db.forumPosts.orderBy("lastActivityAt").reverse().toArray(),
        db.mediaAssets.toArray(),
      ]);
    setServers(nextServers.map(normalizeForumServer));
    setChannels(nextChannels);
    setPosts(nextPosts);
    setAssets(new Map(nextAssets.map((asset) => [asset.id, asset.data])));
  };
  useEffect(() => {
    void ensureForumStarterData(characters).then(load);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of pendingPostAssets.current) void deleteMediaIfUnused(id);
      for (const id of pendingProfileBannerAssets.current)
        void deleteMediaIfUnused(id);
    };
  }, []);
  useEffect(() => {
    setServerId(routeServerId ?? "");
    setPostId(routePostId ?? "");
    if (routePostId) setSection("square");
  }, [routeServerId, routePostId]);
  useEffect(() => {
    if (!serverId) return;
    const available = channels.filter((item) => item.serverId === serverId);
    if (!available.some((item) => item.id === channelId))
      setChannelId(
        (available.find((item) => item.kind === "forum") ?? available[0])?.id ??
          "",
      );
  }, [serverId, channels, channelId]);
  const server = servers.find((item) => item.id === serverId),
    serverChannels = channels.filter((item) => item.serverId === serverId),
    channel = channels.find((item) => item.id === channelId),
    selectedPost = posts.find((item) => item.id === postId),
    directoryServers = servers.filter((item) =>
      `${item.name} ${item.description}`
        .toLocaleLowerCase()
        .includes(directoryQuery.trim().toLocaleLowerCase()),
    );
  const visibleTranslation = (
    authorType: ForumPost["authorType"] | ForumReply["authorType"],
    authorId: string | undefined,
    translation: ForumPost["translation"] | ForumReply["translation"],
  ) => {
    if (
      authorType !== "character" ||
      translation?.status !== "complete" ||
      !translation.text
    )
      return undefined;
    const character = characters.find((item) => item.id === authorId);
    return character && autoTranslateCharacter(character)
      ? translation.text
      : undefined;
  };
  const communityProfile: ForumCommunityProfile = server?.userProfile ?? {
    displayName: settings?.userName || "我",
    handle: cleanHandle(settings?.userName || "user") || "user",
    bio: "",
    persona: "",
    joinedAt: server?.createdAt ?? now(),
    updatedAt: server?.updatedAt ?? now(),
  };
  useEffect(() => {
    if (!server) return;
    const profile: ForumCommunityProfile = server.userProfile ?? {
      displayName: settings?.userName || "我",
      handle: cleanHandle(settings?.userName || "user") || "user",
      bio: "",
      persona: "",
      followingIds: [],
      followerIds: [],
      followingCount: 0,
      followerCount: 0,
      joinedAt: server.createdAt,
      updatedAt: server.updatedAt,
    };
    setProfileName(profile.displayName);
    setProfileHandle(profile.handle);
    setProfileBio(profile.bio);
    setProfilePersona(profile.persona);
    setProfileAnonymous(Boolean(profile.anonymousMode));
    setProfileFollowing(
      profile.followingCount ?? profile.followingIds?.length ?? 0,
    );
    setProfileFollowers(
      profile.followerCount ?? profile.followerIds?.length ?? 0,
    );
    setProfileInterop(profile.chatInterop?.enabled ?? false);
    setProfileInteropCharacters(profile.chatInterop?.characterIds ?? []);
    setProfileBanner(profile.banner);
  }, [serverId, server?.userProfile?.updatedAt, settings?.userName]);
  const channelPosts = useMemo(() => {
    const ids = new Set(
      channels
        .filter((item) => item.serverId === serverId)
        .map((item) => item.id),
    );
    return searchForumPosts(
      posts.filter((post) => ids.has(post.channelId)),
      query,
    ).sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.lastActivityAt - a.lastActivityAt,
    );
  }, [posts, channels, serverId, query]);
  const characterMap = useMemo(
      () => new Map(characters.map((character) => [character.id, character])),
      [characters],
    ),
    forumCharacters = characters.filter((character) =>
      server?.characterIds?.includes(character.id),
    );
  const generatePostComments = async (post: ForumPost) => {
    if (
      !provider?.apiKey.trim() ||
      !settings ||
      !forumCharacters.length ||
      autoCommenting
    )
      return;
    setAutoCommenting(true);
    setNotice("");
    try {
      for (const character of forumCharacters.slice(
        0,
        Math.min(3, forumCharacters.length),
      ))
        await generateCharacterForumReply({
          post,
          character,
          provider,
          appSettings: settings,
        });
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "自动生成评论失败");
    } finally {
      setAutoCommenting(false);
    }
  };
  useEffect(() => {
    if (
      !selectedPost ||
      !provider?.apiKey.trim() ||
      !settings ||
      !forumCharacters.length ||
      autoCommentedPosts.current.has(selectedPost.id)
    )
      return;
    autoCommentedPosts.current.add(selectedPost.id);
    void generatePostComments(selectedPost);
  }, [
    selectedPost?.id,
    provider?.apiKey,
    settings?.userName,
    forumCharacters.length,
  ]);
  const participants: ForumDirectParticipant[] = useMemo(() => {
    if (!server) return [];
    const characterParticipants = characters
      .filter((character) => server.characterIds?.includes(character.id))
      .map((character) => ({
        type: "character" as const,
        id: character.id,
        name: character.name,
        avatar: character.avatar
          ? { type: "url" as const, value: character.avatar }
          : undefined,
        persona: [
          character.personality,
          character.speakingStyle,
          character.background,
        ]
          .filter(Boolean)
          .join("\n"),
      }));
    const npcParticipants = (server.npcs ?? [])
      .filter((npc) => npc.enabled)
      .map((npc) => ({
        type: "npc" as const,
        id: npc.id,
        name: npc.name,
        avatar: npc.avatar,
        persona: npc.persona,
      }));
    const savedDmNpcs = (server.directThreads ?? [])
      .filter(
        (thread) =>
          thread.participantType === "npc" &&
          thread.participantOrigin === "generated",
      )
      .map((thread) => ({
        type: "npc" as const,
        id: thread.participantId,
        name: thread.participantName,
        avatar: thread.participantAvatar,
        persona: thread.participantPersona ?? "论坛私信联系人",
      }));
    return [
      ...characterParticipants,
      ...npcParticipants,
      ...savedDmNpcs.filter(
        (item) => !npcParticipants.some((npc) => npc.id === item.id),
      ),
    ];
  }, [server, characters]);
  const threads = server?.directThreads ?? [],
    activeParticipant = participants.find(
      (participant) => participantKey(participant) === dmParticipantKey,
    ),
    activeThread = activeParticipant
      ? threads.find(
          (thread) => thread.id === threadIdOf(serverId, activeParticipant),
        )
      : undefined;
  const dmRows = participants
    .filter((participant) => {
      const text =
        `${participant.name} ${participant.persona}`.toLocaleLowerCase();
      return text.includes(dmQuery.trim().toLocaleLowerCase());
    })
    .sort(
      (a, b) =>
        (threads.find((thread) => thread.id === threadIdOf(serverId, b))
          ?.updatedAt ?? 0) -
        (threads.find((thread) => thread.id === threadIdOf(serverId, a))
          ?.updatedAt ?? 0),
    );
  const authorAvatar = (post: {
    authorType: string;
    authorId?: string;
    authorAvatar?: ForumImageSource;
  }) =>
    sourceUrl(post.authorAvatar, assets) ||
    (post.authorType === "user"
      ? settings?.userAvatar
      : post.authorId
        ? characterMap.get(post.authorId)?.avatar
        : undefined);
  const openServer = (id: string) => nav(`/forum/${id}`),
    openPost = (id: string) => nav(`/forum/${serverId}/posts/${id}`);
  const openAuthorProfile = (author: {
    authorType: string;
    authorId?: string;
    authorName: string;
    authorHandle?: string;
    authorAvatar?: ForumImageSource;
  }) => {
    setProfileAuthor(
      author.authorType === "user"
        ? null
        : {
            authorType: author.authorType,
            authorId: author.authorId,
            authorName: author.authorName,
            authorHandle: author.authorHandle,
            authorAvatar: author.authorAvatar,
          },
    );
    setSection("profile");
    setDmParticipantKey("");
    setForumSearchOpen(false);
    if (selectedPost) nav(`/forum/${serverId}`);
  };
  const switchSection = (next: ForumSection) => {
    if (selectedPost) nav(`/forum/${serverId}`);
    if (next !== "profile") setProfileAuthor(null);
    setSection(next);
    setDmParticipantKey("");
    setForumSearchOpen(false);
  };
  const closePostComposer = async () => {
    for (const id of pendingPostAssets.current) await deleteMediaIfUnused(id);
    pendingPostAssets.current.clear();
    setContent("");
    setPostImages([]);
    setImageDescription("");
    setDescriptionOpen(false);
    setStickerPickerOpen(false);
    setNewPostOpen(false);
  };
  const uploadPostImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setPostUploading(true);
    try {
      const available = Math.max(0, 9 - postImages.length);
      for (const file of Array.from(files).slice(0, available)) {
        const asset = await saveImageMedia(file, "forum-post-image");
        pendingPostAssets.current.add(asset.id);
        setAssets((current) => new Map(current).set(asset.id, asset.data));
        setPostImages((current) => [
          ...current,
          {
            id: now() + ":" + asset.id,
            source: "asset",
            assetId: asset.id,
            description: file.name.replace(/\.[^.]+$/, ""),
          },
        ]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setPostUploading(false);
    }
  };
  const addImageDescription = () => {
    const description = imageDescription.trim();
    if (!description || postImages.length >= 9) return;
    setPostImages((current) => [
      ...current,
      { id: now() + ":" + Math.random(), source: "description", description },
    ]);
    setImageDescription("");
  };
  const addPostSticker = (sticker: {
    source: "asset" | "url";
    assetId?: string;
    url?: string;
    name: string;
    description: string;
  }) => {
    if (postImages.length >= 9) return;
    setPostImages((current) => [
      ...current,
      {
        id: now() + ":" + Math.random(),
        source: "sticker",
        assetId: sticker.assetId,
        url: sticker.url,
        description: sticker.description || sticker.name,
      },
    ]);
    setStickerPickerOpen(false);
  };
  const removePostImage = async (image: ForumPostImage) => {
    setPostImages((current) => current.filter((item) => item.id !== image.id));
    if (image.source === "asset" && image.assetId) {
      pendingPostAssets.current.delete(image.assetId);
      await deleteMediaIfUnused(image.assetId);
      setAssets((current) => {
        const next = new Map(current);
        next.delete(image.assetId!);
        return next;
      });
    }
  };
  const submitPost = async () => {
    if (!channel || (!content.trim() && !postImages.length) || !settings)
      return;
    const body =
        content.trim() ||
        postImages
          .map((image) => image.description)
          .filter(Boolean)
          .join("\n"),
      derivedTitle = (
        body.split(/\r?\n/).find(Boolean) ?? "分享了一条新帖子"
      ).slice(0, 48);
    setBusy(true);
    try {
      const created = await createForumPost({
        channelId: channel.id,
        title: derivedTitle,
        content: body,
        images: postImages,
        authorName: communityProfile.anonymousMode
          ? "匿名用户"
          : communityProfile.displayName,
        authorHandle: communityProfile.anonymousMode
          ? "@anonymous"
          : `@${communityProfile.handle}`,
        authorAvatar: communityProfile.anonymousMode
          ? undefined
          : settings.userAvatar
            ? { type: "url", value: settings.userAvatar }
            : undefined,
        authorAnonymous: Boolean(communityProfile.anonymousMode),
      });
      pendingPostAssets.current.clear();
      setContent("");
      setPostImages([]);
      setImageDescription("");
      setDescriptionOpen(false);
      setStickerPickerOpen(false);
      setNewPostOpen(false);
      await load();
      setSection("square");
      setPostId("");
      nav(`/forum/${serverId}`);
    } finally {
      setBusy(false);
    }
  };
  const submitReply = async () => {
    if (!selectedPost || !reply.trim() || !settings) return;
    const target = replyTarget;
    setBusy(true);
    setNotice("");
    try {
      const created = await addForumReply(selectedPost.id, {
        content: reply,
        authorName: communityProfile.anonymousMode
          ? "匿名用户"
          : communityProfile.displayName,
        authorHandle: communityProfile.anonymousMode
          ? "@anonymous"
          : `@${communityProfile.handle}`,
        authorAvatar: communityProfile.anonymousMode
          ? undefined
          : settings.userAvatar
            ? { type: "url", value: settings.userAvatar }
            : undefined,
        authorAnonymous: Boolean(communityProfile.anonymousMode),
        replyToId: target?.id,
        replyToName: target?.authorName,
      });
      setReply("");
      setReplyTarget(null);
      await load();
      if (target && provider?.apiKey.trim()) {
        await generateForumReplyToComment({
          postId: selectedPost.id,
          targetReplyId: target.id,
          userReplyId: created.id,
          provider,
        });
        await load();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "回复失败");
    } finally {
      setBusy(false);
    }
  };
  const reactPost = async (kind: ForumReactionKind) => {
    if (!selectedPost) return;
    await toggleForumPostReaction(selectedPost.id, kind);
    await load();
  };
  const reactFeedPost = async (postId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    await toggleForumPostReaction(postId, "heart");
    await load();
  };
  const reactReply = async (replyId: string, kind: ForumReactionKind) => {
    if (!selectedPost) return;
    await toggleForumReplyReaction(selectedPost.id, replyId, kind);
    await load();
  };
  const inviteCharacter = async (characterId: string) => {
    if (!selectedPost || !provider || !settings) return;
    const character = characters.find((item) => item.id === characterId);
    if (!character) return;
    setCharacterPicker(false);
    setBusy(true);
    setNotice("");
    try {
      await generateCharacterForumReply({
        post: selectedPost,
        character,
        provider,
        appSettings: settings,
      });
      await load();
      setNotice(`${character.name} 已参与讨论`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "角色回复失败");
    } finally {
      setBusy(false);
    }
  };
  const continueGeneration = async () => {
    if (!server) return;
    if (!provider?.apiKey.trim()) {
      setNotice("请先在设置 App 中配置聊天模型");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const eventId = `forum-manual:${server.id}:${now()}`,
        result = await runForumGeneration({
          serverId: server.id,
          provider,
          eventId,
        }),
        directMessages = await generateForumProactiveDirectMessages({
          serverId: server.id,
          provider,
          count: server.activitySettings?.directMessagesPerRun ?? 2,
          eventId,
        });
      await load();
      setNotice(
        `已生成 ${result.posts} 篇帖子、${result.replies} 条回复、${directMessages} 条私信`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "继续生成失败");
    } finally {
      setBusy(false);
    }
  };
  const openDirect = (participant: ForumDirectParticipant) => {
    const key = participantKey(participant);
    setDmParticipantKey(key);
    setDirectErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    const thread = threads.find(
      (item) => item.id === threadIdOf(serverId, participant),
    );
    if (thread?.unreadCount)
      void markForumDirectThreadRead(serverId, thread.id).then(load);
  };
  const setDirectError = (key: string, message?: string) => {
    if (!mountedRef.current) return;
    setDirectErrors((current) => {
      if (!message) {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: message };
    });
  };
  const generateDirectForParticipant = async (
    participant: ForumDirectParticipant,
  ) => {
    if (!server || !provider?.apiKey.trim()) return;
    const key = participantKey(participant),
      threadId = threadIdOf(server.id, participant);
    if (mountedRef.current) {
      setGeneratingThreadIds((current) => new Set(current).add(threadId));
      setDirectError(key);
    }
    try {
      await generateForumDirectReply({
        serverId: server.id,
        participant,
        provider,
        userProfile: communityProfile,
      });
      await markForumDirectThreadRead(server.id, threadId);
      if (mountedRef.current) await load();
    } catch (error) {
      setDirectError(
        key,
        error instanceof Error ? error.message : "私信回复失败",
      );
    } finally {
      if (mountedRef.current)
        setGeneratingThreadIds((current) => {
          if (!current.has(threadId)) return current;
          const next = new Set(current);
          next.delete(threadId);
          return next;
        });
    }
  };
  const sharePostToParticipant = async (
    participant: ForumDirectParticipant,
  ) => {
    if (!server || !sharePost) return;
    const key = participantKey(participant),
      post = sharePost;
    setShareBusyKey(key);
    setDirectError(key);
    try {
      await appendForumDirectMessage({
        serverId: server.id,
        participant,
        senderType: "user",
        content: `[分享帖子] ${post.title}\n${post.content.slice(0, 180)}`,
      });
      await incrementForumPostShare(post.id);
      if (!mountedRef.current) return;
      setSharePost(null);
      await load();
      setNotice(`已通过私信分享给 ${participant.name}`);
      if (provider?.apiKey.trim()) void generateDirectForParticipant(participant);
      else setDirectError(key, "帖子已分享；配置聊天模型后对方才能回复");
    } catch (error) {
      if (mountedRef.current)
        setDirectError(
          key,
          error instanceof Error ? error.message : "分享失败",
        );
    } finally {
      if (mountedRef.current)
        setShareBusyKey((current) => (current === key ? "" : current));
    }
  };
  const sendDirect = async () => {
    if (!server || !activeParticipant || !dmText.trim()) return;
    const participant = activeParticipant,
      key = participantKey(participant),
      threadId = threadIdOf(server.id, participant);
    if (generatingThreadIds.has(threadId)) return;
    const value = dmText.trim();
    setDmText("");
    setDirectError(key);
    try {
      await appendForumDirectMessage({
        serverId: server.id,
        participant,
        senderType: "user",
        content: value,
        anonymous: Boolean(communityProfile.anonymousMode),
      });
      if (mountedRef.current) await load();
      if (provider?.apiKey.trim()) void generateDirectForParticipant(participant);
      else setDirectError(key, "消息已发送；配置聊天模型后对方才能回复");
    } catch (error) {
      setDirectError(
        key,
        error instanceof Error ? error.message : "私信发送失败",
      );
    }
  };
  const openMemberEditor = () => {
    if (!profileAuthor) return;
    const actorId =
        profileAuthor.authorId ??
        `${profileAuthor.authorType}:${profileAuthor.authorName}`,
      saved =
        server?.memberProfiles?.[
          memberProfileKey(profileAuthor.authorType, actorId)
        ];
    setMemberName(saved?.displayName ?? profileAuthor.authorName);
    setMemberHandle(
      (
        saved?.handle ??
        profileAuthor.authorHandle ??
        handleOf(profileAuthor.authorName)
      ).replace(/^@/, ""),
    );
    setMemberBio(saved?.bio ?? "");
    setMemberPersona(
      saved?.persona ??
        profileCharacter?.personality ??
        profileNpc?.persona ??
        displayProfilePosts[0]?.authorPersonaSnapshot ??
        "",
    );
    setMemberAvatar(saved?.avatar ?? profileAuthor.authorAvatar);
    setMemberBanner(saved?.banner);
    setMemberEditing(true);
  };
  const uploadMemberMedia = async (kind: "avatar" | "banner", file?: File) => {
    if (!file) return;
    const asset = await saveImageMedia(
      file,
      kind === "avatar" ? "forum-member-avatar" : "forum-member-banner",
    );
    setAssets((current) => new Map(current).set(asset.id, asset.data));
    const source = { type: "asset" as const, value: asset.id };
    if (kind === "avatar") setMemberAvatar(source);
    else setMemberBanner(source);
  };
  const saveMemberProfile = async () => {
    if (!server || !profileAuthor) return;
    const actorId =
        profileAuthor.authorId ??
        `${profileAuthor.authorType}:${profileAuthor.authorName}`,
      key = memberProfileKey(profileAuthor.authorType, actorId),
      profile: ForumMemberProfile = {
        actorType: profileAuthor.authorType as "character" | "npc",
        actorId,
        displayName: memberName.trim().slice(0, 30) || profileAuthor.authorName,
        handle:
          cleanHandle(memberHandle) ||
          cleanHandle(profileAuthor.authorHandle ?? profileAuthor.authorName),
        bio: memberBio.trim().slice(0, 240),
        persona: memberPersona.trim().slice(0, 2000),
        avatar: memberAvatar,
        banner: memberBanner,
        joinedAt: server.memberProfiles?.[key]?.joinedAt ?? now(),
        updatedAt: now(),
      };
    await updateForumCommunity(server.id, {
      memberProfiles: { ...(server.memberProfiles ?? {}), [key]: profile },
    });
    setMemberEditing(false);
    await load();
  };
  const closeProfileEditor = async () => {
    for (const id of pendingProfileBannerAssets.current)
      await deleteMediaIfUnused(id);
    pendingProfileBannerAssets.current.clear();
    obsoleteProfileBannerAssets.current.clear();
    setProfileBanner(server?.userProfile?.banner);
    setProfileEditing(false);
  };
  const uploadProfileBanner = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await saveImageMedia(file, "forum-profile-banner");
      if (profileBanner?.type === "asset") {
        if (pendingProfileBannerAssets.current.has(profileBanner.value)) {
          pendingProfileBannerAssets.current.delete(profileBanner.value);
          await deleteMediaIfUnused(profileBanner.value);
        } else obsoleteProfileBannerAssets.current.add(profileBanner.value);
      }
      pendingProfileBannerAssets.current.add(asset.id);
      setAssets((current) => new Map(current).set(asset.id, asset.data));
      setProfileBanner({ type: "asset", value: asset.id });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "封面上传失败");
    } finally {
      setBusy(false);
    }
  };
  const removeProfileBanner = async () => {
    if (profileBanner?.type === "asset") {
      if (pendingProfileBannerAssets.current.has(profileBanner.value)) {
        pendingProfileBannerAssets.current.delete(profileBanner.value);
        await deleteMediaIfUnused(profileBanner.value);
      } else obsoleteProfileBannerAssets.current.add(profileBanner.value);
    }
    setProfileBanner(undefined);
  };
  const saveProfile = async () => {
    if (!server) return;
    const handle = cleanHandle(profileHandle);
    if (!profileName.trim() || !handle) {
      setNotice("名称和 ID 不能为空");
      return;
    }
    setBusy(true);
    try {
      await updateForumCommunity(server.id, {
        userProfile: {
          displayName: profileName.trim().slice(0, 30),
          handle,
          bio: profileBio.trim().slice(0, 240),
          persona: profilePersona.trim().slice(0, 2000),
          anonymousMode: profileAnonymous,
          followingIds: server.userProfile?.followingIds ?? [],
          followerIds: server.userProfile?.followerIds ?? [],
          followingCount: Math.max(
            0,
            Math.min(999999, Math.trunc(profileFollowing) || 0),
          ),
          followerCount: Math.max(
            0,
            Math.min(999999, Math.trunc(profileFollowers) || 0),
          ),
          chatInterop: {
            enabled: profileInterop,
            characterIds: profileInterop
              ? profileInteropCharacters.filter((id) =>
                  server.characterIds?.includes(id),
                )
              : [],
          },
          banner: profileBanner,
          joinedAt: server.userProfile?.joinedAt ?? now(),
          updatedAt: now(),
        },
      });
      pendingProfileBannerAssets.current.clear();
      for (const id of obsoleteProfileBannerAssets.current)
        await deleteMediaIfUnused(id);
      obsoleteProfileBannerAssets.current.clear();
      await load();
      setProfileEditing(false);
      setNotice("个人资料已保存");
    } finally {
      setBusy(false);
    }
  };
  const confirmDeletePost = async () => {
    const target = postMenu;
    if (!target) return;
    setBusy(true);
    try {
      await deleteForumPost(target.id);
      setPostDeleteOpen(false);
      setPostMenu(null);
      await load();
      if (selectedPost?.id === target.id) nav(`/forum/${serverId}`);
      setNotice("帖子已删除");
    } finally {
      setBusy(false);
    }
  };
  const postImageUrl = (image: ForumPostImage) =>
    image.assetId ? assets.get(image.assetId) : image.url;
  const renderPostImages = (post: ForumPost, compact = false) =>
    post.images?.length ? (
      <div className={`forum-post-media ${compact ? "compact" : ""}`}>
        {post.images.map((image) =>
          image.source !== "description" && postImageUrl(image) ? (
            <figure
              className={image.source === "sticker" ? "sticker" : ""}
              key={image.id}
            >
              <img
                src={postImageUrl(image)}
                alt={image.description || "帖子图片"}
              />
              {image.source !== "sticker" && image.description && (
                <figcaption>{image.description}</figcaption>
              )}
            </figure>
          ) : (
            <figure className="description" key={image.id}>
              <ImagePlus />
              <span>图片描述</span>
              <p>{image.description}</p>
            </figure>
          ),
        )}
      </div>
    ) : null;
  const handleOfAuthor = (author: {
    authorType?: string;
    authorName: string;
    authorHandle?: string;
  }) =>
    author.authorHandle ??
    (author.authorType === "user"
      ? `@${communityProfile.handle}`
      : handleOf(author.authorName));
  const reactionCount = (post: ForumPost) =>
      post.reactions.reduce((sum, item) => sum + item.count, 0),
    handleOf = (name: string) => `@${name.replace(/\s+/g, "_").slice(0, 18)}`;

  if (!serverId)
    return (
      <div className="forum-directory-page forum-directory-feed">
        <header className="forum-directory-feed-head">
          <button onClick={() => nav("/")} aria-label="返回茶茶机桌面">
            <Menu />
          </button>
          <span className="forum-directory-logo">
            <MessageCircle />
          </span>
          <button
            onClick={() => setDirectorySearchOpen((value) => !value)}
            aria-label="搜索论坛"
          >
            <Search />
          </button>
        </header>
        {directorySearchOpen && (
          <label className="forum-directory-search feed-search">
            <Search />
            <input
              autoFocus
              value={directoryQuery}
              onChange={(event) => setDirectoryQuery(event.target.value)}
              placeholder="搜索论坛"
            />
            {directoryQuery && (
              <button onClick={() => setDirectoryQuery("")}>
                <X />
              </button>
            )}
          </label>
        )}
        <div className="forum-directory-count">
          <b>{directoryServers.length}</b>
          <span>个论坛</span>
        </div>
        <main className="forum-directory-feed-list">
          {directoryServers.length ? (
            directoryServers.map((item) => {
              const avatarUrl = sourceUrl(item.avatar, assets);
              return (
                <button
                  className="forum-directory-feed-row"
                  key={item.id}
                  onClick={() => openServer(item.id)}
                >
                  <span className="forum-directory-avatar-wrap">
                    {avatarUrl ? (
                      <img
                        className="forum-directory-icon image"
                        src={avatarUrl}
                        alt=""
                      />
                    ) : (
                      <span
                        className="forum-directory-icon"
                        style={
                          {
                            "--forum-card-color": item.color,
                          } as React.CSSProperties
                        }
                      >
                        {item.iconText}
                      </span>
                    )}
                  </span>
                  <div>
                    <header>
                      <b>{item.name}</b>
                      <time>{relativeTime(item.updatedAt)}</time>
                      <MoreHorizontal />
                    </header>
                    <p>{item.description}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="forum-directory-empty">
              <Search />
              <h3>没有找到论坛</h3>
              <p>可以创建一个新的论坛。</p>
            </div>
          )}
        </main>
        <button
          className="forum-directory-floating-create"
          onClick={() => nav("/forum/new")}
          aria-label="创建论坛"
        >
          <Plus />
        </button>
      </div>
    );
  if (!server)
    return (
      <div className="forum-x-empty">
        <b>论坛不存在</b>
        <button onClick={() => nav("/forum")}>返回目录</button>
      </div>
    );
  const serverChannelIds = new Set(serverChannels.map((item) => item.id)),
    serverPosts = posts.filter((post) => serverChannelIds.has(post.channelId)),
    metricOrder = [...serverPosts].sort((a, b) => a.id.localeCompare(b.id)),
    metricRank = new Map(metricOrder.map((post, index) => [post.id, index]));
  const postMetrics = (post: ForumPost) => {
    const rank = metricRank.get(post.id) ?? 0;
    return {
      replies: post.replies.length + 8 + rank * 11,
      reposts: 5 + rank * 13,
      likes: reactionCount(post) + 12 + rank * 17,
      views: 121 + rank * 137,
      shares: (post.shareCount ?? 0) + 3 + rank * 7,
    };
  };
  const bannerUrl = sourceUrl(server.banner, assets),
    serverAvatar = sourceUrl(server.avatar, assets),
    profilePosts = serverPosts.filter((post) => post.authorType === "user"),
    likedPosts = serverPosts.filter((post) =>
      post.reactions.some((reaction) => reaction.reacted),
    ),
    likedReplies = serverPosts.flatMap((post) =>
      post.replies
        .filter((item) => item.reactions.some((reaction) => reaction.reacted))
        .map((item) => ({ post, item })),
    );
  const profileCharacter =
      profileAuthor?.authorType === "character" && profileAuthor.authorId
        ? characterMap.get(profileAuthor.authorId)
        : undefined,
    profileNpc =
      profileAuthor?.authorType === "npc"
        ? server.npcs?.find((item) => item.id === profileAuthor.authorId)
        : undefined;
  const profileActorId = profileAuthor
      ? (profileAuthor.authorId ??
        `${profileAuthor.authorType}:${profileAuthor.authorName}`)
      : "",
    memberProfile = profileAuthor
      ? server.memberProfiles?.[
          memberProfileKey(profileAuthor.authorType, profileActorId)
        ]
      : undefined;
  const profileDisplayName =
      memberProfile?.displayName ??
      profileAuthor?.authorName ??
      communityProfile.displayName,
    profileHandleValue = (
      memberProfile?.handle ??
      profileAuthor?.authorHandle ??
      (profileAuthor
        ? handleOf(profileAuthor.authorName)
        : `@${communityProfile.handle}`)
    ).replace(/^@/, ""),
    profileBioValue = profileAuthor
      ? memberProfile?.bio ||
        profileCharacter?.bio ||
        profileNpc?.persona ||
        "这个人还没有填写个人简介。"
      : communityProfile.bio || "还没有填写个人简介。",
    profileAvatarUrl = profileAuthor
      ? sourceUrl(memberProfile?.avatar, assets) ||
        sourceUrl(profileAuthor.authorAvatar, assets) ||
        profileCharacter?.avatar ||
        sourceUrl(profileNpc?.avatar, assets)
      : settings?.userAvatar,
    displayProfileBannerUrl = profileAuthor
      ? sourceUrl(memberProfile?.banner, assets)
      : sourceUrl(communityProfile.banner, assets) || bannerUrl,
    profileJoinedAt = profileAuthor
      ? (memberProfile?.joinedAt ??
        profileCharacter?.createdAt ??
        profileNpc?.createdAt ??
        server.createdAt)
      : communityProfile.joinedAt,
    profileFollowingValue = profileAuthor
      ? Math.max(18, profileDisplayName.length * 37)
      : (communityProfile.followingCount ??
        communityProfile.followingIds?.length ??
        0),
    profileFollowerValue = profileAuthor
      ? Math.max(42, profileDisplayName.length * 83)
      : (communityProfile.followerCount ??
        communityProfile.followerIds?.length ??
        0);
  const displayProfilePosts = profileAuthor
    ? serverPosts.filter((post) =>
        profileAuthor.authorId
          ? post.authorType === profileAuthor.authorType &&
            post.authorId === profileAuthor.authorId
          : post.authorType === profileAuthor.authorType &&
            post.authorName === profileAuthor.authorName,
      )
    : profilePosts;
  const displayProfileReplies = profileAuthor
    ? serverPosts.flatMap((post) =>
        post.replies
          .filter((item) =>
            profileAuthor.authorId
              ? item.authorType === profileAuthor.authorType &&
                item.authorId === profileAuthor.authorId
              : item.authorType === profileAuthor.authorType &&
                item.authorName === profileAuthor.authorName,
          )
          .map((item) => ({ post, item })),
      )
    : [];
  const displayProfileLikes = profileAuthor
    ? (server.profileLikes ?? [])
        .filter(
          (item) =>
            item.actorType === profileAuthor.authorType &&
            item.actorId === profileAuthor.authorId,
        )
        .map((item) => serverPosts.find((post) => post.id === item.postId))
        .filter((post): post is ForumPost => Boolean(post))
    : [];
  const changeProfileTab = async (next: "posts" | "replies" | "likes") => {
    setProfileTab(next);
    if (!profileAuthor || next === "posts" || profileGenerating) return;
    const actorId =
      profileAuthor.authorId ??
      `${profileAuthor.authorType}:${profileAuthor.authorName}`;
    if (
      (next === "replies" && displayProfileReplies.length) ||
      (next === "likes" && displayProfileLikes.length)
    )
      return;
    setProfileGenerating(true);
    try {
      if (next === "replies") {
        if (!provider?.apiKey.trim()) throw new Error("请先配置聊天模型");
        await generateForumProfileReplies({
          serverId: server.id,
          actor: {
            type: profileAuthor.authorType as "character" | "npc",
            id: actorId,
            name: profileAuthor.authorName,
            handle:
              profileAuthor.authorHandle ?? handleOf(profileAuthor.authorName),
            avatar: profileAuthor.authorAvatar,
            persona:
              memberProfile?.persona ||
              profileCharacter?.personality ||
              profileNpc?.persona ||
              displayProfilePosts[0]?.authorPersonaSnapshot ||
              "普通论坛用户",
          },
          provider,
        });
      } else
        await generateForumProfileLikes({
          serverId: server.id,
          actor: {
            type: profileAuthor.authorType as "character" | "npc",
            id: actorId,
          },
        });
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成内容失败");
    } finally {
      setProfileGenerating(false);
    }
  };
  const headerTitle = selectedPost
      ? "帖子"
      : section === "messages"
        ? activeParticipant
          ? activeParticipant.name
          : "私信"
        : section === "likes"
          ? "喜欢"
          : section === "profile"
            ? "个人主页"
            : server.name,
    selectedMetrics = selectedPost ? postMetrics(selectedPost) : null;
  return (
    <div className="forum-x-page forum-community-shell">
      <header className="forum-x-header">
        <button
          onClick={() => {
            if (selectedPost) nav(`/forum/${server.id}`);
            else if (section !== "square") switchSection("square");
            else nav("/forum");
          }}
          aria-label="返回"
        >
          <ArrowLeft />
        </button>
        <div>
          <b>{headerTitle}</b>
          <small>
            {selectedPost
              ? selectedPost.title
              : section === "messages"
                ? activeParticipant
                  ? "社区私信"
                  : "与论坛成员聊天"
                : section === "likes"
                  ? `${likedPosts.length + likedReplies.length} 条喜欢`
                  : section === "profile"
                    ? `@${profileHandleValue}`
                    : `${serverPosts.length} 篇帖子`}
          </small>
        </div>
        <span className="forum-x-head-actions">
          {section === "square" && !selectedPost && (
            <button
              onClick={() => setForumSearchOpen((value) => !value)}
              aria-label="搜索帖子"
            >
              <Search />
            </button>
          )}
          {section === "profile" &&
            !selectedPost &&
            (profileAuthor ? (
              <button onClick={openMemberEditor} aria-label="编辑成员资料">
                <PenLine />
              </button>
            ) : (
              <button
                onClick={() => setProfileEditing(true)}
                aria-label="编辑个人资料"
              >
                <PenLine />
              </button>
            ))}
          {section === "square" && !selectedPost && (
            <button
              onClick={() => nav(`/forum/${server.id}/settings`)}
              aria-label="论坛设置"
            >
              <MoreHorizontal />
            </button>
          )}
        </span>
      </header>
      {selectedPost ? (
        <main className="forum-x-thread">
          <article className="forum-x-thread-post">
            <div className="forum-x-author">
              <AuthorAvatar
                name={selectedPost.authorName}
                src={authorAvatar(selectedPost)}
                user={selectedPost.authorType === "user"}
                onClick={() => openAuthorProfile(selectedPost)}
              />
              <div>
                <b>{selectedPost.authorName}</b>
                <span>{handleOfAuthor(selectedPost)}</span>
              </div>
              <button
                className="forum-post-more"
                onClick={() => {
                  setPostMenu(selectedPost);
                  setPostDeleteOpen(false);
                }}
                aria-label="帖子操作"
              >
                <MoreHorizontal />
              </button>
            </div>
            <p>{selectedPost.content}</p>
            {visibleTranslation(
              selectedPost.authorType,
              selectedPost.authorId,
              selectedPost.translation,
            ) && (
              <p className="content-translation forum-translation">
                {visibleTranslation(
                  selectedPost.authorType,
                  selectedPost.authorId,
                  selectedPost.translation,
                )}
              </p>
            )}
            {renderPostImages(selectedPost)}
            {selectedPost.tags.length > 0 && (
              <div className="forum-x-tags">
                {selectedPost.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
            <time>
              {new Date(selectedPost.createdAt).toLocaleString("zh-CN")} ·{" "}
              <b>{selectedMetrics?.views}</b> 次浏览
            </time>
            <div className="forum-x-detail-counts">
              <span>
                <b>{selectedMetrics?.replies}</b> 回复
              </span>
              <span>
                <b>{selectedMetrics?.likes}</b> 喜欢
              </span>
              <span>
                <b>{selectedMetrics?.shares}</b> 分享
              </span>
            </div>
            <div className="forum-x-detail-actions">
              <button>
                <MessageCircle />
                <span>{selectedMetrics?.replies}</span>
              </button>
              <button>
                <Repeat2 />
                <span>{selectedMetrics?.reposts}</span>
              </button>
              <button
                className={
                  selectedPost.reactions.some((item) => item.reacted)
                    ? "active"
                    : ""
                }
                onClick={() => void reactPost("heart")}
              >
                <Heart />
                <span>{selectedMetrics?.likes}</span>
              </button>
              <button>
                <BarChart3 />
                <span>{selectedMetrics?.views}</span>
              </button>
              <button onClick={() => setSharePost(selectedPost)}>
                <Share2 />
                <span>{selectedMetrics?.shares}</span>
              </button>
            </div>
          </article>
          {replyTarget && (
            <div className="forum-reply-target">
              <span>
                正在回复{" "}
                <b>{replyTarget.authorHandle ?? replyTarget.authorName}</b>
              </span>
              <button
                onClick={() => setReplyTarget(null)}
                aria-label="取消回复"
              >
                <X />
              </button>
            </div>
          )}
          <div className="forum-x-reply-box">
            <AuthorAvatar
              name={communityProfile.displayName}
              src={settings?.userAvatar}
              user
              onClick={() =>
                openAuthorProfile({
                  authorType: "user",
                  authorName: communityProfile.displayName,
                  authorHandle: `@${communityProfile.handle}`,
                })
              }
            />
            <textarea
              ref={replyInputRef}
              rows={1}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder={
                replyTarget
                  ? `回复 ${replyTarget.authorHandle ?? replyTarget.authorName}`
                  : "发布你的回复"
              }
            />
            <button
              onClick={() => setCharacterPicker(true)}
              title="邀请角色回复"
            >
              <Users />
            </button>
            <button
              className="reply"
              disabled={!reply.trim() || busy}
              onClick={() => void submitReply()}
            >
              回复
            </button>
          </div>
          {autoCommenting && (
            <div className="forum-auto-comments">正在生成评论…</div>
          )}
          <button
            className="forum-continue-comments"
            disabled={
              autoCommenting ||
              !provider?.apiKey.trim() ||
              !forumCharacters.length
            }
            onClick={() => void generatePostComments(selectedPost)}
          >
            <Sparkles />
            {autoCommenting ? "正在生成评论…" : "继续生成评论区回复"}
          </button>
          <section className="forum-x-replies">
            {selectedPost.replies.length ? (
              selectedPost.replies.map((item) => (
                <article key={item.id}>
                  <AuthorAvatar
                    name={item.authorName}
                    src={authorAvatar(item)}
                    user={item.authorType === "user"}
                    onClick={() => openAuthorProfile(item)}
                  />
                  <div>
                    <header>
                      <b>{item.authorName}</b>
                      <span>
                        {handleOfAuthor(item)} · {relativeTime(item.createdAt)}
                      </span>
                      <MoreHorizontal />
                    </header>
                    {item.replyToName && (
                      <small className="forum-replying-to">
                        回复给 {item.replyToName}
                      </small>
                    )}
                    <p>{item.content}</p>
                    {visibleTranslation(
                      item.authorType,
                      item.authorId,
                      item.translation,
                    ) && (
                      <p className="content-translation forum-translation">
                        {visibleTranslation(
                          item.authorType,
                          item.authorId,
                          item.translation,
                        )}
                      </p>
                    )}
                    <div className="forum-x-row-actions">
                      <button
                        onClick={() => {
                          setReplyTarget(item);
                          window.setTimeout(
                            () => replyInputRef.current?.focus(),
                            0,
                          );
                        }}
                      >
                        <MessageCircle />
                        <span>{Math.max(1, item.content.length % 19)}</span>
                      </button>
                      <button>
                        <Repeat2 />
                        <span>{Math.max(1, item.content.length % 11)}</span>
                      </button>
                      <button
                        className={
                          item.reactions.some((value) => value.reacted)
                            ? "active"
                            : ""
                        }
                        onClick={() => void reactReply(item.id, "heart")}
                      >
                        <Heart />
                        <span>
                          {item.reactions.reduce(
                            (sum, value) => sum + value.count,
                            0,
                          ) + Math.max(2, item.content.length % 23)}
                        </span>
                      </button>
                      <button>
                        <BarChart3 />
                        <span>{Math.max(17, item.content.length * 3)}</span>
                      </button>
                      <button onClick={() => setSharePost(selectedPost)}>
                        <Share2 />
                        <span>{Math.max(1, item.content.length % 7)}</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="forum-x-empty">
                <MessageCircle />
                <b>还没有回复</b>
                <p>成为第一个参与讨论的人。</p>
              </div>
            )}
          </section>
        </main>
      ) : section === "square" ? (
        <main className="forum-square-scroll">
          <section className="forum-x-profile">
            {bannerUrl ? (
              <img className="banner" src={bannerUrl} alt="" />
            ) : (
              <div
                className="banner"
                style={{
                  background: profileAuthor
                    ? "#b8b8ba"
                    : `linear-gradient(135deg,${server.color}55,#ececef)`,
                }}
              />
            )}
            <div className="profile-row">
              {serverAvatar ? (
                <img className="avatar" src={serverAvatar} alt="" />
              ) : (
                <span
                  className="avatar fallback"
                  style={{ background: server.color }}
                >
                  {server.iconText}
                </span>
              )}
              <button
                className={busy ? "generating" : ""}
                disabled={busy}
                onClick={() => void continueGeneration()}
                aria-label="继续生成论坛内容"
                title="继续生成论坛内容"
              >
                <Sparkles />
              </button>
            </div>
            <h1>{server.name}</h1>
            <p>{server.description}</p>
          </section>
          {forumSearchOpen && (
            <label className="forum-x-search">
              <Search />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`搜索 ${server.name} 的帖子`}
              />
              {query && (
                <button onClick={() => setQuery("")}>
                  <X />
                </button>
              )}
            </label>
          )}
          <section className="forum-x-feed">
            {channelPosts.length ? (
              channelPosts.map((post) => {
                const metrics = postMetrics(post);
                return (
                  <article
                    className="forum-x-post"
                    key={post.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPost(post.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openPost(post.id);
                    }}
                  >
                    <AuthorAvatar
                      name={post.authorName}
                      src={authorAvatar(post)}
                      user={post.authorType === "user"}
                      onClick={() => openAuthorProfile(post)}
                    />
                    <div>
                      <header>
                        <b>{post.authorName}</b>
                        <span>
                          {handleOfAuthor(post)} ·{" "}
                          {relativeTime(post.lastActivityAt)}
                        </span>
                        <button
                          className="forum-post-more"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPostMenu(post);
                            setPostDeleteOpen(false);
                          }}
                          aria-label="帖子操作"
                        >
                          <MoreHorizontal />
                        </button>
                      </header>
                      <p>{post.content}</p>
                      {visibleTranslation(
                        post.authorType,
                        post.authorId,
                        post.translation,
                      ) && (
                        <p className="content-translation forum-translation">
                          {visibleTranslation(
                            post.authorType,
                            post.authorId,
                            post.translation,
                          )}
                        </p>
                      )}
                      {renderPostImages(post, true)}
                      {post.tags.length > 0 && (
                        <div className="forum-x-tags">
                          {post.tags.slice(0, 3).map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="forum-x-row-actions">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openPost(post.id);
                          }}
                        >
                          <MessageCircle />
                          <b>{metrics.replies}</b>
                        </button>
                        <button onClick={(event) => event.stopPropagation()}>
                          <Repeat2 />
                          <b>{metrics.reposts}</b>
                        </button>
                        <button
                          className={
                            post.reactions.some((item) => item.reacted)
                              ? "active"
                              : ""
                          }
                          onClick={(event) =>
                            void reactFeedPost(post.id, event)
                          }
                        >
                          <Heart />
                          <b>{metrics.likes}</b>
                        </button>
                        <span>
                          <BarChart3 />
                          <b>{metrics.views}</b>
                        </span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setSharePost(post);
                          }}
                        >
                          <Share2 />
                          <b>{metrics.shares}</b>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="forum-x-empty">
                <Search />
                <b>没有找到帖子</b>
                <p>换个关键词，或发布一篇新帖子。</p>
              </div>
            )}
          </section>
        </main>
      ) : section === "messages" ? (
        <main className="forum-dm-page">
          {activeParticipant ? (
            <>
              <section className="forum-dm-thread-head">
                <button onClick={() => setDmParticipantKey("")}>
                  <ArrowLeft />
                </button>
                <Avatar
                  text={activeParticipant.name}
                  src={sourceUrl(activeParticipant.avatar, assets)}
                />
                <span>
                  <b>{activeParticipant.name}</b>
                  <small>
                    {activeParticipant.type === "npc" ? "论坛 NPC" : "论坛角色"}
                  </small>
                </span>
              </section>
              <section className="forum-dm-thread">
                {activeThread?.messages.length ? (
                  activeThread.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`forum-dm-bubble-row ${message.senderType === "user" ? "mine" : "theirs"}`}
                    >
                      {message.senderType !== "user" && (
                        <Avatar
                          text={activeParticipant.name}
                          src={sourceUrl(activeParticipant.avatar, assets)}
                          size="sm"
                        />
                      )}
                      <div>
                        <p>{message.content}</p>
                        <time>
                          {new Date(message.createdAt).toLocaleTimeString(
                            "zh-CN",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </time>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="forum-dm-empty">
                    <Avatar
                      text={activeParticipant.name}
                      src={sourceUrl(activeParticipant.avatar, assets)}
                    />
                    <b>{activeParticipant.name}</b>
                    <p>
                      {activeParticipant.persona.slice(0, 100) || "论坛成员"}
                    </p>
                    <small>发送第一条私信开始聊天</small>
                  </div>
                )}
                {generatingThreadIds.has(threadIdOf(server.id, activeParticipant)) && (
                  <div className="forum-dm-typing">对方正在回复…</div>
                )}
                {directErrors[participantKey(activeParticipant)] && (
                  <div className="forum-dm-error" role="alert">
                    {directErrors[participantKey(activeParticipant)]}
                  </div>
                )}
              </section>
              <footer className="forum-dm-composer">
                <textarea
                  rows={1}
                  value={dmText}
                  onChange={(event) => setDmText(event.target.value)}
                  placeholder="发送私信"
                />
                <button
                  disabled={
                    !dmText.trim() ||
                    generatingThreadIds.has(threadIdOf(server.id, activeParticipant))
                  }
                  onClick={() => void sendDirect()}
                >
                  <SendHorizonal />
                </button>
              </footer>
            </>
          ) : (
            <>
              <section className="forum-dm-title">
                <h1>私信</h1>
                <button>
                  <SquarePen />
                </button>
              </section>
              <label className="forum-dm-search">
                <Search />
                <input
                  value={dmQuery}
                  onChange={(event) => setDmQuery(event.target.value)}
                  placeholder="搜索"
                />
                {dmQuery && (
                  <button onClick={() => setDmQuery("")}>
                    <X />
                  </button>
                )}
              </label>
              <section className="forum-dm-list">
                {dmRows.length ? (
                  dmRows.map((participant) => {
                    const thread = threads.find(
                        (item) =>
                          item.id === threadIdOf(server.id, participant),
                      ),
                      last = thread?.messages.at(-1);
                    return (
                      <button
                        key={participantKey(participant)}
                        onClick={() => openDirect(participant)}
                      >
                        <Avatar
                          text={participant.name}
                          src={sourceUrl(participant.avatar, assets)}
                        />
                        <span>
                          <b>{participant.name}</b>
                          <p>
                            {last
                              ? `${last.senderType === "user" ? "你：" : ""}${last.content}`
                              : participant.persona.slice(0, 44) ||
                                "点击开始私信"}
                          </p>
                        </span>
                        <time>
                          {thread ? relativeTime(thread.updatedAt) : ""}
                        </time>
                        {Boolean(thread?.unreadCount) && (
                          <i>{thread!.unreadCount}</i>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="forum-x-empty">
                    <Mail />
                    <b>暂无可私信的成员</b>
                    <p>在论坛设置中添加角色或 NPC。</p>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      ) : section === "likes" ? (
        <main className="forum-liked-page">
          <section className="forum-liked-title">
            <Heart />
            <div>
              <h1>喜欢</h1>
              <p>你在 {server.name} 点赞过的帖子和回复</p>
            </div>
          </section>
          {likedPosts.length > 0 && (
            <section className="forum-liked-group">
              <h2>帖子</h2>
              {likedPosts.map((post) => (
                <button key={post.id} onClick={() => openPost(post.id)}>
                  <AuthorAvatar
                    name={post.authorName}
                    src={authorAvatar(post)}
                    user={post.authorType === "user"}
                    onClick={() => openAuthorProfile(post)}
                  />
                  <div>
                    <header>
                      <b>{post.authorName}</b>
                      <span>{relativeTime(post.createdAt)}</span>
                    </header>
                    <h3>{post.title}</h3>
                    <p>{post.content}</p>
                    {visibleTranslation(
                      post.authorType,
                      post.authorId,
                      post.translation,
                    ) && (
                      <p className="content-translation forum-translation">
                        {visibleTranslation(
                          post.authorType,
                          post.authorId,
                          post.translation,
                        )}
                      </p>
                    )}
                    <footer>
                      <Heart />
                      <span>{reactionCount(post)}</span>
                      <MessageCircle />
                      <span>{post.replies.length}</span>
                    </footer>
                  </div>
                </button>
              ))}
            </section>
          )}
          {likedReplies.length > 0 && (
            <section className="forum-liked-group">
              <h2>回复</h2>
              {likedReplies.map(({ post, item }) => (
                <button
                  key={`${post.id}:${item.id}`}
                  onClick={() => openPost(post.id)}
                >
                  <AuthorAvatar
                    name={item.authorName}
                    src={authorAvatar(item)}
                    user={item.authorType === "user"}
                    onClick={() => openAuthorProfile(item)}
                  />
                  <div>
                    <header>
                      <b>{item.authorName}</b>
                      <span>{relativeTime(item.createdAt)}</span>
                    </header>
                    <p>{item.content}</p>
                    {visibleTranslation(
                      item.authorType,
                      item.authorId,
                      item.translation,
                    ) && (
                      <p className="content-translation forum-translation">
                        {visibleTranslation(
                          item.authorType,
                          item.authorId,
                          item.translation,
                        )}
                      </p>
                    )}
                    <small>回复了帖子《{post.title}》</small>
                    <footer>
                      <Heart />
                      <span>
                        {item.reactions.reduce(
                          (sum, reaction) => sum + reaction.count,
                          0,
                        )}
                      </span>
                    </footer>
                  </div>
                </button>
              ))}
            </section>
          )}
          {likedPosts.length === 0 && likedReplies.length === 0 && (
            <div className="forum-x-empty">
              <Heart />
              <b>还没有喜欢的内容</b>
              <p>在帖子或回复详情中点击爱心，之后会显示在这里。</p>
            </div>
          )}
        </main>
      ) : (
        <main className="forum-user-profile">
          {displayProfileBannerUrl ? (
            <img
              className="forum-user-banner"
              src={displayProfileBannerUrl}
              alt=""
            />
          ) : (
            <div
              className="forum-user-banner"
              style={{
                background: profileAuthor
                  ? "#b8b8ba"
                  : `linear-gradient(135deg,${server.color}55,#ececef)`,
              }}
            />
          )}
          <section className="forum-user-identity">
            <Avatar text={profileDisplayName} src={profileAvatarUrl} />
            <h1>{profileDisplayName}</h1>
            <b>@{profileHandleValue}</b>
            <p>{profileBioValue}</p>
            <small>
              {new Date(profileJoinedAt).toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
              })}{" "}
              加入 {server.name}
            </small>
            <div>
              <span>
                <b>{profileFollowingValue}</b> 正在关注
              </span>
              <span>
                <b>{profileFollowerValue}</b> 关注者
              </span>
            </div>
          </section>
          <nav className="forum-user-tabs">
            <button
              className={profileTab === "posts" ? "active" : ""}
              onClick={() => void changeProfileTab("posts")}
            >
              帖子
            </button>
            <button
              className={profileTab === "replies" ? "active" : ""}
              onClick={() => void changeProfileTab("replies")}
            >
              回复
            </button>
            <button
              className={profileTab === "likes" ? "active" : ""}
              onClick={() => void changeProfileTab("likes")}
            >
              喜欢
            </button>
          </nav>
          <section className="forum-user-posts">
            {profileGenerating ? (
              <div className="forum-profile-generating">
                <Sparkles />
                <b>正在生成内容</b>
                <p>茶茶机正在整理这位用户的论坛活动…</p>
              </div>
            ) : profileTab === "posts" ? (
              displayProfilePosts.length ? (
                displayProfilePosts.map((post) => (
                  <button key={post.id} onClick={() => openPost(post.id)}>
                    <p>{post.content}</p>
                    {visibleTranslation(
                      post.authorType,
                      post.authorId,
                      post.translation,
                    ) && (
                      <p className="content-translation forum-translation">
                        {visibleTranslation(
                          post.authorType,
                          post.authorId,
                          post.translation,
                        )}
                      </p>
                    )}
                    <small>
                      {relativeTime(post.createdAt)} · {post.replies.length}{" "}
                      条回复
                    </small>
                  </button>
                ))
              ) : (
                <div className="forum-x-empty">
                  <MessageCircle />
                  <b>还没有发布帖子</b>
                </div>
              )
            ) : profileTab === "replies" ? (
              displayProfileReplies.length ? (
                displayProfileReplies.map(({ post, item }) => (
                  <button key={item.id} onClick={() => openPost(post.id)}>
                    <p>{item.content}</p>
                    {visibleTranslation(
                      item.authorType,
                      item.authorId,
                      item.translation,
                    ) && (
                      <p className="content-translation forum-translation">
                        {visibleTranslation(
                          item.authorType,
                          item.authorId,
                          item.translation,
                        )}
                      </p>
                    )}
                    <small>回复了《{post.title}》</small>
                  </button>
                ))
              ) : (
                <div className="forum-x-empty">
                  <MessageCircle />
                  <b>还没有回复</b>
                  <p>点击“回复”自动生成内容。</p>
                </div>
              )
            ) : displayProfileLikes.length ? (
              displayProfileLikes.map((post) => (
                <button key={post.id} onClick={() => openPost(post.id)}>
                  <p>{post.content}</p>
                  {visibleTranslation(
                    post.authorType,
                    post.authorId,
                    post.translation,
                  ) && (
                    <p className="content-translation forum-translation">
                      {visibleTranslation(
                        post.authorType,
                        post.authorId,
                        post.translation,
                      )}
                    </p>
                  )}
                  <small>
                    <Heart /> 喜欢了这篇帖子
                  </small>
                </button>
              ))
            ) : (
              <div className="forum-x-empty">
                <Heart />
                <b>还没有喜欢</b>
                <p>点击“喜欢”自动生成内容。</p>
              </div>
            )}
          </section>
        </main>
      )}
      <nav className="forum-community-nav">
        <button
          className={section === "square" ? "active" : ""}
          onClick={() => switchSection("square")}
        >
          <Home />
          <span>广场</span>
        </button>
        <button
          className={section === "messages" ? "active" : ""}
          onClick={() => switchSection("messages")}
        >
          <Mail />
          <span>私信</span>
        </button>
        <button
          className="create"
          onClick={() => setNewPostOpen(true)}
          aria-label="发布帖子"
        >
          <Plus />
        </button>
        <button
          className={section === "likes" ? "active" : ""}
          onClick={() => switchSection("likes")}
        >
          <Heart />
          <span>喜欢</span>
        </button>
        <button
          className={section === "profile" && !profileAuthor ? "active" : ""}
          onClick={() => {
            setProfileAuthor(null);
            switchSection("profile");
          }}
        >
          <UserRound />
          <span>我的</span>
        </button>
      </nav>
      {notice && <div className="forum-toast">{notice}</div>}
      {postMenu && (
        <Modal
          onClose={() => {
            setPostMenu(null);
            setPostDeleteOpen(false);
          }}
        >
          <div className="forum-post-menu">
            {postDeleteOpen ? (
              <>
                <h2>删除这篇帖子？</h2>
                <p>帖子和评论会一并删除，此操作无法撤销。</p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void confirmDeletePost()}
                >
                  {busy ? "删除中…" : "确认删除"}
                </button>
                <button onClick={() => setPostDeleteOpen(false)}>返回</button>
              </>
            ) : (
              <>
                <h2>帖子操作</h2>
                <button
                  className="danger"
                  onClick={() => setPostDeleteOpen(true)}
                >
                  删除帖子
                </button>
                <button onClick={() => setPostMenu(null)}>取消</button>
              </>
            )}
          </div>
        </Modal>
      )}
      {sharePost && (
        <Modal onClose={() => setSharePost(null)}>
          <div className="forum-share-modal">
            <header>
              <div>
                <small>SHARE VIA MESSAGE</small>
                <h2>通过论坛私信分享</h2>
              </div>
              <button onClick={() => setSharePost(null)}>
                <X />
              </button>
            </header>
            <article>
              <b>{sharePost.title}</b>
              <p>{sharePost.content}</p>
            </article>
            <section>
              {participants.length ? (
                participants.map((participant) => (
                  <button
                    key={participantKey(participant)}
                    disabled={Boolean(shareBusyKey)}
                    onClick={() => void sharePostToParticipant(participant)}
                  >
                    <Avatar
                      text={participant.name}
                      src={sourceUrl(participant.avatar, assets)}
                    />
                    <span>
                      <b>{participant.name}</b>
                      <small>
                        {participant.type === "npc" ? "论坛 NPC" : "论坛角色"}
                      </small>
                    </span>
                    <SendHorizonal />
                  </button>
                ))
              ) : (
                <div className="forum-x-empty">
                  <Mail />
                  <b>没有可分享的成员</b>
                  <p>请先在论坛设置中添加角色或 NPC。</p>
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}
      {newPostOpen && (
        <Modal onClose={() => void closePostComposer()}>
          <div className="forum-compose-page">
            <header>
              <button onClick={() => void closePostComposer()}>取消</button>
              <button
                className="publish"
                disabled={
                  (!content.trim() && !postImages.length) ||
                  busy ||
                  postUploading
                }
                onClick={() => void submitPost()}
              >
                {busy ? "发布中…" : "发布"}
              </button>
            </header>
            <main>
              <Avatar
                text={communityProfile.displayName}
                src={settings?.userAvatar}
              />
              <div>
                <textarea
                  autoFocus
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="有什么新鲜事？"
                />
                <div className="forum-compose-media">
                  {postImages.map((image) => (
                    <figure
                      className={image.source === "sticker" ? "sticker" : ""}
                      key={image.id}
                    >
                      {image.source !== "description" && postImageUrl(image) ? (
                        <img
                          src={postImageUrl(image)}
                          alt={image.description}
                        />
                      ) : (
                        <div className="description">
                          <ImagePlus />
                          <p>{image.description}</p>
                        </div>
                      )}
                      <button onClick={() => void removePostImage(image)}>
                        <X />
                      </button>
                    </figure>
                  ))}
                </div>
              </div>
            </main>
            {descriptionOpen && (
              <section className="forum-compose-description">
                <input
                  autoFocus
                  value={imageDescription}
                  onChange={(event) => setImageDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addImageDescription();
                    }
                  }}
                  placeholder="也可以用文字描述一张图片"
                />
                <button
                  disabled={!imageDescription.trim() || postImages.length >= 9}
                  onClick={addImageDescription}
                >
                  <Plus />
                </button>
              </section>
            )}
            <footer>
              <nav>
                <label title="上传图片">
                  <ImagePlus />
                  <input
                    hidden
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(event) =>
                      void uploadPostImages(event.target.files)
                    }
                  />
                </label>
                <button
                  title="添加表情包"
                  onClick={() => setStickerPickerOpen(true)}
                >
                  <SmilePlus />
                </button>
                <button
                  title="添加图片描述"
                  className={descriptionOpen ? "active" : ""}
                  onClick={() => {
                    setDescriptionOpen(true);
                    window.setTimeout(
                      () =>
                        document
                          .querySelector<HTMLInputElement>(
                            ".forum-compose-description input",
                          )
                          ?.focus(),
                      0,
                    );
                  }}
                >
                  <PenLine />
                </button>
                <span>
                  {postUploading ? "正在上传…" : `${postImages.length}/9`}
                </span>
              </nav>
            </footer>
          </div>
        </Modal>
      )}
      {stickerPickerOpen && (
        <StickerPicker
          onClose={() => setStickerPickerOpen(false)}
          onSelect={(_, sticker) => addPostSticker(sticker)}
        />
      )}
      {memberEditing && profileAuthor && (
        <Modal onClose={() => setMemberEditing(false)}>
          <div className="forum-profile-editor forum-member-profile-editor">
            <header>
              <button onClick={() => setMemberEditing(false)}>取消</button>
              <h2>编辑成员资料</h2>
              <button disabled={busy} onClick={() => void saveMemberProfile()}>
                完成
              </button>
            </header>
            <main>
              <section className="forum-profile-editor-card">
                <section className="forum-profile-banner-editor">
                  <b>主页封面</b>
                  <div>
                    {sourceUrl(memberBanner, assets) ? (
                      <img
                        src={sourceUrl(memberBanner, assets)}
                        alt="成员主页封面预览"
                      />
                    ) : (
                      <span className="member-gray-banner">默认纯灰色横幅</span>
                    )}
                  </div>
                  <nav>
                    <label>
                      上传封面
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          void uploadMemberMedia(
                            "banner",
                            event.target.files?.[0],
                          )
                        }
                      />
                    </label>
                    {memberBanner && (
                      <button
                        type="button"
                        onClick={() => setMemberBanner(undefined)}
                      >
                        恢复灰色
                      </button>
                    )}
                  </nav>
                </section>
                <label className="profile-name-row">
                  <span>
                    <b>名字</b>
                    <input
                      maxLength={30}
                      value={memberName}
                      onChange={(event) => setMemberName(event.target.value)}
                    />
                  </span>
                  <label className="forum-member-avatar-upload">
                    <Avatar
                      text={memberName || profileAuthor.authorName}
                      src={sourceUrl(memberAvatar, assets)}
                    />
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        void uploadMemberMedia(
                          "avatar",
                          event.target.files?.[0],
                        )
                      }
                    />
                  </label>
                </label>
                <label>
                  <b>账号</b>
                  <div className="handle-input">
                    <span>@</span>
                    <input
                      maxLength={24}
                      value={memberHandle}
                      onChange={(event) => setMemberHandle(event.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <b>个人简介</b>
                  <textarea
                    rows={3}
                    maxLength={240}
                    value={memberBio}
                    onChange={(event) => setMemberBio(event.target.value)}
                  />
                </label>
                <label>
                  <b>论坛人设与说话风格</b>
                  <textarea
                    rows={6}
                    maxLength={2000}
                    value={memberPersona}
                    onChange={(event) => setMemberPersona(event.target.value)}
                  />
                  <small>
                    只影响该成员在当前论坛的主页、回复、喜欢和私信表现。
                  </small>
                </label>
              </section>
            </main>
          </div>
        </Modal>
      )}
      {profileEditing && (
        <Modal onClose={() => void closeProfileEditor()}>
          <div className="forum-profile-editor">
            <header>
              <button onClick={() => void closeProfileEditor()}>取消</button>
              <h2>编辑主页</h2>
              <button disabled={busy} onClick={() => void saveProfile()}>
                完成
              </button>
            </header>
            <main>
              <section className="forum-profile-editor-card">
                <section className="forum-profile-banner-editor">
                  <b>主页封面</b>
                  <div>
                    {sourceUrl(profileBanner, assets) ? (
                      <img
                        src={sourceUrl(profileBanner, assets)}
                        alt="个人主页封面预览"
                      />
                    ) : (
                      <span>暂无自定义封面，将使用论坛横幅</span>
                    )}
                  </div>
                  <nav>
                    <label>
                      上传封面
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          void uploadProfileBanner(event.target.files?.[0])
                        }
                      />
                    </label>
                    {profileBanner && (
                      <button
                        type="button"
                        onClick={() => void removeProfileBanner()}
                      >
                        移除封面
                      </button>
                    )}
                  </nav>
                </section>
                <label className="profile-name-row">
                  <span>
                    <b>名字</b>
                    <input
                      maxLength={30}
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      placeholder="输入名称"
                    />
                  </span>
                  <Avatar
                    text={profileName || communityProfile.displayName}
                    src={settings?.userAvatar}
                  />
                </label>
                <label>
                  <b>账号</b>
                  <div className="handle-input">
                    <span>@</span>
                    <input
                      maxLength={24}
                      value={profileHandle}
                      onChange={(event) => setProfileHandle(event.target.value)}
                      placeholder="社区 ID"
                    />
                  </div>
                </label>
                <label>
                  <b>个人简介</b>
                  <textarea
                    rows={2}
                    maxLength={240}
                    value={profileBio}
                    onChange={(event) => setProfileBio(event.target.value)}
                    placeholder="+ 留下个人简介"
                  />
                </label>
                <div className="profile-count-editor">
                  <label>
                    <b>正在关注</b>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      value={profileFollowing}
                      onChange={(event) =>
                        setProfileFollowing(
                          Math.max(0, Number(event.target.value) || 0),
                        )
                      }
                    />
                  </label>
                  <label>
                    <b>关注者</b>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      value={profileFollowers}
                      onChange={(event) =>
                        setProfileFollowers(
                          Math.max(0, Number(event.target.value) || 0),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="forum-chat-interop-toggle">
                  <span>
                    <b>匿名模式</b>
                    <small>
                      仅影响开启后发布的新帖子、回复和私信；对方只知道你是匿名陌生人
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={profileAnonymous}
                    onChange={(event) =>
                      setProfileAnonymous(event.target.checked)
                    }
                  />
                  <i />
                </label>
                <section className="forum-chat-interop">
                  <label className="forum-chat-interop-toggle">
                    <span>
                      <b>与角色聊天内容互通</b>
                      <small>
                        允许所选角色在论坛和私聊中共享相关经历与上下文
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={profileInterop}
                      onChange={(event) =>
                        setProfileInterop(event.target.checked)
                      }
                    />
                    <i />
                  </label>
                  {profileInterop && (
                    <div>
                      <p>选择互通角色</p>
                      {forumCharacters.length ? (
                        forumCharacters.map((character) => (
                          <button
                            type="button"
                            key={character.id}
                            className={
                              profileInteropCharacters.includes(character.id)
                                ? "selected"
                                : ""
                            }
                            onClick={() =>
                              setProfileInteropCharacters((current) =>
                                current.includes(character.id)
                                  ? current.filter((id) => id !== character.id)
                                  : [...current, character.id],
                              )
                            }
                          >
                            <Avatar
                              text={character.name}
                              src={character.avatar}
                              size="sm"
                            />
                            <span>
                              <b>{character.name}</b>
                              <small>{character.bio || "论坛角色"}</small>
                            </span>
                            <i>
                              {profileInteropCharacters.includes(
                                character.id,
                              ) && <Users />}
                            </i>
                          </button>
                        ))
                      ) : (
                        <small>当前论坛还没有添加可互通的角色。</small>
                      )}
                    </div>
                  )}
                </section>
                <label>
                  <b>在该社区的设定</b>
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={profilePersona}
                    onChange={(event) => setProfilePersona(event.target.value)}
                    placeholder="+ 添加在该社区中的身份、经历和关系设定"
                  />
                  <small>
                    该设定仅在当前论坛中使用，并会进入论坛私信上下文。
                  </small>
                </label>
              </section>
            </main>
          </div>
        </Modal>
      )}
      {characterPicker && selectedPost && (
        <Modal onClose={() => setCharacterPicker(false)}>
          <div className="forum-character-picker">
            <header>
              <div>
                <small>INVITE CHARACTER</small>
                <h2>邀请角色回复</h2>
              </div>
              <button onClick={() => setCharacterPicker(false)}>
                <X />
              </button>
            </header>
            <p>仅显示已添加到当前论坛的角色。</p>
            <div>
              {forumCharacters.map((character) => (
                <button
                  key={character.id}
                  disabled={busy}
                  onClick={() => void inviteCharacter(character.id)}
                >
                  <Avatar text={character.name} src={character.avatar} />
                  <span>
                    <b>{character.name}</b>
                    <small>
                      {character.bio || character.relationship.mood}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

