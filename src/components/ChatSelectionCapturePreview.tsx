import {
  ArrowLeft,
  Footprints,
  Gift,
  HeartHandshake,
  Image as ImageIcon,
  Mic,
  Music2,
  Phone,
  Share2,
  Vote,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { userReactionOf } from "../core/messageInteractions";
import {
  captureElementAsPng,
  captureFileName,
  shareOrDownloadCapture,
} from "../core/chatCapture";
import type { MediaAsset, Message, MessageAttachment } from "../core/types";
import { isCardOnlyMessage } from "../core/messagePresentation";
import { Avatar } from "./ui";
import { MessageReactionBadge } from "./MessageInteractions";

export interface ChatCaptureActor {
  id: string;
  name: string;
  avatar?: string;
}

function stamp(value: number) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function captureImage(
  src: string | undefined,
  alt: string,
  className = "capture-media-image",
) {
  return (
    <span className="capture-image-shell">
      {src ? (
        <img
          className={className}
          src={src}
          alt={alt}
          loading="eager"
          crossOrigin={/^https?:/i.test(src) ? "anonymous" : undefined}
        />
      ) : null}
      <span className="capture-image-placeholder">
        <ImageIcon />
        图片无法载入
      </span>
    </span>
  );
}

function attachmentContent(
  attachment: MessageAttachment,
  message: Message,
  assets: Map<string, MediaAsset>,
) {
  if (attachment.type === "sticker") {
    const src = attachment.assetId
      ? assets.get(attachment.assetId)?.data
      : attachment.url;
    return (
      <div className="sticker-message capture-sticker-message">
        {captureImage(src, attachment.name, "capture-sticker-image")}
      </div>
    );
  }
  if (attachment.type === "image") {
    const src = attachment.assetId
      ? assets.get(attachment.assetId)?.data
      : attachment.url;
    return (
      <div className="image-message capture-image-message">
        {captureImage(src, attachment.description || "聊天图片")}
        {attachment.description && <small>{attachment.description}</small>}
      </div>
    );
  }
  if (attachment.type === "voice")
    return (
      <div className="capture-voice-message">
        <span>
          <Mic />
          语音 · {Math.max(1, Math.round(attachment.durationMs / 1000))} 秒
        </span>
        <small>{attachment.transcript}</small>
        {message.translation?.status === "complete" &&
          message.translation.text && (
            <div className="voice-message-translation">
              {message.translation.text}
            </div>
          )}
      </div>
    );
  if (attachment.type === "text-image")
    return (
      <div className="capture-attachment-card">
        <ImageIcon />
        <span>
          <b>文字图片</b>
          <small>{attachment.description}</small>
        </span>
      </div>
    );
  if (attachment.type === "transfer")
    return (
      <div className="capture-attachment-card">
        <WalletCards />
        <span>
          <b>¥{(attachment.amountCents / 100).toFixed(2)}</b>
          <small>{attachment.note || "转账"}</small>
        </span>
      </div>
    );
  if (attachment.type === "commerce")
    return (
      <div className="capture-attachment-card">
        <Gift />
        <span>
          <b>{attachment.title}</b>
          <small>
            {attachment.itemNames.join("、")} · ¥
            {(attachment.amountCents / 100).toFixed(2)}
          </small>
        </span>
      </div>
    );
  if (attachment.type === "call")
    return (
      <div className="capture-attachment-card">
        <Phone />
        <span>
          <b>{attachment.callType === "video" ? "视频通话" : "语音通话"}</b>
          <small>{attachment.summary}</small>
        </span>
      </div>
    );
  if (attachment.type === "meet-invitation" || attachment.type === "meet-event")
    return (
      <div className="capture-attachment-card">
        <Footprints />
        <span>
          <b>{attachment.type === "meet-invitation" ? "见面邀请" : "见面记录"}</b>
          <small>
            {attachment.type === "meet-invitation"
              ? attachment.invitationText
              : attachment.summary}
          </small>
        </span>
      </div>
    );
  if (attachment.type === "couple-island-invitation")
    return (
      <div className="capture-attachment-card capture-couple-island-card">
        <HeartHandshake />
        <span>
          <b>{attachment.cardRole === "response" || message.senderType === "character" ? (attachment.state === "accepted" ? "接受茶侣岛邀请" : "暂时拒绝邀请") : "茶侣岛邀请"}</b>
          <small>{attachment.state === "accepted" ? "已接受，一座共同小岛已经开放" : attachment.state === "declined" ? `已拒绝${attachment.reason ? `：${attachment.reason}` : ""}` : "等待角色回应"}</small>
        </span>
      </div>
    );
  if (attachment.type === "red-packet")
    return (
      <div className="capture-attachment-card">
        <Gift />
        <span>
          <b>群聊红包 ¥{(attachment.totalAmountCents / 100).toFixed(2)}</b>
          <small>{attachment.note}</small>
        </span>
      </div>
    );
  if (attachment.type === "poll")
    return (
      <div className="capture-attachment-card">
        <Vote />
        <span>
          <b>{attachment.question}</b>
          <small>{attachment.options.map((option) => option.text).join(" · ")}</small>
        </span>
      </div>
    );
  const musicTitle = attachment.type === "music-invitation" ? "一起听邀请" : attachment.type === "music-search-candidates" ? "角色 DJ 候选" : attachment.type === "music-control-proposal" ? "播放控制建议" : attachment.type === "music-session-summary" ? "一起听小结" : "一起听事件";
  return (
    <div className="capture-attachment-card">
      <Music2 />
      <span><b>{musicTitle}</b><small>音乐互动</small></span>
    </div>
  );
}

function StaticMessageContent({
  message,
  assets,
  autoTranslate,
}: {
  message: Message;
  assets: Map<string, MediaAsset>;
  autoTranslate: boolean;
}) {
  const attachment = message.attachments?.[0];
  if (attachment) return attachmentContent(attachment, message, assets);
  const translated =
    autoTranslate &&
    message.translation?.status === "complete" &&
    message.translation.text;
  return translated ? (
    <div className="translated-message-text">
      <span>{message.content}</span>
      <i />
      <strong>{message.translation!.text}</strong>
    </div>
  ) : (
    <>{message.content}</>
  );
}

export function ChatSelectionCapturePreview({
  title,
  messages,
  actors,
  assets,
  userName,
  userAvatar,
  showCharacterAvatar,
  showUserAvatar,
  autoTranslate,
  bubbleStyle,
  avatarShape,
  characterAvatarSize,
  fontScale,
  width,
  backgroundUrl,
  onClose,
  onReturn,
  onResult,
}: {
  title: string;
  messages: Message[];
  actors: Map<string, ChatCaptureActor>;
  assets: Map<string, MediaAsset>;
  userName: string;
  userAvatar?: string;
  showCharacterAvatar: boolean;
  showUserAvatar: boolean;
  autoTranslate: boolean;
  bubbleStyle: string;
  avatarShape: string;
  characterAvatarSize: number;
  fontScale: number;
  width: number;
  backgroundUrl?: string;
  onClose: () => void;
  onReturn: () => void;
  onResult: (message: string) => void;
}) {
  const exportRef = useRef<HTMLDivElement>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [busy, onClose]);
  const save = async () => {
    if (!exportRef.current || busy) return;
    setBusy(true);
    try {
      const dark = document.documentElement.dataset.chachaTheme === "dark",backgroundColor=dark ? "#101014" : "#f7f7f8";
      let blob:Blob;
      try{blob=await captureElementAsPng(exportRef.current,backgroundColor)}catch(error){
        if(!backgroundUrl)throw error;
        const previous=exportRef.current.style.getPropertyValue("--chat-background-image");
        exportRef.current.style.setProperty("--chat-background-image","none");
        exportRef.current.classList.remove("has-chat-background");
        try{blob=await captureElementAsPng(exportRef.current,backgroundColor)}finally{exportRef.current.style.setProperty("--chat-background-image",previous);exportRef.current.classList.add("has-chat-background")}
      }
      const result = await shareOrDownloadCapture(
          blob,
          captureFileName(title),
          `${title}的聊天截图`,
        );
      onResult(result === "shared" ? "已打开系统分享" : "聊天截图已保存");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        onResult("已取消分享");
      else onResult("截图生成失败，失效图片已使用占位后仍无法导出");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="chat-capture-preview-shade"
      role="dialog"
      aria-modal="true"
      aria-label="聊天截图预览"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="chat-capture-preview">
        <header>
          <button disabled={busy} onClick={onReturn}>
            <ArrowLeft />
            返回修改
          </button>
          <div>
            <b>聊天截图预览</b>
            <small>{messages.length} 条已选消息</small>
          </div>
          <button aria-label="关闭" disabled={busy} onClick={onClose}>
            <X />
          </button>
        </header>
        <main>
          <div
            ref={exportRef}
            className={`chat-capture-document chat-page chat-bubble-${bubbleStyle} chat-avatar-${avatarShape} ${backgroundUrl?"has-chat-background":""}`}
            style={
              {
                width: `${Math.max(280, width)}px`,
                "--chat-character-avatar-size": `${characterAvatarSize}px`,
                "--chat-font-scale": String(fontScale / 100),
                "--chat-background-image": backgroundUrl?`url(${JSON.stringify(backgroundUrl)})`:"none",
              } as React.CSSProperties
            }
          >
            {messages.map((message) => {
              const mine = message.senderType === "user",
                actor = message.senderId
                  ? actors.get(message.senderId)
                  : undefined,
                reaction = userReactionOf(message),
                stickerOnly =
                  message.kind === "sticker" ||
                  (message.attachments?.length === 1 &&
                    message.attachments[0]?.type === "sticker"),
                cardOnly = isCardOnlyMessage(message);
              return (
                <div
                  className={`message-row ${mine ? "mine" : message.senderType === "system" ? "system" : "theirs"} ${stickerOnly ? "sticker-only" : ""} ${cardOnly ? "card-only" : ""}`}
                  key={message.id}
                >
                  {!mine &&
                    message.senderType !== "system" &&
                    showCharacterAvatar && (
                      <Avatar
                        text={actor?.name ?? "角色"}
                        src={actor?.avatar}
                        size="sm"
                      />
                    )}
                  <div className="message-main">
                    {actor && !mine && <span className="speaker-name">{actor.name}</span>}
                    {message.quote && (
                      <div
                        className={`message-quote-card ${mine ? "mine" : "theirs"}`}
                      >
                        <span>{message.quote.senderName}</span>
                        <b>{message.quote.preview}</b>
                      </div>
                    )}
                    <div className="message-bubble-line">
                      <div className="bubble-shell">
                        <div className={`bubble ${stickerOnly ? "sticker-bubble" : ""} ${cardOnly ? "card-bubble" : ""}`}>
                          <StaticMessageContent
                            message={message}
                            assets={assets}
                            autoTranslate={autoTranslate}
                          />
                        </div>
                        {reaction && (
                          <MessageReactionBadge
                            kind={reaction.kind}
                            mine={mine}
                          />
                        )}
                      </div>
                      <time>{stamp(message.createdAt)}</time>
                    </div>
                  </div>
                  {mine && showUserAvatar && (
                    <Avatar text={userName || "我"} src={userAvatar} size="sm" />
                  )}
                </div>
              );
            })}
          </div>
        </main>
        <footer>
          <button disabled={busy} onClick={onReturn}>
            返回修改选择
          </button>
          <button className="primary" disabled={busy} onClick={() => void save()}>
            <Share2 />
            {busy ? "正在准备图片…" : "保存 / 分享"}
          </button>
        </footer>
      </section>
    </div>
  );
}


