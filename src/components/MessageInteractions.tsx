import {
  Check,
  Copy,
  Edit3,
  Languages,
  RefreshCw,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type {
  MediaAsset,
  Message,
  MessageQuote,
  MessageReactionKind,
} from "../core/types";
import { isCardOnlyMessage } from "../core/messagePresentation";
import { MESSAGE_REACTION_META } from "../core/messageInteractions";
import { RichMessageContent } from "./ChatMedia";

export interface MessageActionAnchor {
  top: number;
  left: number;
  width: number;
  height: number;
  rootWidth: number;
  rootHeight: number;
  fontSize?: string;
  lineHeight?: string;
  fontFamily?: string;
  fontWeight?: string;
  letterSpacing?: string;
}

export function MessageQuoteCard({
  quote,
  onOpen,
  mine = false,
}: {
  quote: MessageQuote;
  onOpen?: () => void;
  mine?: boolean;
}) {
  return (
    <button
      type="button"
      className={`message-quote-card ${mine ? "mine" : "theirs"}`}
      onClick={onOpen}
      disabled={!onOpen}
    >
      <span>
        <Reply />
        回复了 {quote.senderName}
      </span>
      <b>{quote.preview}</b>
    </button>
  );
}

export function ComposerQuotePreview({
  quote,
  onCancel,
}: {
  quote: MessageQuote;
  onCancel: () => void;
}) {
  return (
    <div className="composer-quote-preview">
      <span>
        <Reply />
        <i />
      </span>
      <div>
        <small>回复 {quote.senderName}</small>
        <b>{quote.preview}</b>
      </div>
      <button type="button" aria-label="取消引用" onClick={onCancel}>
        <X />
      </button>
    </div>
  );
}

export function MessageReactionBadge({
  kind,
  mine,
}: {
  kind: MessageReactionKind;
  mine: boolean;
}) {
  return (
    <span
      className={`message-reaction-badge ${mine ? "mine" : "theirs"}`}
      aria-label={`回应：${MESSAGE_REACTION_META[kind].label}`}
    >
      {MESSAGE_REACTION_META[kind].emoji}
    </span>
  );
}

export function MessageActionOverlay({
  message,
  assets,
  anchor,
  currentReaction,
  canEdit,
  canRegenerate,
  onClose,
  onQuote,
  onRegenerate,
  onCopy,
  onEdit,
  onMulti,
  onDelete,
  onReact,
  translationLabel,
  onTranslate,
}: {
  message: Message;
  assets: Map<string, MediaAsset>;
  anchor: MessageActionAnchor;
  currentReaction?: MessageReactionKind;
  canEdit: boolean;
  canRegenerate: boolean;
  onClose: () => void;
  onQuote: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onMulti: () => void;
  onDelete: () => void;
  onReact: (kind: MessageReactionKind) => void;
  translationLabel?: string;
  onTranslate?: () => void;
}) {
  const mine = message.senderType === "user",
    previewRef = useRef<HTMLDivElement>(null),
    reactionRef = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLDivElement>(null),
    [layout, setLayout] = useState<{
      previewTop: number;
      reactionTop: number;
      menuTop: number;
    }>();
  const reactionLeft = Math.max(
      12,
      Math.min(anchor.rootWidth - 300, anchor.left + anchor.width / 2 - 145),
    ),
    menuLeft = mine
      ? Math.max(
          12,
          Math.min(anchor.rootWidth - 252, anchor.left + anchor.width - 252),
        )
      : Math.max(12, Math.min(anchor.rootWidth - 252, anchor.left)),
    menuAbove = anchor.top + anchor.height / 2 > anchor.rootHeight / 2;
  useLayoutEffect(() => {
    const previewHeight = previewRef.current?.offsetHeight ?? anchor.height,
      reactionHeight = reactionRef.current?.offsetHeight ?? 52,
      menuHeight = menuRef.current?.offsetHeight ?? 300,
      gap = 10,
      safe = 12,
      spaceAbove = menuAbove ? menuHeight + gap : reactionHeight + gap,
      spaceBelow = menuAbove ? reactionHeight + gap : menuHeight + gap,
      minTop = safe + spaceAbove,
      maxTop = Math.max(
        minTop,
        anchor.rootHeight - safe - spaceBelow - previewHeight,
      ),
      previewTop = Math.max(minTop, Math.min(maxTop, anchor.top)),
      reactionTop = menuAbove
        ? previewTop + previewHeight + gap
        : previewTop - reactionHeight - gap,
      menuTop = menuAbove
        ? previewTop - menuHeight - gap
        : previewTop + previewHeight + gap;
    setLayout({ previewTop, reactionTop, menuTop });
  }, [anchor, menuAbove, message.id, message.translation?.text]);
  const previewStyle = {
      top: layout?.previewTop ?? anchor.top,
      left: anchor.left,
      width: anchor.width,
      minWidth: anchor.width,
      fontSize: anchor.fontSize,
      lineHeight: anchor.lineHeight,
      fontFamily: anchor.fontFamily,
      fontWeight: anchor.fontWeight,
      letterSpacing: anchor.letterSpacing,
      visibility: layout ? "visible" : "hidden",
    } as CSSProperties,
    reactionStyle = {
      left: reactionLeft,
      top: layout?.reactionTop ?? 12,
      visibility: layout ? "visible" : "hidden",
    } as CSSProperties,
    menuStyle = {
      left: menuLeft,
      top: layout?.menuTop ?? 12,
      visibility: layout ? "visible" : "hidden",
    } as CSSProperties;
  const stickerOnly =
    message.kind === "sticker" ||
    (message.attachments?.length === 1 &&
      message.attachments[0]?.type === "sticker"),
    cardOnly = isCardOnlyMessage(message);
  return (
    <div
      className="message-action-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="消息操作"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div
        ref={previewRef}
        className={`action-message-preview message-row ${mine ? "mine" : "theirs"} ${stickerOnly ? "sticker-only" : ""} ${cardOnly ? "card-only" : ""}`}
        style={previewStyle}
      >
        <div className="message-main">
          <div className="message-bubble-line">
            <div className={`bubble ${stickerOnly ? "sticker-bubble" : ""} ${cardOnly ? "card-bubble" : ""}`}> 
              <RichMessageContent message={message} assets={assets} />
            </div>
          </div>
        </div>
      </div>
      <div
        ref={reactionRef}
        className="message-reaction-picker"
        style={reactionStyle}
      >
        {(Object.keys(MESSAGE_REACTION_META) as MessageReactionKind[]).map(
          (kind) => (
            <button
              type="button"
              key={kind}
              className={currentReaction === kind ? "active" : ""}
              aria-label={MESSAGE_REACTION_META[kind].label}
              aria-pressed={currentReaction === kind}
              onClick={() => onReact(kind)}
            >
              {MESSAGE_REACTION_META[kind].emoji}
            </button>
          ),
        )}
      </div>
      <div
        ref={menuRef}
        className={`message-action-menu ${menuAbove ? "above" : "below"}`}
        style={menuStyle}
      >
        <button type="button" onClick={onQuote}>
          <span>引用</span>
          <Reply />
        </button>
        {canRegenerate && (
          <button type="button" onClick={onRegenerate}>
            <span>重新生成</span>
            <RefreshCw />
          </button>
        )}
        {translationLabel && onTranslate && (
          <button type="button" onClick={onTranslate}>
            <span>{translationLabel}</span>
            <Languages />
          </button>
        )}
        <button type="button" onClick={onCopy}>
          <span>复制</span>
          <Copy />
        </button>
        {canEdit && (
          <button type="button" onClick={onEdit}>
            <span>编辑</span>
            <Edit3 />
          </button>
        )}
        <button type="button" onClick={onMulti}>
          <span>多选</span>
          <Check />
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          <span>删除</span>
          <Trash2 />
        </button>
      </div>
    </div>
  );
}

