import { z } from "zod";
import { db } from "./db";
import {localTimeContext} from "./localTime";
import {
  chatSettingsOf,
  coreSettingOf,
  languageStyleInstruction,
  personaOf,
} from "./character";
import { canCharacterInteract } from "./conversationSettings";
import { autoTranslateCharacter, completedTranslation } from "./bilingual";
import { deleteMediaIfUnused } from "./mediaAssets";
import { OpenAIProvider, ProviderError } from "./provider";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type AppSettings,
  type Character,
  type ForumActivitySettings,
  type ForumChannel,
  type ForumCharacterQuota,
  type ForumCommunityProfile,
  type ForumDirectMessage,
  type ForumDirectThread,
  type ForumImageSource,
  type ForumNpc,
  type ForumPost,
  type ForumPostImage,
  type ForumReaction,
  type ForumReactionKind,
  type ForumReply,
  type ForumServer,
  type ProviderSettings,
  type Language,
} from "./types";

export const FORUM_STARTER_VERSION_KEY = "forum-starter-v2";
export const FORUM_HOME_SERVER_ID = "forum-server-chacha";
export const MATCHA_FORUM_INTRODUCTION = `这是一个类似 X（Twitter）的纯文字公共论坛：不同类型的人同时存在于这里：专业人士、普通用户、创作者、新闻账号、粉丝群体、营销账号、机器人账号、争议人物以及各种边缘社区成员。

论坛的核心特点是“即时、直接、混杂”。用户发布内容通常不是经过编辑的完整文章，而是当下产生的想法、情绪、观点、反应和信息碎片。可以是一句突然想到的话、一段个人看法、一个吐槽、一个问题、一个八卦吃瓜的帖子或者一个引发争论的话题。用户表达方式更加直接，不一定客观正确，经常带有个人偏见、情绪、立场和主观判断。

评论区的回复呈现复杂的人类互动：有人认真补充事实、分享经验知识；有人提出反对意见，挑战原帖观点；有人进行辩论甚至争吵；有人用讽刺、阴阳怪气、玩梗表达态度；有人只回复几个字表达支持、嘲笑或不屑；有人故意挑衅，引发冲突获得关注；有人完全误解内容，发表无关观点；还有关于nsfw视频的引流机器人

不同话题会形成不同评论生态。娱乐话题可能充满粉丝争论；争议事件可能出现大量情绪化回复和互相攻击。

阴暗面包括但不限于网络喷子和攻击性用户；为了流量制造争议的人；虚假信息传播者；复制粘贴式营销账号；自动机器人账号；垃圾回复和无意义互动；诈骗、推广；成人内容相关账号留下的诱导关注或引流回复；利用热点事件吸引流量的账号。这些低质量内容不会完全消失，而是与正常用户交流混杂在一起，形成真实社交平台中的噪音。

论坛中也应该存在成人话题、擦边内容和边缘亚文化讨论，但它们只是一小部分，而不是唯一主题。用户可能讨论现实社会中敏感、争议或不方便公开讨论的话题，表达方式大胆直接粗俗。

整体用户心理应该更加接近真实互联网：有人想分享；有人想获得关注；有人想证明自己；有人寻找同类；有人想娱乐别人；有人想发泄情绪；有人故意制造混乱等等

生成帖子和评论时，不要让所有用户都理性、聪明、有礼貌，也不要让所有内容都具有价值。真实的互联网应该包含高质量观点、普通人的碎片表达、无聊内容、幽默内容、冲突内容和垃圾信息。语言风格通常是说话很冲 不装客气；非常多阴阳怪气；玩梗；看戏型；故意挑衅；成人/擦边生态语言；容易被热点带节奏；说话直接粗俗等等。`;
const reactionKinds: ForumReactionKind[] = [
  "like",
  "heart",
  "laugh",
  "insightful",
];
const emptyReactions = (): ForumReaction[] =>
  reactionKinds.map((kind) => ({ kind, count: 0, reacted: false }));
export function forumHandleOf(name: string, id = "") {
  const ascii = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (ascii)
    return `@${ascii.slice(0, 16)}${
      id
        ? `_${id
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(-4)
            .toLowerCase()}`
        : ""
    }`;
  const hash = [...`${name}:${id}`]
    .reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7)
    .toString(36)
    .slice(-6);
  return `@user_${hash}`;
}
const strip = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
const parseJson = (text: string) => {
  try {
    return JSON.parse(strip(text));
  } catch {
    throw new ProviderError("format", "模型没有返回有效 JSON");
  }
};
export const defaultForumActivitySettings = (): ForumActivitySettings => ({
  enabled: false,
  intervalMinutes: 1440,
  postsPerRun: 10,
  repliesPerRun: 20,
  directMessagesPerRun: 2,
  characterQuotas: {},
});
const normalizeQuota = (
  value?: Partial<ForumCharacterQuota>,
): ForumCharacterQuota => ({
  enabled: value?.enabled ?? true,
  postsPerRun: Math.max(0, Math.min(50, Math.trunc(value?.postsPerRun ?? 0))),
  repliesPerRun: Math.max(
    0,
    Math.min(100, Math.trunc(value?.repliesPerRun ?? 0)),
  ),
});
export function normalizeForumServer(server: ForumServer): ForumServer {
  const base = defaultForumActivitySettings(),
    activity = server.activitySettings,
    { intervalHours: _legacyHours, ...activityWithoutLegacy } = activity ?? {},
    intervalMinutes =
      activity?.intervalMinutes ??
      Math.round((activity?.intervalHours ?? 24) * 60);
  return {
    ...server,
    description: server.description ?? "",
    introduction: server.introduction ?? "",
    characterIds: [...new Set(server.characterIds ?? [])],
    npcs: (server.npcs ?? []).map((npc) => ({
      ...npc,
      handle: npc.handle
        ? npc.handle.startsWith("@")
          ? npc.handle
          : `@${npc.handle}`
        : forumHandleOf(npc.name, npc.id),
      enabled: npc.enabled ?? true,
      updatedAt: npc.updatedAt ?? npc.createdAt,
    })),
    loreBookIds: [...new Set(server.loreBookIds ?? [])],
    activitySettings: {
      ...base,
      ...activityWithoutLegacy,
      enabled: activity?.enabled ?? false,
      intervalMinutes: Math.max(
        1,
        Math.min(43200, Math.trunc(intervalMinutes)),
      ),
      postsPerRun: Math.max(
        0,
        Math.min(100, Math.trunc(activity?.postsPerRun ?? 10)),
      ),
      repliesPerRun: Math.max(
        0,
        Math.min(300, Math.trunc(activity?.repliesPerRun ?? 20)),
      ),
      directMessagesPerRun: Math.max(
        0,
        Math.min(20, Math.trunc(activity?.directMessagesPerRun ?? 2)),
      ),
      characterQuotas: Object.fromEntries(
        Object.entries(activity?.characterQuotas ?? {}).map(([id, value]) => [
          id,
          normalizeQuota(value),
        ]),
      ),
    },
  };
}
function starterPost(input: {
  id: string;
  channelId: string;
  title: string;
  content: string;
  authorName: string;
  authorHandle?: string;
  createdAt: number;
  tags?: string[];
  pinned?: boolean;
  author?: Character;
}): ForumPost {
  return {
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    channelId: input.channelId,
    authorType: input.author ? "character" : "system",
    authorId: input.author?.id,
    authorName: input.author?.name ?? input.authorName,
    authorHandle:
      input.authorHandle ??
      (input.author
        ? forumHandleOf(input.author.name, input.author.id)
        : forumHandleOf(input.authorName, input.id)),
    authorAvatar: input.author?.avatar
      ? { type: "url", value: input.author.avatar }
      : undefined,
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    reactions: emptyReactions(),
    replies: [],
    lastActivityAt: input.createdAt,
  };
}

