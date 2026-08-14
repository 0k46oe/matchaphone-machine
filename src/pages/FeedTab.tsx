import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Camera,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  Link2,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Reply,
  SendHorizonal,
  Trash2,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Avatar, Empty, Modal } from "../components/ui";
import { db, setSetting } from "../core/db";
import {
  feedGridClass,
  pendingInteractionLabel,
} from "../core/feedPresentation";
import { compressImage } from "../core/imageAssets";
import { deleteMediaIfUnused, saveImageMedia } from "../core/mediaAssets";
import { makeReplyJob, scheduleUserPostInteractions } from "../core/proactive";
import { autoTranslateCharacter } from "../core/bilingual";
import { useStore } from "../core/store";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type AppearanceSource,
  type FeedComment,
  type FeedImageAttachment,
  type FeedPost,
  type MediaAsset,
} from "../core/types";

const when = (time: number) =>
  new Date(time).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function imageUrl(image: FeedImageAttachment, assets: Map<string, MediaAsset>) {
  return image.source === "asset"
    ? image.assetId
      ? assets.get(image.assetId)?.data
      : undefined
    : image.url;
}

export default function FeedTab() {
  const { feedPosts, characters, settings, appearance, imageAssets, reload } =
      useStore(),
    [params, setParams] = useSearchParams();
  const [commenting, setCommenting] = useState<string | null>(null),
    [coverOpen, setCoverOpen] = useState(false),
    [coverUrlDraft, setCoverUrlDraft] = useState(""),
    [coverNotice, setCoverNotice] = useState(""),
    [replying, setReplying] = useState<{
      postId: string;
      comment: FeedComment;
    } | null>(null),
    [actionPostId, setActionPostId] = useState<string | null>(null),
    [text, setText] = useState(""),
    [draftText, setDraftText] = useState(""),
    [draftDescription, setDraftDescription] = useState(""),
    [draftImages, setDraftImages] = useState<FeedImageAttachment[]>([]),
    [url, setUrl] = useState(""),
    [assets, setAssets] = useState<Map<string, MediaAsset>>(new Map()),
    [publishing, setPublishing] = useState(false),
    [uploading, setUploading] = useState(false),
    [deleteTarget, setDeleteTarget] = useState<FeedPost | null>(null),
    [preview, setPreview] = useState(""),
    [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null),
    coverFileRef = useRef<HTMLInputElement>(null),
    coverCameraRef = useRef<HTMLInputElement>(null),
    compose = params.get("compose") === "1",
    rows = useMemo(
      () => [...feedPosts].sort((a, b) => b.createdAt - a.createdAt),
      [feedPosts],
    ),
    userName = settings?.userName ?? "我";
  const loadAssets = async () =>
    setAssets(
      new Map(
        (await db.mediaAssets.toArray()).map((asset) => [asset.id, asset]),
      ),
    );
  const coverSource =
      appearance?.feedCover ??
      ({ type: "color", value: "#b8b8ba" } as AppearanceSource),
    coverImage =
      coverSource.type === "asset"
        ? imageAssets.find((asset) => asset.id === coverSource.value)?.data
        : coverSource.type === "url"
          ? coverSource.value
          : undefined,
    coverColor =
      coverSource.type === "color" ? coverSource.value || "#b8b8ba" : "#b8b8ba";
  const saveCover = async (source: AppearanceSource, message: string) => {
    if (!appearance) return;
    await setSetting("appearance", { ...appearance, feedCover: source });
    setCoverNotice(message);
    await reload();
  };
  const chooseCover = async (file?: File) => {
    if (!file) return;
    try {
      const asset = await compressImage(file, "feed-cover");
      await db.imageAssets.put(asset);
      await saveCover(
        { type: "asset", value: asset.id },
        "封面已保存到当前设备",
      );
      setCoverOpen(false);
    } catch (error) {
      setCoverNotice(
        error instanceof Error ? error.message : "封面图片处理失败",
      );
    } finally {
      if (coverFileRef.current) coverFileRef.current.value = "";
      if (coverCameraRef.current) coverCameraRef.current.value = "";
    }
  };
  const useCoverUrl = async () => {
    try {
      const parsed = new URL(coverUrlDraft.trim());
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
      await saveCover(
        { type: "url", value: parsed.toString() },
        "已使用网络封面",
      );
      setCoverOpen(false);
    } catch {
      setCoverNotice("请输入有效的 http 或 https 图片地址");
    }
  };
  useEffect(() => {
    void loadAssets();
  }, [feedPosts]);
  useEffect(() => {
    void (async () => {
      const posts = await db.feedPosts.toArray();
      for (const post of posts) {
        const comments = post.comments.map((comment) =>
          comment.origin === "proactive" && !comment.readAt
            ? { ...comment, readAt: now() }
            : comment,
        );
        if (
          (post.origin === "proactive" && !post.readAt) ||
          comments.some((comment, index) => comment !== post.comments[index])
        )
          await db.feedPosts.update(post.id, {
            readAt: post.readAt ?? now(),
            comments,
          });
      }
      await reload();
    })();
  }, [reload]);
  const closeCompose = async (clean = true) => {
    if (
      clean &&
      (draftText.trim() || draftImages.length) &&
      !window.confirm("放弃这篇未发布的动态？")
    )
      return;
    if (clean)
      for (const image of draftImages)
        if (image.assetId) await deleteMediaIfUnused(image.assetId);
    setDraftText("");
    setDraftDescription("");
    setDraftImages([]);
    setUrl("");
    setNotice("");
    setParams({}, { replace: true });
    await loadAssets();
  };
  const saveFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 9 - draftImages.length;
    if (room <= 0) {
      setNotice("每篇动态最多 9 张图片");
      return;
    }
    setUploading(true);
    try {
      const next: FeedImageAttachment[] = [];
      for (const file of [...files].slice(0, room)) {
        const asset = await saveImageMedia(file, "feed-image");
        next.push({
          id: uid(),
          source: "asset",
          assetId: asset.id,
          width: asset.width,
          height: asset.height,
        });
      }
      setDraftImages((current) => [...current, ...next]);
      await loadAssets();
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片处理失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };
  const addUrl = () => {
    if (draftImages.length >= 9) return setNotice("每篇动态最多 9 张图片");
    try {
      const value = new URL(url.trim());
      if (!/^https?:$/.test(value.protocol)) throw new Error();
      setDraftImages((current) => [
        ...current,
        { id: uid(), source: "url", url: value.toString() },
      ]);
      setUrl("");
      setNotice("");
    } catch {
      setNotice("请输入有效的 http 或 https 图片地址");
    }
  };
  const removeDraft = async (index: number) => {
    const image = draftImages[index];
    setDraftImages((current) => current.filter((_, i) => i !== index));
    if (image?.assetId) await deleteMediaIfUnused(image.assetId);
    await loadAssets();
  };
  const moveDraft = (index: number, delta: number) =>
    setDraftImages((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current],
        [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  const publish = async () => {
    const content = draftText.trim();
    if (!content && !draftImages.length) return;
    setPublishing(true);
    try {
      const t = now(),
        post: FeedPost = {
          id: uid(),
          schemaVersion: SCHEMA_VERSION,
          createdAt: t,
          updatedAt: t,
          authorType: "user",
          content,
          images: draftImages,
          imageDescription: draftDescription.trim() || undefined,
          liked: false,
          comments: [],
          origin: "manual",
          readAt: t,
          pendingInteractions: scheduleUserPostInteractions(characters, t),
        };
      await db.feedPosts.add(post);
      setDraftImages([]);
      await closeCompose(false);
      await reload();
      window.dispatchEvent(new Event("mira:proactive-check"));
    } finally {
      setPublishing(false);
    }
  };
  const like = async (id: string, liked: boolean) => {
    await db.feedPosts.update(id, { liked: !liked, updatedAt: now() });
    await reload();
  };
  const startComment = (postId: string) => {
    setActionPostId(null);
    setCommenting(postId);
    setReplying(null);
  };
  const comment = async () => {
    const postId = replying?.postId ?? commenting,
      post = feedPosts.find((x) => x.id === postId),
      content = text.trim();
    if (!post || !content) return;
    const t = now(),
      parent = replying?.comment,
      userComment: FeedComment = {
        id: uid(),
        authorType: "user",
        content,
        createdAt: t,
        parentId: parent?.id,
        threadRootId: parent?.threadRootId ?? parent?.id,
        replyToAuthorType: parent?.authorType,
        replyToAuthorId: parent?.authorId,
        origin: "manual",
        status: "complete",
        readAt: t,
      },
      authorType = post.authorType ?? "character",
      targetId =
        parent?.authorId ??
        (authorType === "character" ? post.authorId : undefined),
      job = targetId ? makeReplyJob(targetId, userComment) : undefined;
    await db.feedPosts.update(post.id, {
      comments: [...post.comments, userComment],
      pendingInteractions: job
        ? [...(post.pendingInteractions ?? []), job]
        : post.pendingInteractions,
      updatedAt: t,
    });
    setText("");
    setCommenting(null);
    setReplying(null);
    await reload();
    if (job) window.dispatchEvent(new Event("mira:proactive-check"));
  };
  const removePost = async () => {
    const post = deleteTarget;
    if (!post) return;
    const ids = (post.images ?? []).flatMap((image) =>
      image.assetId ? [image.assetId] : [],
    );
    await db.feedPosts.delete(post.id);
    setDeleteTarget(null);
    setActionPostId(null);
    for (const id of new Set(ids)) await deleteMediaIfUnused(id);
    await reload();
    await loadAssets();
  };
  return (
    <div className="social-scroll feed-tab moments-feed">
      <section className="moments-cover" aria-label="朋友圈封面">
        <button
          className="moments-cover-image"
          aria-label="自定义朋友圈封面"
          style={{ backgroundColor: coverColor }}
          onClick={() => {
            setCoverUrlDraft(
              coverSource.type === "url" ? (coverSource.value ?? "") : "",
            );
            setCoverNotice("");
            setCoverOpen(true);
          }}
        >
          {coverImage && (
            <img
              src={coverImage}
              alt="朋友圈封面"
              onError={(event) => (event.currentTarget.style.display = "none")}
            />
          )}
        </button>
        <div className="moments-profile">
          <b>{userName}</b>
          <Avatar text={userName} src={settings?.userAvatar} />
        </div>
      </section>
      <section className="moments-list">
        {rows.length ? (
          rows.map((post) => {
            const authorType = post.authorType ?? "character",
              author =
                authorType === "character"
                  ? characters.find((c) => c.id === post.authorId)
                  : undefined,
              name =
                authorType === "user"
                  ? userName
                  : (author?.name ?? "已删除角色"),
              postImages = post.images ?? [],
              pendingLabel = pendingInteractionLabel(
                post.pendingInteractions?.length ?? 0,
              );
            return (
              <article className="moments-post" key={post.id}>
                <div className="moments-post-avatar">
                  {authorType === "user" ? (
                    <Avatar text={name} src={settings?.userAvatar} />
                  ) : (
                    <Avatar text={name} src={author?.avatar} />
                  )}
                </div>
                <div className="moments-post-body">
                  <b className="moments-author">{name}</b>
                  {post.content && (
                    <p className="feed-copy moments-copy">{post.content}</p>
                  )}
                  {author &&
                    autoTranslateCharacter(author) &&
                    post.translation?.status === "complete" &&
                    post.translation.text && (
                      <p className="content-translation feed-translation">
                        {post.translation.text}
                      </p>
                    )}
                  {postImages.length > 0 && (
                    <div
                      className={`feed-image-grid moments-image-grid ${feedGridClass(postImages.length)}`}
                    >
                      {postImages.slice(0, 9).map((image) => {
                        const src = imageUrl(image, assets),
                          alt =
                            image.description ||
                            post.imageDescription ||
                            "动态图片";
                        return (
                          <button
                            key={image.id}
                            aria-label={alt}
                            onClick={() => src && setPreview(src)}
                          >
                            <span className="feed-image-fallback">
                              <ImagePlus />
                              <em>图片加载失败</em>
                            </span>
                            {src && (
                              <img
                                src={src}
                                alt={alt}
                                onError={(event) =>
                                  event.currentTarget.classList.add("broken")
                                }
                              />
                            )}{" "}
                            {image.generated && <small>AI</small>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {post.imageDescription && (
                    <p className="feed-image-description moments-image-description">
                      {post.imageDescription}
                    </p>
                  )}
                  <div className="moments-meta">
                    <time>{when(post.createdAt)}</time>
                    <button
                      className="moments-delete"
                      onClick={() => setDeleteTarget(post)}
                    >
                      删除
                    </button>
                    <button
                      className="moments-action-toggle"
                      aria-label="点赞和评论"
                      onClick={() =>
                        setActionPostId((current) =>
                          current === post.id ? null : post.id,
                        )
                      }
                    >
                      <MoreHorizontal />
                    </button>
                    {actionPostId === post.id && (
                      <div className="moments-action-menu">
                        <button
                          onClick={async () => {
                            await like(post.id, post.liked);
                            setActionPostId(null);
                          }}
                        >
                          <Heart />
                          {post.liked ? "取消" : "赞"}
                        </button>
                        <button onClick={() => startComment(post.id)}>
                          <MessageCircle />
                          评论
                        </button>
                      </div>
                    )}
                  </div>
                  {pendingLabel && (
                    <div className="moments-pending">
                      <i />
                      {pendingLabel}
                    </div>
                  )}
                  {(post.liked || post.comments.length > 0) && (
                    <div className="moments-feedback">
                      {post.liked && (
                        <div className="moments-likes">
                          <Heart />
                          <b>{userName}</b>
                        </div>
                      )}
                      {post.comments.length > 0 && (
                        <div className="moments-comments">
                          {post.comments.map((comment) => {
                            const commentAuthor = characters.find(
                                (x) => x.id === comment.authorId,
                              ),
                              commentName =
                                comment.authorType === "user"
                                  ? userName
                                  : (commentAuthor?.name ?? "Character"),
                              parent = post.comments.find(
                                (x) => x.id === comment.parentId,
                              ),
                              target = parent
                                ? parent.authorType === "user"
                                  ? userName
                                  : (characters.find(
                                      (x) => x.id === parent.authorId,
                                    )?.name ?? "角色")
                                : "";
                            return (
                              <div
                                className={`moments-comment-row${comment.parentId ? " thread-reply" : ""}`}
                                key={comment.id}
                              >
                                <div className="moments-comment-body">
                                  <p>
                                    <b>{commentName}</b>
                                    {target && (
                                      <>
                                        <span> 回复 </span>
                                        <b>{target}</b>
                                      </>
                                    )}
                                    <span>：{comment.content}</span>
                                  </p>
                                  {comment.authorType === "character" &&
                                    commentAuthor &&
                                    autoTranslateCharacter(commentAuthor) &&
                                    comment.translation?.status === "complete" &&
                                    comment.translation.text && (
                                      <p className="content-translation comment-translation">
                                        {comment.translation.text}
                                      </p>
                                    )}
                                </div>
                                {comment.authorType === "character" && (
                                  <button
                                    onClick={() => {
                                      setReplying({ postId: post.id, comment });
                                      setCommenting(null);
                                      setActionPostId(null);
                                    }}
                                  >
                                    <Reply />
                                    回复
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <Empty
            icon={<AtSign size={42} />}
            title="还没有动态"
            text="点击右上角加号分享此刻，或开启角色主动动态。"
          />
        )}
      </section>
      {(commenting || replying) && (
        <div className="comment-composer">
          <button
            onClick={() => {
              setCommenting(null);
              setReplying(null);
              setText("");
            }}
          >
            <X />
          </button>
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              replying
                ? `回复 ${characters.find((c) => c.id === replying.comment.authorId)?.name ?? "角色"}…`
                : "写下评论…"
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") void comment();
            }}
          />
          <button disabled={!text.trim()} onClick={comment}>
            <SendHorizonal />
          </button>
        </div>
      )}
      {compose && (
        <Modal onClose={() => void closeCompose()}>
          <div className="feed-compose-sheet">
            <div className="sheet-head">
              <div>
                <small>NEW POST</small>
                <h2>发布动态</h2>
              </div>
              <button onClick={() => void closeCompose()}>
                <X />
              </button>
            </div>
            <div className="feed-compose">
              <textarea
                autoFocus
                maxLength={3000}
                rows={5}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                placeholder="分享这一刻…"
              />
              {draftImages.length > 0 && (
                <div className="feed-compose-grid">
                  {draftImages.map((image, index) => {
                    const src = imageUrl(image, assets);
                    return (
                      <div key={image.id}>
                        {src ? (
                          <img src={src} alt="待发布图片" />
                        ) : (
                          <ImagePlus />
                        )}
                        <div className="feed-compose-image-actions">
                          <button
                            disabled={index === 0}
                            aria-label="向前移动"
                            onClick={() => moveDraft(index, -1)}
                          >
                            <ChevronLeft />
                          </button>
                          <button
                            disabled={index === draftImages.length - 1}
                            aria-label="向后移动"
                            onClick={() => moveDraft(index, 1)}
                          >
                            <ChevronRight />
                          </button>
                          <button
                            aria-label="移除图片"
                            onClick={() => void removeDraft(index)}
                          >
                            <X />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <label>
                图片说明（建议填写）
                <input
                  maxLength={300}
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="让不支持识图的角色也能理解图片"
                />
              </label>
              <div className="feed-compose-actions">
                <button
                  disabled={uploading || draftImages.length >= 9}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus />
                  相册
                </button>
                <button
                  disabled={uploading || draftImages.length >= 9}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera />
                  相机
                </button>
              </div>
              <div className="feed-url-row">
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="图片 URL"
                />
                <button
                  disabled={!url.trim() || draftImages.length >= 9}
                  onClick={addUrl}
                >
                  <Link2 />
                  添加
                </button>
              </div>
              {notice && <p className="form-error">{notice}</p>}
              <button
                className="primary"
                disabled={
                  publishing ||
                  uploading ||
                  (!draftText.trim() && !draftImages.length)
                }
                onClick={publish}
              >
                {publishing ? <LoaderCircle className="spin" /> : <Plus />}
                {publishing ? "正在发布…" : "发布动态"}
              </button>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void saveFiles(event.target.files)}
            />
            <input
              ref={cameraRef}
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void saveFiles(event.target.files)}
            />
          </div>
        </Modal>
      )}
      <input
        ref={coverFileRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => void chooseCover(event.target.files?.[0])}
      />
      <input
        ref={coverCameraRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void chooseCover(event.target.files?.[0])}
      />
      {coverOpen && (
        <Modal onClose={() => setCoverOpen(false)}>
          <div className="sheet-head">
            <div>
              <small>MOMENTS COVER</small>
              <h2>朋友圈封面</h2>
            </div>
            <button onClick={() => setCoverOpen(false)}>
              <X />
            </button>
          </div>
          <div className="moments-cover-editor">
            <div className="moments-cover-actions">
              <button onClick={() => coverFileRef.current?.click()}>
                <ImagePlus />
                相册
              </button>
              <button onClick={() => coverCameraRef.current?.click()}>
                <Camera />
                相机
              </button>
            </div>
            <label>
              图片 URL
              <input
                value={coverUrlDraft}
                onChange={(event) => setCoverUrlDraft(event.target.value)}
                placeholder="https://example.com/cover.jpg"
              />
            </label>
            <button
              className="primary"
              disabled={!coverUrlDraft.trim()}
              onClick={() => void useCoverUrl()}
            >
              <Link2 />
              使用图片 URL
            </button>
            <button
              className="secondary-action"
              onClick={() =>
                void saveCover(
                  { type: "color", value: "#b8b8ba" },
                  "已恢复默认灰色封面",
                ).then(() => setCoverOpen(false))
              }
            >
              恢复默认灰色
            </button>
            {coverNotice && <p className="form-note">{coverNotice}</p>}
          </div>
        </Modal>
      )}{" "}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <div className="compact-confirm">
            <Trash2 />
            <h2>删除这篇动态？</h2>
            <p>正文、评论和未执行的角色评论任务都会删除，且无法撤销。</p>
            <button className="danger-button" onClick={() => void removePost()}>
              删除动态
            </button>
            <button
              className="cancel-button"
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal onClose={() => setPreview("")}>
          <div className="feed-image-preview">
            <button onClick={() => setPreview("")}>
              <X />
            </button>
            <img src={preview} alt="动态图片预览" />
          </div>
        </Modal>
      )}
    </div>
  );
}