export async function ensureForumStarterData(characters: Character[] = []) {
  const [existing, initialized] = await Promise.all([
    db.forumServers.toArray(),
    db.settings.get(FORUM_STARTER_VERSION_KEY),
  ]);
  const version = Number(initialized?.value) || 0;
  if (existing.length) {
    if (version < 3) {
      await deleteForumCommunity("forum-server-story");
      await deleteForumCommunity("forum-server-life");
    }
    if (version >= 5) return;
    const t = now(),
      current = await db.forumServers.toArray(),
      normalized = current.map(normalizeForumServer),
      migrated = normalized.map((server) => {
        if (server.id !== FORUM_HOME_SERVER_ID) return server;
        const branded =
          version >= 2
            ? server
            : {
                ...server,
                name: "matcha",
                description: "matcha phone：X",
                iconText: "matcha",
                color: "#ffffff",
                avatar: {
                  type: "url" as const,
                  value: "/matcha-community-icon.svg",
                },
                banner: {
                  type: "url" as const,
                  value: "/matcha-community-banner.png",
                },
              };
        return {
          ...branded,
          introduction: MATCHA_FORUM_INTRODUCTION,
          updatedAt: t,
        };
      }),
      channelIds = (
        await db.forumChannels
          .where("serverId")
          .equals(FORUM_HOME_SERVER_ID)
          .toArray()
      ).map((channel) => channel.id),
      posts = channelIds.length
        ? await db.forumPosts.where("channelId").anyOf(channelIds).toArray()
        : [],
      postIds = posts.map((post) => post.id),
      assetIds = new Set<string>();
    const addSourceAsset = (source?: ForumImageSource) => {
      if (source?.type === "asset") assetIds.add(source.value);
    };
    for (const post of posts) {
      addSourceAsset(post.authorAvatar);
      for (const image of post.images ?? [])
        if (
          (image.source === "asset" || image.source === "sticker") &&
          image.assetId
        )
          assetIds.add(image.assetId);
      for (const reply of post.replies) addSourceAsset(reply.authorAvatar);
    }
    await db.transaction(
      "rw",
      [db.forumServers, db.forumPosts, db.settings],
      async () => {
        await db.forumServers.bulkPut(migrated);
        if (postIds.length) await db.forumPosts.bulkDelete(postIds);
        await db.settings.put({ key: FORUM_STARTER_VERSION_KEY, value: 5 });
      },
    );
    for (const assetId of assetIds) await deleteMediaIfUnused(assetId);
    return;
  }

  const t = now(),
    server: ForumServer = {
      id: FORUM_HOME_SERVER_ID,
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      name: "matcha",
      description: "matcha phone：X",
      introduction: MATCHA_FORUM_INTRODUCTION,
      iconText: "matcha",
      color: "#ffffff",
      avatar: { type: "url", value: "/matcha-community-icon.svg" },
      banner: { type: "url", value: "/matcha-community-banner.png" },
      characterIds: characters.slice(0, 2).map((item) => item.id),
      npcs: [],
      loreBookIds: [],
      activitySettings: defaultForumActivitySettings(),
      order: 0,
    },
    channels: ForumChannel[] = [
      {
        id: "forum-channel-welcome",
        schemaVersion: SCHEMA_VERSION,
        createdAt: t,
        updatedAt: t,
        serverId: FORUM_HOME_SERVER_ID,
        name: "公告与规则",
        topic: "社区公告、新人指南和重要更新",
        kind: "announcement",
        order: 0,
      },
      {
        id: "forum-channel-general",
        schemaVersion: SCHEMA_VERSION,
        createdAt: t,
        updatedAt: t,
        serverId: FORUM_HOME_SERVER_ID,
        name: "综合讨论",
        topic: "任何想聊的话题都可以从这里开始",
        kind: "forum",
        order: 1,
      },
      {
        id: "forum-channel-characters",
        schemaVersion: SCHEMA_VERSION,
        createdAt: t,
        updatedAt: t,
        serverId: FORUM_HOME_SERVER_ID,
        name: "角色茶话会",
        topic: "和角色有关的日常、关系和脑洞",
        kind: "forum",
        order: 2,
      },
    ];
  await db.transaction(
    "rw",
    [db.forumServers, db.forumChannels, db.settings],
    async () => {
      await db.forumServers.put(server);
      await db.forumChannels.bulkPut(channels);
      await db.settings.put({ key: FORUM_STARTER_VERSION_KEY, value: 5 });
    },
  );
}
export async function createForumCommunity(input: {
  name: string;
  description: string;
  introduction?: string;
  iconText: string;
  color: string;
  authorName: string;
  avatar?: ForumImageSource;
  banner?: ForumImageSource;
  characterIds?: string[];
  npcs?: ForumNpc[];
  loreBookIds?: string[];
  activitySettings?: ForumActivitySettings;
}) {
  const t = now(),
    serverId = uid(),
    announcementId = uid(),
    generalId = uid(),
    server = normalizeForumServer({
      id: serverId,
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      name: input.name.trim(),
      description: input.description.trim() || "一个新的本地论坛",
      introduction: input.introduction?.trim() ?? "",
      iconText:
        input.iconText.trim().slice(0, 2) || input.name.trim().slice(0, 1),
      color: input.color,
      avatar: input.avatar,
      banner: input.banner,
      characterIds: input.characterIds ?? [],
      npcs: input.npcs ?? [],
      loreBookIds: input.loreBookIds ?? [],
      activitySettings:
        input.activitySettings ?? defaultForumActivitySettings(),
      order: await db.forumServers.count(),
    }),
    channels: ForumChannel[] = [
      {
        id: announcementId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: t,
        updatedAt: t,
        serverId,
        name: "公告与规则",
        topic: "论坛公告、规则和重要更新",
        kind: "announcement",
        order: 0,
      },
      {
        id: generalId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: t,
        updatedAt: t,
        serverId,
        name: "综合讨论",
        topic: "分享想法并开始新的讨论",
        kind: "forum",
        order: 1,
      },
    ],
    welcome = starterPost({
      id: uid(),
      channelId: announcementId,
      title: `欢迎来到${input.name.trim()}`,
      content: `这里是${input.name.trim()}的第一个公告主题。`,
      authorName: input.authorName,
      createdAt: t,
      pinned: true,
      tags: ["公告"],
    });
  welcome.authorType = "user";
  await db.transaction(
    "rw",
    [db.forumServers, db.forumChannels, db.forumPosts],
    async () => {
      await db.forumServers.add(server);
      await db.forumChannels.bulkAdd(channels);
      await db.forumPosts.add(welcome);
    },
  );
  return { server, channels, welcome };
}
export async function updateForumCommunity(
  serverId: string,
  patch: Partial<ForumServer>,
) {
  const current = await db.forumServers.get(serverId);
  if (!current) throw new Error("论坛不存在");
  const next = normalizeForumServer({
    ...current,
    ...patch,
    id: current.id,
    updatedAt: now(),
  });
  await db.forumServers.put(next);
  return next;
}
function sourceAssetId(source?: ForumImageSource) {
  return source?.type === "asset" ? source.value : undefined;
}
export async function deleteForumCommunity(serverId: string) {
  const server = await db.forumServers.get(serverId);
  if (!server) return;
  const channels = await db.forumChannels
      .where("serverId")
      .equals(serverId)
      .toArray(),
    channelIds = channels.map((item) => item.id),
    posts = channelIds.length
      ? await db.forumPosts.where("channelId").anyOf(channelIds).toArray()
      : [],
    assets = new Set<string>();
  [
    sourceAssetId(server.avatar),
    sourceAssetId(server.banner),
    sourceAssetId(server.userProfile?.banner),
    ...(server.npcs ?? []).map((npc) => sourceAssetId(npc.avatar)),
    ...(server.directThreads ?? []).map((thread) =>
      sourceAssetId(thread.participantAvatar),
    ),
    ...posts.flatMap((post) => [
      sourceAssetId(post.authorAvatar),
      ...(post.images ?? []).map((image) =>
        image.source === "asset" || image.source === "sticker"
          ? image.assetId
          : undefined,
      ),
      ...post.replies.map((reply) => sourceAssetId(reply.authorAvatar)),
    ]),
  ]
    .filter(Boolean)
    .forEach((id) => assets.add(id!));
  await db.transaction(
    "rw",
    [db.forumServers, db.forumChannels, db.forumPosts],
    async () => {
      await db.forumServers.delete(serverId);
      await db.forumChannels.where("serverId").equals(serverId).delete();
      if (channelIds.length)
        await db.forumPosts.where("channelId").anyOf(channelIds).delete();
    },
  );
  for (const id of assets) await deleteMediaIfUnused(id);
}
export async function deleteForumPost(postId: string) {
  const post = await db.forumPosts.get(postId);
  if (!post) return;
  const assets = (post.images ?? [])
    .map((image) => image.assetId)
    .filter((id): id is string => Boolean(id));
  await db.forumPosts.delete(postId);
  for (const id of assets) await deleteMediaIfUnused(id);
}
export async function createForumPost(input: {
  channelId: string;
  title: string;
  content: string;
  tags?: string[];
  images?: ForumPostImage[];
  authorName: string;
  authorHandle?: string;
  authorAvatar?: ForumImageSource;
  authorAnonymous?: boolean;
  authorPersonaSnapshot?: string;
  authorOrigin?: "configured" | "generated";
}) {
  const t = now(),
    post: ForumPost = {
      id: uid(),
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      channelId: input.channelId,
      authorType: "user",
      authorName: input.authorName,
      authorHandle:
        input.authorHandle ?? forumHandleOf(input.authorName, input.channelId),
      authorAvatar: input.authorAvatar,
      authorAnonymous: input.authorAnonymous,
      authorPersonaSnapshot: input.authorPersonaSnapshot,
      authorOrigin: input.authorOrigin,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: (input.tags ?? [])
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      images: (input.images ?? []).slice(0, 9),
      pinned: false,
      reactions: emptyReactions(),
      replies: [],
      lastActivityAt: t,
    };
  await db.forumPosts.add(post);
  return post;
}
export async function addForumReply(
  postId: string,
  input: {
    content: string;
    translation?: ForumReply["translation"];
    authorName: string;
    authorType?: "user" | "character" | "npc" | "system";
    authorId?: string;
    authorHandle?: string;
    authorAvatar?: ForumImageSource;
    replyToId?: string;
    replyToName?: string;
    generationEventId?: string;
    authorAnonymous?: boolean;
    authorPersonaSnapshot?: string;
    authorOrigin?: "configured" | "generated";
  },
) {
  const post = await db.forumPosts.get(postId);
  if (!post) throw new Error("主题已不存在");
  const t = now(),
    reply: ForumReply = {
      id: uid(),
      authorType: input.authorType ?? "user",
      authorId: input.authorId,
      authorName: input.authorName,
      authorHandle:
        input.authorHandle ?? forumHandleOf(input.authorName, postId),
      authorAvatar: input.authorAvatar,
      authorAnonymous: input.authorAnonymous,
      authorPersonaSnapshot: input.authorPersonaSnapshot,
      authorOrigin: input.authorOrigin,
      content: input.content.trim(),
      translation: input.translation,
      createdAt: t,
      replyToId: input.replyToId,
      replyToName: input.replyToName,
      reactions: emptyReactions(),
      generationEventId: input.generationEventId,
    };
  await db.forumPosts.update(postId, {
    replies: [...post.replies, reply],
    lastActivityAt: t,
    updatedAt: t,
  });
  return reply;
}
export async function incrementForumPostShare(postId: string) {
  const post = await db.forumPosts.get(postId);
  if (!post) throw new Error("帖子不存在");
  await db.forumPosts.update(postId, {
    shareCount: (post.shareCount ?? 0) + 1,
    updatedAt: now(),
  });
  return (post.shareCount ?? 0) + 1;
}
export async function toggleForumPostReaction(
  postId: string,
  kind: ForumReactionKind,
) {
  const post = await db.forumPosts.get(postId);
  if (!post) return;
  await db.forumPosts.update(postId, {
    reactions: post.reactions.map((reaction) =>
      reaction.kind === kind
        ? {
            ...reaction,
            reacted: !reaction.reacted,
            count: Math.max(0, reaction.count + (reaction.reacted ? -1 : 1)),
          }
        : reaction,
    ),
    updatedAt: now(),
  });
}
export async function toggleForumReplyReaction(
  postId: string,
  replyId: string,
  kind: ForumReactionKind,
) {
  const post = await db.forumPosts.get(postId);
  if (!post) return;
  await db.forumPosts.update(postId, {
    replies: post.replies.map((reply) =>
      reply.id !== replyId
        ? reply
        : {
            ...reply,
            reactions: reply.reactions.map((reaction) =>
              reaction.kind === kind
                ? {
                    ...reaction,
                    reacted: !reaction.reacted,
                    count: Math.max(
                      0,
                      reaction.count + (reaction.reacted ? -1 : 1),
                    ),
                  }
                : reaction,
            ),
          },
    ),
    updatedAt: now(),
  });
}
export function searchForumPosts(posts: ForumPost[], query: string) {
  const value = query.trim().toLocaleLowerCase();
  if (!value) return posts;
  return posts.filter((post) =>
    [
      post.title,
      post.content,
      post.authorName,
      post.tags.join(" "),
      post.replies.map((reply) => reply.content).join(" "),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(value),
  );
}

const npcSchema = z
  .object({
    name: z.string().trim().min(1).max(30),
    persona: z.string().trim().min(1).max(300),
  })
  .strict();
export async function generateForumNpcProfile(
  provider: ProviderSettings,
  keywords: string,
  signal?: AbortSignal,
) {
  if (!provider.apiKey.trim()) throw new Error("尚未配置聊天模型");
  const raw = await new OpenAIProvider({ ...provider, stream: false }).chat(
      [
        {
          role: "system",
          content: "你为虚构本地论坛创建公开可见的简化 NPC，只输出严格 JSON。",
        },
        {
          role: "user",
          content: `根据关键词创建一个论坛 NPC：${keywords}\n只返回 {"name":"姓名","persona":"一句不超过120字的人设"}`,
        },
      ],
      { stream: false, signal },
    ),
    parsed = npcSchema.safeParse(parseJson(raw));
  if (!parsed.success) throw new ProviderError("format", "NPC 格式无法识别");
  return parsed.data;
}

type ForumActor = {
  type: "character" | "npc";
  id: string;
  name: string;
  handle: string;
  avatar?: ForumImageSource;
  persona: string;
  language?: Language;
};
const generatedPostsSchema = z
  .object({
    posts: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(100),
            titleTranslation: z.string().trim().optional(),
            content: z.string().trim().min(1).max(4000),
            translation: z.string().trim().optional(),
            tags: z.array(z.string()).max(5).default([]),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
const generatedRepliesSchema = z
  .object({
    replies: z
      .array(
        z
          .object({
            postId: z.string().optional(),
            content: z.string().trim().min(1).max(1000),
            translation: z.string().trim().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export interface ForumGenerationJob {
  actor: ForumActor;
  posts: number;
  replies: number;
}
export function planForumGeneration(
  server: ForumServer,
  characters: Character[],
) {
  const normalized = normalizeForumServer(server),
    settings = normalized.activitySettings!;
  const activeCharacters = (normalized.characterIds ?? [])
    .map((id) => characters.find((item) => item.id === id))
    .filter((item): item is Character =>
      Boolean(item && canCharacterInteract(item)),
    );
  const npcs = (normalized.npcs ?? []).filter((item) => item.enabled),
    jobs: ForumGenerationJob[] = [];
  const quotaPosts = activeCharacters.reduce(
    (sum, item) =>
      sum +
      (settings.characterQuotas[item.id]?.enabled === false
        ? 0
        : (settings.characterQuotas[item.id]?.postsPerRun ?? 0)),
    0,
  );
  const quotaReplies = activeCharacters.reduce(
    (sum, item) =>
      sum +
      (settings.characterQuotas[item.id]?.enabled === false
        ? 0
        : (settings.characterQuotas[item.id]?.repliesPerRun ?? 0)),
    0,
  );
  const postTarget = Math.max(settings.postsPerRun, quotaPosts),
    replyTarget = Math.max(settings.repliesPerRun, quotaReplies);
  for (const character of activeCharacters) {
    const quota = normalizeQuota(settings.characterQuotas[character.id]);
    if (!quota.enabled) continue;
    jobs.push({
      actor: {
        type: "character",
        id: character.id,
        name: character.name,
        handle: forumHandleOf(character.name, character.id),
        avatar: character.avatar
          ? { type: "url", value: character.avatar }
          : undefined,
        persona: `${coreSettingOf(character)}\n${personaOf(character)}`,
        language: chatSettingsOf(character).language,
      },
      posts: quota.postsPerRun,
      replies: quota.repliesPerRun,
    });
  }
  let remainingPosts = postTarget - quotaPosts,
    remainingReplies = replyTarget - quotaReplies;
  let fillActors: ForumActor[] = npcs.length
    ? npcs.map((npc) => ({
        type: "npc",
        id: npc.id,
        name: npc.name,
        handle: npc.handle
          ? npc.handle.startsWith("@")
            ? npc.handle
            : `@${npc.handle}`
          : forumHandleOf(npc.name, npc.id),
        avatar: npc.avatar,
        persona: npc.persona,
      }))
    : activeCharacters.map((character) => ({
        type: "character",
        id: character.id,
        name: character.name,
        handle: forumHandleOf(character.name, character.id),
        avatar: character.avatar
          ? { type: "url", value: character.avatar }
          : undefined,
        persona: `${coreSettingOf(character)}\n${personaOf(character)}`,
        language: chatSettingsOf(character).language,
      }));
  if (!fillActors.length) {
    const seed = normalized.name.replace(/\s+/g, "").slice(0, 8) || "matcha";
    fillActors = [
      {
        type: "npc",
        id: `generated:${normalized.id}`,
        name: `${seed}路人`,
        handle: forumHandleOf(`${seed}路人`, normalized.id),
        persona: `根据论坛“${normalized.name}”的简介和介绍自然形成的普通人类用户。身份、职业、性格和表达方式由每次生成内容决定。`,
      },
    ];
  }
  if (fillActors.length) {
    let index = 0;
    while (remainingPosts > 0 || remainingReplies > 0) {
      const actor = fillActors[index % fillActors.length],
        existing = jobs.find(
          (job) => job.actor.id === actor.id && job.actor.type === actor.type,
        ),
        posts = remainingPosts > 0 ? 1 : 0,
        replies = remainingReplies > 0 ? 1 : 0;
      if (existing) {
        existing.posts += posts;
        existing.replies += replies;
      } else jobs.push({ actor, posts, replies });
      remainingPosts -= posts;
      remainingReplies -= replies;
      index++;
    }
  }
  return { jobs, postTarget, replyTarget };
}
async function forumLore(server: ForumServer) {
  const ids = new Set(server.loreBookIds ?? []),
    books = (await db.loreBooks.toArray()).filter(
      (book) => ids.has(book.id) && book.enabled,
    );
  return books
    .flatMap((book) =>
      book.entries
        .filter((entry) => entry.enabled)
        .sort((a, b) => b.priority - a.priority)
        .map((entry) => `${entry.title ?? "设定"}：${entry.content}`),
    )
    .join("\n");
}
async function recentForumPosts(serverId: string) {
  const channelIds = (
    await db.forumChannels.where("serverId").equals(serverId).toArray()
  ).map((item) => item.id);
  if (!channelIds.length) return [];
  return (await db.forumPosts.where("channelId").anyOf(channelIds).toArray())
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .slice(0, 30);
}
async function forumPrivateChatContext(
  server: ForumServer,
  actor: Pick<ForumActor, "type" | "id" | "name" | "persona">,
) {
  const interop = server.userProfile?.chatInterop;
  if (
    actor.type !== "character" ||
    !interop?.enabled ||
    !interop.characterIds.includes(actor.id)
  )
    return "";
  const conversations = await db.conversations
      .where("memberIds")
      .equals(actor.id)
      .toArray(),
    conversation = conversations.find((item) => item.type === "private");
  if (!conversation) return "";
  const messages = (
    await db.messages
      .where("conversationId")
      .equals(conversation.id)
      .sortBy("createdAt")
  )
    .filter((message) => message.status === "complete")
    .slice(-20);
  if (!messages.length) return "";
  const userName = server.userProfile?.displayName || "用户";
  return messages
    .map(
      (message) =>
        `${message.senderType === "user" ? userName : actor.name}：${message.content}`,
    )
    .join("\n");
}
export async function forumInteropContextForChat(characterId: string) {
  const servers = (await db.forumServers.toArray())
    .map(normalizeForumServer)
    .filter(
      (server) =>
        server.userProfile?.chatInterop?.enabled &&
        server.userProfile.chatInterop.characterIds.includes(characterId),
    );
  if (!servers.length) return "";
  const [channels, posts] = await Promise.all([
      db.forumChannels.toArray(),
      db.forumPosts.toArray(),
    ]),
    sections: string[] = [];
  for (const server of servers) {
    const channelIds = new Set(
        channels
          .filter((channel) => channel.serverId === server.id)
          .map((channel) => channel.id),
      ),
      forumPosts = posts
        .filter((post) => channelIds.has(post.channelId))
        .sort((a, b) => b.lastActivityAt - a.lastActivityAt),
      profile = server.userProfile!,
      snippets: string[] = [];
    for (const post of forumPosts) {
      if (post.authorId === characterId || post.authorType === "user")
        snippets.push(
          `帖子｜${post.authorName}：${post.title}——${post.content.slice(0, 180)}`,
        );
      for (const reply of post.replies)
        if (reply.authorId === characterId || reply.authorType === "user")
          snippets.push(
            `回复《${post.title}》｜${reply.authorName}：${reply.content.slice(0, 180)}`,
          );
      if (snippets.length >= 12) break;
    }
    const direct = (server.directThreads ?? []).find(
      (thread) =>
        thread.participantType === "character" &&
        thread.participantId === characterId,
    );
    for (const message of direct?.messages.slice(-8) ?? [])
      snippets.push(
        `论坛私信｜${message.senderType === "user" ? profile.displayName : direct!.participantName}：${message.content.slice(0, 180)}`,
      );
    sections.push(
      `社区：${server.name}\n用户社区身份：${profile.displayName}（@${profile.handle}）\n用户社区设定：${profile.persona || "无"}\n${snippets.slice(-16).join("\n") || "暂无相关论坛互动"}`,
    );
  }
  return `用户已允许以下论坛内容与当前角色私聊互通。把这些内容视为双方共同经历，但不要逐字复述：\n${sections.join("\n\n")}`;
}
async function generateActorPosts(input: {
  server: ForumServer;
  actor: ForumActor;
  count: number;
  provider: ProviderSettings;
  eventId: string;
  channelId: string;
}) {
  if (input.count <= 0) return 0;
  const recent = await recentForumPosts(input.server.id),
    lore = await forumLore(input.server),
    chatContext = await forumPrivateChatContext(input.server, input.actor),
    recentTopics = recent.map((post) => ({
      title: post.title,
      content: post.content.slice(0, 240),
    }));
  const character =
      input.actor.type === "character"
        ? await db.characters.get(input.actor.id)
        : undefined,
    bilingual = character ? autoTranslateCharacter(character) : false;
  const prompt = `${localTimeContext({enabled:true,label:"论坛当前时间"})}\n论坛：${input.server.name}\n简介：${input.server.description}\n介绍：${input.server.introduction || "无"}\n世界书：${lore || "无"}\n互通的近期角色私聊：${chatContext || "未开启或暂无"}\n参与者：${input.actor.name}（${input.actor.handle}）\n人设：${input.actor.persona}\n${languageStyleInstruction(input.actor.language ?? "中文")}\n先生成 ${input.count} 篇新帖，不要生成回复。\n近期主题：${JSON.stringify(recentTopics)}\n避免重复近期主题。只返回严格 JSON：{"posts":[{"title":"标题","content":"正文"}]}`;
  const raw = await new OpenAIProvider({
      ...input.provider,
      stream: false,
    }).chat(
      [
        {
          role: "system",
          content:
            "你以虚构角色身份参与 matcha 论坛，模拟 X 风格的公开时间线，只输出严格 JSON。帖子要像真实用户发的短帖：有明确观点、生活细节或即时反应，40–280 字，允许自然使用 @账号；不要生成结构化话题标签。title 只是内部摘要，不要在 content 中重复标题。",
        },
        { role: "user", content: prompt },
      ],
      { stream: false },
    ),
    parsed = generatedPostsSchema.safeParse(parseJson(raw));
  if (
    bilingual &&
    parsed.success &&
    parsed.data.posts.some(
      (post) => !post.translation?.trim() || !post.titleTranslation?.trim(),
    )
  )
    throw new ProviderError(
      "format",
      "Bilingual forum post is missing a translation",
    );
  if (!parsed.success)
    throw new ProviderError("format", "论坛新帖格式无法识别");
  const t = now(),
    rows: ForumPost[] = parsed.data.posts
      .slice(0, input.count)
      .map((post, index) => ({
        id: uid(),
        schemaVersion: SCHEMA_VERSION,
        createdAt: t + index,
        updatedAt: t + index,
        channelId: input.channelId,
        authorType: input.actor.type,
        authorId: input.actor.id,
        authorName: input.actor.name,
        authorHandle: input.actor.handle,
        authorAvatar: input.actor.avatar,
        authorPersonaSnapshot: input.actor.persona,
        authorOrigin: input.actor.id.startsWith("generated:")
          ? "generated"
          : "configured",
        title: post.title,
        content: post.content,
        tags: [],
        pinned: false,
        reactions: emptyReactions(),
        replies: [],
        lastActivityAt: t + index,
        generationEventId: input.eventId,
      }));
  if (rows.length) await db.forumPosts.bulkAdd(rows);
  return rows.length;
}
async function generateActorReplies(input: {
  server: ForumServer;
  actor: ForumActor;
  count: number;
  provider: ProviderSettings;
  eventId: string;
}) {
  if (input.count <= 0) return 0;
  const recent = await recentForumPosts(input.server.id);
  if (!recent.length) return 0;
  const lore = await forumLore(input.server),
    chatContext = await forumPrivateChatContext(input.server, input.actor),
    candidates = recent.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content.slice(0, 320),
    }));
  const character =
      input.actor.type === "character"
        ? await db.characters.get(input.actor.id)
        : undefined,
    bilingual = character ? autoTranslateCharacter(character) : false;
  const prompt = `${localTimeContext({enabled:true,label:"论坛当前时间"})}\n论坛：${input.server.name}\n简介：${input.server.description}\n介绍：${input.server.introduction || "无"}\n世界书：${lore || "无"}\n互通的近期角色私聊：${chatContext || "未开启或暂无"}\n参与者：${input.actor.name}（${input.actor.handle}）\n人设：${input.actor.persona}\n${languageStyleInstruction(input.actor.language ?? "中文")}\n新帖阶段已经完成。现在额外生成 ${input.count} 条回复，每条回复必须选择候选 postId。\n候选帖子：${JSON.stringify(candidates)}\n只返回严格 JSON：{"replies":[{"postId":"候选ID","content":"回复"}]}`;
  const raw = await new OpenAIProvider({
      ...input.provider,
      stream: false,
    }).chat(
      [
        {
          role: "system",
          content:
            "你以虚构角色身份参与 matcha 论坛，模拟 X 风格的评论区，只输出严格 JSON。回复要短、自然、有互动感，可以认同、补充、调侃或追问，10–140 字，允许使用 @账号。",
        },
        { role: "user", content: prompt },
      ],
      { stream: false },
    ),
    parsed = generatedRepliesSchema.safeParse(parseJson(raw));
  if (
    bilingual &&
    parsed.success &&
    parsed.data.replies.some((reply) => !reply.translation?.trim())
  )
    throw new ProviderError(
      "format",
      "Bilingual forum reply is missing a translation",
    );
  if (!parsed.success)
    throw new ProviderError("format", "论坛回复格式无法识别");
  let count = 0;
  for (const reply of parsed.data.replies.slice(0, input.count)) {
    const target = recent.find((post) => post.id === reply.postId);
    if (!target) continue;
    await addForumReply(target.id, {
      content: reply.content,
      translation: reply.translation
        ? completedTranslation(
            reply.content,
            reply.translation,
            input.provider.model,
          )
        : undefined,
      authorName: input.actor.name,
      authorHandle: input.actor.handle,
      authorType: input.actor.type,
      authorId: input.actor.id,
      authorAvatar: input.actor.avatar,
      authorPersonaSnapshot: input.actor.persona,
      authorOrigin: input.actor.id.startsWith("generated:")
        ? "generated"
        : "configured",
      generationEventId: input.eventId,
    });
    count++;
  }
  return count;
}
export async function runForumGeneration(input: {
  serverId: string;
  provider: ProviderSettings;
  eventId?: string;
  at?: number;
}) {
  const serverRow = await db.forumServers.get(input.serverId);
  if (!serverRow) throw new Error("论坛不存在");
  if (!input.provider.apiKey.trim()) throw new Error("尚未配置聊天模型");
  const server = normalizeForumServer(serverRow),
    at = input.at ?? now(),
    eventId = input.eventId ?? `forum-manual:${server.id}:${uid()}`;
  const eventPosts = () =>
    db.forumPosts
      .filter((post) => post.generationEventId === eventId)
      .toArray();
  const eventReplies = async () =>
    (await db.forumPosts.toArray())
      .flatMap((post) => post.replies)
      .filter((reply) => reply.generationEventId === eventId);
  const existingPosts = await eventPosts();
  if (server.activitySettings?.lastEventId === eventId)
    return {
      posts: server.activitySettings.lastGeneratedPosts ?? existingPosts.length,
      replies:
        server.activitySettings.lastGeneratedReplies ??
        (await eventReplies()).length,
      status: server.activitySettings.lastStatus ?? "success",
    };
  const characters = await db.characters.toArray(),
    plan = planForumGeneration(server, characters),
    channels = await db.forumChannels
      .where("serverId")
      .equals(server.id)
      .sortBy("order"),
    channel = channels.find((item) => item.kind === "forum") ?? channels[0],
    interval = (server.activitySettings?.intervalMinutes ?? 1440) * 60000;
  if (!channel || !plan.jobs.length) {
    const activitySettings = {
      ...server.activitySettings!,
      lastRunAt: at,
      nextRunAt: at + interval,
      lastEventId: eventId,
      lastStatus: "skipped" as const,
      lastSummary: "没有可参与生成的角色或 NPC",
      lastGeneratedPosts: 0,
      lastGeneratedReplies: 0,
    };
    await updateForumCommunity(server.id, { activitySettings });
    return { posts: 0, replies: 0, status: "skipped" as const };
  }
  let failures = 0;
  for (const job of plan.jobs) {
    const existing = (await eventPosts()).filter(
      (post) =>
        post.authorId === job.actor.id && post.authorType === job.actor.type,
    ).length;
    try {
      await generateActorPosts({
        server,
        actor: job.actor,
        count: Math.max(0, job.posts - existing),
        provider: input.provider,
        eventId,
        channelId: channel.id,
      });
    } catch {
      failures++;
    }
  }
  for (const job of plan.jobs) {
    const existing = (await eventReplies()).filter(
      (reply) =>
        reply.authorId === job.actor.id && reply.authorType === job.actor.type,
    ).length;
    try {
      await generateActorReplies({
        server,
        actor: job.actor,
        count: Math.max(0, job.replies - existing),
        provider: input.provider,
        eventId,
      });
    } catch {
      failures++;
    }
  }
  const generatedPosts = (await eventPosts()).length,
    generatedReplies = (await eventReplies()).length,
    status =
      failures === 0
        ? ("success" as const)
        : generatedPosts || generatedReplies
          ? ("partial" as const)
          : ("error" as const),
    summary = `生成 ${generatedPosts} 篇帖子、${generatedReplies} 条回复${failures ? `，${failures} 个生成批次失败` : ""}`,
    activitySettings = {
      ...server.activitySettings!,
      lastRunAt: at,
      nextRunAt: at + interval,
      lastEventId: eventId,
      lastStatus: status,
      lastSummary: summary,
      lastGeneratedPosts: generatedPosts,
      lastGeneratedReplies: generatedReplies,
    };
  await updateForumCommunity(server.id, { activitySettings });
  return { posts: generatedPosts, replies: generatedReplies, status };
}
export async function runDueForumGenerations(
  provider: ProviderSettings,
  at = now(),
) {
  if (!provider.apiKey.trim()) return;
  const servers = (await db.forumServers.toArray()).map(normalizeForumServer);
  for (const server of servers) {
    const settings = server.activitySettings!;
    if (!settings.enabled) continue;
    const due =
      settings.nextRunAt ??
      (settings.lastRunAt ?? server.updatedAt) +
        settings.intervalMinutes * 60000;
    if (due > at) continue;
    try {
      await runForumGeneration({
        serverId: server.id,
        provider,
        eventId: `forum-scheduled:${server.id}:${due}`,
        at,
      });
    } catch {}
  }
}

export interface ForumDirectParticipant {
  type: "character" | "npc";
  id: string;
  name: string;
  handle?: string;
  avatar?: ForumImageSource;
  persona: string;
}
export async function appendForumDirectMessage(input: {
  serverId: string;
  participant: ForumDirectParticipant;
  senderType: "user" | "character" | "npc";
  content: string;
  anonymous?: boolean;
  intent?: import("./types").ForumDirectIntent;
  generationEventId?: string;
}) {
  const row = await db.forumServers.get(input.serverId);
  if (!row) throw new Error("论坛不存在");
  const server = normalizeForumServer(row),
    t = now(),
    message: ForumDirectMessage = {
      id: uid(),
      senderType: input.senderType,
      content: input.content.trim(),
      createdAt: t,
      anonymous: input.anonymous,
      intent: input.intent,
      generationEventId: input.generationEventId,
    };
  if (!message.content) throw new Error("消息不能为空");
  const threadId = `forum-dm:${server.id}:${input.participant.type}:${input.participant.id}`,
    existing = (server.directThreads ?? []).find(
      (thread) => thread.id === threadId,
    ),
    thread: ForumDirectThread = existing
      ? {
          ...existing,
          participantName: input.participant.name,
          participantHandle: input.participant.handle,
          participantPersona: input.participant.persona,
          participantOrigin: input.participant.id.startsWith("generated-dm:")
            ? "generated"
            : "configured",
          participantAvatar: input.participant.avatar,
          messages: [...existing.messages, message],
          updatedAt: t,
          unreadCount:
            input.senderType === "user" ? 0 : existing.unreadCount + 1,
        }
      : {
          id: threadId,
          participantType: input.participant.type,
          participantId: input.participant.id,
          participantName: input.participant.name,
          participantHandle: input.participant.handle,
          participantPersona: input.participant.persona,
          participantOrigin: input.participant.id.startsWith("generated-dm:")
            ? "generated"
            : "configured",
          participantAvatar: input.participant.avatar,
          messages: [message],
          updatedAt: t,
          unreadCount: input.senderType === "user" ? 0 : 1,
        },
    directThreads = [
      ...(server.directThreads ?? []).filter((item) => item.id !== threadId),
      thread,
    ];
  await updateForumCommunity(server.id, { directThreads });
  return { thread, message };
}
export async function markForumDirectThreadRead(
  serverId: string,
  threadId: string,
) {
  const row = await db.forumServers.get(serverId);
  if (!row) return;
  const server = normalizeForumServer(row),
    directThreads = (server.directThreads ?? []).map((thread) =>
      thread.id === threadId ? { ...thread, unreadCount: 0 } : thread,
    );
  await updateForumCommunity(server.id, { directThreads });
}
export async function generateForumDirectReply(input: {
  serverId: string;
  participant: ForumDirectParticipant;
  provider: ProviderSettings;
  userProfile: ForumCommunityProfile;
}) {
  if (!input.provider.apiKey.trim()) throw new Error("尚未配置聊天模型");
  const row = await db.forumServers.get(input.serverId);
  if (!row) throw new Error("论坛不存在");
  const server = normalizeForumServer(row),
    anonymous = Boolean(input.userProfile.anonymousMode),
    chatContext = anonymous
      ? ""
      : await forumPrivateChatContext(server, input.participant),
    threadId = `forum-dm:${server.id}:${input.participant.type}:${input.participant.id}`,
    thread = (server.directThreads ?? []).find((item) => item.id === threadId),
    history = (thread?.messages ?? [])
      .slice(-16)
      .map(
        (message) =>
          `${message.senderType === "user" ? input.userProfile.displayName : input.participant.name}：${message.content}`,
      )
      .join("\n"),
    lore = await forumLore(server),
    prompt = `${localTimeContext({enabled:true,label:"论坛当前时间"})}\n你正在茶茶机的虚构论坛私信中回复用户。\n论坛：${server.name}\n论坛介绍：${server.introduction || server.description}\n世界书：${lore || "无"}\n你的名字：${input.participant.name}\n你的人设：${input.participant.persona}\n用户身份：${anonymous ? "匿名陌生人，不知道真实姓名和账号" : input.userProfile.displayName}\n用户在本社区的设定：${anonymous ? "不可见" : input.userProfile.persona || "无"}\n互通的近期角色私聊：${chatContext || "未开启或暂无"}\n私信记录：\n${history || "暂无"}\n请以自然私信口吻回复最后一条用户消息，20–180字，不要输出姓名前缀或 JSON。`,
    content = (
      await new OpenAIProvider({ ...input.provider, stream: false }).chat(
        [
          {
            role: "system",
            content: "你扮演虚构论坛成员进行私信，只输出要发送的消息正文。",
          },
          { role: "user", content: prompt },
        ],
        { stream: false },
      )
    ).trim();
  if (!content) throw new Error("对方没有生成有效回复");
  return appendForumDirectMessage({
    serverId: server.id,
    participant: input.participant,
    senderType: input.participant.type,
    content,
  });
}
export async function generateForumReplyToComment(input: {
  postId: string;
  targetReplyId: string;
  userReplyId: string;
  provider: ProviderSettings;
}) {
  if (!input.provider.apiKey.trim()) return;
  const post = await db.forumPosts.get(input.postId);
  if (!post) return;
  const target = post.replies.find((reply) => reply.id === input.targetReplyId),
    userReply = post.replies.find((reply) => reply.id === input.userReplyId);
  if (!target || !userReply) return;
  const channel = await db.forumChannels.get(post.channelId),
    serverRow = channel
      ? await db.forumServers.get(channel.serverId)
      : undefined;
  if (!serverRow) return;
  const server = normalizeForumServer(serverRow);
  let actor:
    | {
        type: "character" | "npc";
        id: string;
        name: string;
        handle: string;
        persona: string;
        avatar?: ForumImageSource;
        language?: Language;
      }
    | undefined;
  if (target.authorType === "character" && target.authorId) {
    const character = await db.characters.get(target.authorId);
    if (character && canCharacterInteract(character))
      actor = {
        type: "character",
        id: character.id,
        name: character.name,
        handle: forumHandleOf(character.name, character.id),
        persona: `${coreSettingOf(character)}\n${personaOf(character)}`,
        avatar: character.avatar
          ? { type: "url", value: character.avatar }
          : undefined,
        language: chatSettingsOf(character).language,
      };
  } else if (target.authorType === "npc" && target.authorId) {
    const npc = server.npcs?.find(
      (item) => item.id === target.authorId && item.enabled,
    );
    if (npc)
      actor = {
        type: "npc",
        id: npc.id,
        name: npc.name,
        handle: npc.handle ?? forumHandleOf(npc.name, npc.id),
        persona: npc.persona,
        avatar: npc.avatar,
      };
  }
  if (!actor) {
    const character = (server.characterIds ?? []).map((id) =>
      db.characters.get(id),
    );
    for (const pending of character) {
      const row = await pending;
      if (row && canCharacterInteract(row)) {
        actor = {
          type: "character",
          id: row.id,
          name: row.name,
          handle: forumHandleOf(row.name, row.id),
          persona: `${coreSettingOf(row)}\n${personaOf(row)}`,
          avatar: row.avatar ? { type: "url", value: row.avatar } : undefined,
          language: chatSettingsOf(row).language,
        };
        break;
      }
    }
  }
  if (!actor) return;
  const prompt = `${localTimeContext({enabled:true,label:"论坛当前时间"})}\n你正在 matcha 论坛的评论区继续对话。\n帖子：${post.content}\n你之前的评论：${target.content}\n用户回复你：${userReply.content}\n你的身份：${actor.name}（${actor.handle}）\n人物设定：${actor.persona}\n${languageStyleInstruction(actor.language ?? "中文")}\n请直接回复用户，像 X 评论区一样简短自然，10–120 字。不要输出姓名前缀或 JSON。`,
    content = (
      await new OpenAIProvider({ ...input.provider, stream: false }).chat(
        [
          {
            role: "system",
            content: "你扮演论坛评论者，只输出针对用户回复的下一条评论。",
          },
          { role: "user", content: prompt },
        ],
        { stream: false },
      )
    ).trim();
  if (!content) return;
  return addForumReply(post.id, {
    content,
    authorName: actor.name,
    authorHandle: actor.handle,
    authorType: actor.type,
    authorId: actor.id,
    authorAvatar: actor.avatar,
    replyToId: userReply.id,
    replyToName: userReply.authorName,
  });
}
export async function generateCharacterForumReply(input: {
  post: ForumPost;
  character: Character;
  provider: ProviderSettings;
  appSettings: AppSettings;
  signal?: AbortSignal;
}) {
  if (!input.provider.apiKey.trim()) throw new Error("尚未配置聊天模型");
  const channel = await db.forumChannels.get(input.post.channelId),
    server = channel ? await db.forumServers.get(channel.serverId) : undefined,
    recent = input.post.replies
      .slice(-12)
      .map((reply) => `${reply.authorName}：${reply.content}`)
      .join("\n"),
    lore = server ? await forumLore(server) : "",
    prompt = `${localTimeContext({enabled:input.character.proactive.timeAware,label:"论坛当前时间"})}\n你正在茶茶机的本地虚构论坛中，以角色本人身份回复主题。\n论坛：${server?.name ?? "论坛"}\n论坛介绍：${server?.introduction ?? ""}\n世界书：${lore || "无"}\n角色名：${input.character.name}（${forumHandleOf(input.character.name, input.character.id)}）\n核心设定：${coreSettingOf(input.character)}\n人物设定：${personaOf(input.character)}\n${languageStyleInstruction(chatSettingsOf(input.character).language)}\n用户名：${input.appSettings.userName || "用户"}（${forumHandleOf(input.appSettings.userName || "用户")})\n主题：${input.post.title}\n正文：${input.post.content}\n已有回复：\n${recent || "暂无"}\n写一段自然、有观点、符合人物口吻的 X 风格论坛回复，10–140 字。可以提及对方账号，但不要输出姓名前缀或 JSON，只返回回复正文。`,
    bilingual = autoTranslateCharacter(input.character),
    raw = await new OpenAIProvider({ ...input.provider, stream: false }).chat(
      [
        {
          role: "system",
          content: bilingual
            ? "Return strict JSON with content and translation."
            : "Return only the natural forum reply text.",
        },
        {
          role: "user",
          content:
            prompt +
            (bilingual
              ? `\nReturn {"content":"original reply","translation":"faithful Simplified Chinese translation"}`
              : ""),
        },
      ],
      { stream: false, signal: input.signal },
    ),
    generated = bilingual
      ? z
          .object({
            content: z.string().trim().min(1),
            translation: z.string().trim().min(1),
          })
          .parse(parseJson(raw))
      : { content: raw.trim(), translation: undefined },
    content = generated.content;
  if (!content) throw new Error("角色没有生成有效回复");
  return addForumReply(input.post.id, {
    content,
    translation: generated.translation
      ? completedTranslation(
          content,
          generated.translation,
          input.provider.model,
        )
      : undefined,
    authorName: input.character.name,
    authorHandle: forumHandleOf(input.character.name, input.character.id),
    authorType: "character",
    authorId: input.character.id,
    authorAvatar: input.character.avatar
      ? { type: "url", value: input.character.avatar }
      : undefined,
  });
}

export async function generateForumProfileReplies(input: {
  serverId: string;
  actor: {
    type: "character" | "npc";
    id: string;
    name: string;
    handle: string;
    avatar?: ForumImageSource;
    persona: string;
    language?: Language;
  };
  provider: ProviderSettings;
  count?: number;
}) {
  const row = await db.forumServers.get(input.serverId);
  if (!row) throw new Error("论坛不存在");
  const server = normalizeForumServer(row),
    eventId = `forum-profile-replies:${server.id}:${input.actor.type}:${input.actor.id}`;
  return generateActorReplies({
    server,
    actor: input.actor,
    count: input.count ?? 3,
    provider: input.provider,
    eventId,
  });
}
export async function generateForumProfileLikes(input: {
  serverId: string;
  actor: { type: "character" | "npc"; id: string };
  count?: number;
}) {
  const row = await db.forumServers.get(input.serverId);
  if (!row) throw new Error("论坛不存在");
  const server = normalizeForumServer(row),
    eventId = `forum-profile-likes:${server.id}:${input.actor.type}:${input.actor.id}`,
    existing = (server.profileLikes ?? []).filter(
      (item) => item.generationEventId === eventId,
    );
  if (existing.length) return existing;
  const posts = await recentForumPosts(server.id),
    selected = posts
      .filter(
        (post) =>
          !(
            post.authorType === input.actor.type &&
            post.authorId === input.actor.id
          ),
      )
      .slice(0, input.count ?? 4),
    created = selected.map((post) => ({
      id: uid(),
      actorType: input.actor.type,
      actorId: input.actor.id,
      postId: post.id,
      createdAt: now(),
      generationEventId: eventId,
    }));
  for (const item of created) {
    const post = await db.forumPosts.get(item.postId);
    if (!post) continue;
    const reactions = post.reactions.map((reaction) =>
      reaction.kind === "heart"
        ? { ...reaction, count: reaction.count + 1 }
        : reaction,
    );
    await db.forumPosts.update(post.id, { reactions, updatedAt: now() });
  }
  await updateForumCommunity(server.id, {
    profileLikes: [...(server.profileLikes ?? []), ...created],
  });
  return created;
}
export async function generateForumProactiveDirectMessages(input: {
  serverId: string;
  provider: ProviderSettings;
  count?: number;
  eventId?: string;
}) {
  const row = await db.forumServers.get(input.serverId);
  if (!row || !input.provider.apiKey.trim()) return 0;
  const server = normalizeForumServer(row),
    count = Math.max(
      0,
      Math.min(
        6,
        input.count ?? server.activitySettings?.directMessagesPerRun ?? 2,
      ),
    );
  if (!count) return 0;
  const chars = (await db.characters.toArray()).filter(
      (c) => server.characterIds?.includes(c.id) && canCharacterInteract(c),
    ),
    configured = [
      ...chars.map((c) => ({
        type: "character" as const,
        id: c.id,
        name: c.name,
        handle: forumHandleOf(c.name, c.id),
        persona: `${coreSettingOf(c)}\n${personaOf(c)}`,
        avatar: c.avatar
          ? { type: "url" as const, value: c.avatar }
          : undefined,
      })),
      ...(server.npcs ?? [])
        .filter((n) => n.enabled)
        .map((n) => ({
          type: "npc" as const,
          id: n.id,
          name: n.name,
          handle: n.handle ?? forumHandleOf(n.name, n.id),
          persona: n.persona,
          avatar: n.avatar,
        })),
    ],
    prompt = `${localTimeContext({enabled:true,label:"论坛当前时间"})}\n论坛：${server.name}\n简介：${server.description}\n介绍：${server.introduction || "无"}\n生成 ${count} 条由不同人主动发给用户的私信。可以是搭讪、商务合作、日常交流、赞赏、提问、邀请、求助、道歉、抱怨或重新联系。已有成员：${configured.map((a) => `${a.name}:${a.persona}`).join("；") || "无，可自行创造普通人类用户"}\n只返回严格 JSON：{"messages":[{"name":"名字","persona":"简短人设","intent":"daily","content":"私信正文"}]}`;
  const schema = z
      .object({
        messages: z.array(
          z
            .object({
              name: z.string().min(1).max(30),
              persona: z.string().min(1).max(300),
              intent: z.enum([
                "greeting",
                "flirt",
                "business",
                "daily",
                "praise",
                "question",
                "invitation",
                "request",
                "apology",
                "complaint",
                "reconnect",
                "other",
              ]),
              content: z.string().min(1).max(500),
            })
            .strict(),
        ),
      })
      .strict(),
    raw = await new OpenAIProvider({ ...input.provider, stream: false }).chat(
      [
        {
          role: "system",
          content:
            "你为虚构论坛生成自然、多样、像真人发出的主动私信，只输出 JSON。",
        },
        { role: "user", content: prompt },
      ],
      { stream: false },
    ),
    parsed = schema.safeParse(parseJson(raw));
  if (!parsed.success)
    throw new ProviderError("format", "论坛私信格式无法识别");
  let made = 0;
  for (const [index, msg] of parsed.data.messages.slice(0, count).entries()) {
    const matched = configured.find((a) => a.name === msg.name),
      participant = matched ?? {
        type: "npc" as const,
        id: `generated-dm:${input.eventId ?? uid()}:${index}`,
        name: msg.name,
        handle: forumHandleOf(msg.name, `${input.eventId}:${index}`),
        persona: msg.persona,
      };
    await appendForumDirectMessage({
      serverId: server.id,
      participant,
      senderType: participant.type,
      content: msg.content,
      intent: msg.intent,
      generationEventId: input.eventId,
    });
    made++;
  }
  return made;
}


