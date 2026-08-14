import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Heart,
  List,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "./ui";
import { db } from "../core/db";
import {
  INNER_VOICE_SECTION_DEFINITIONS,
  innerVoiceSourceChanged,
} from "../core/innerVoice";
import {
  innerVoiceTurnMessages,
  resolveInnerVoiceForumHandle,
  selectInnerVoiceMessages,
  type InnerVoiceActorType,
} from "../core/innerVoiceView";
import type { Message, MessageInnerVoice } from "../core/types";

const timeText = (value: number) =>
  new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const fileStamp = (value: number) =>
  new Date(value).toISOString().replace(/[:.]/g, "-");

const safeFileName = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 60) || "角色";

type DisplaySection = {
  key: string;
  title: string;
  tab: string;
  content: string;
};

export function displayInnerVoiceSections(
  voice: MessageInnerVoice,
): DisplaySection[] {
  if (voice.sections) {
    return INNER_VOICE_SECTION_DEFINITIONS.map(({ key, title, tab }) => ({
      key,
      title,
      tab,
      content: voice.sections![key],
    }));
  }
  const legacyTranslation =
    voice.translation?.status === "complete" ? voice.translation.text?.trim() : "";
  return [
    {
      key: "legacy",
      title: "旧日心声",
      tab: "旧日",
      content: legacyTranslation || voice.content,
    },
  ];
}

export function useInnerVoiceForumHandle(
  actorType: InnerVoiceActorType,
  actorId: string,
  actorName: string,
) {
  const [handle, setHandle] = useState<string>();
  useEffect(() => {
    let active = true;
    setHandle(undefined);
    void db.forumServers.toArray().then((servers) => {
      if (!active) return;
      setHandle(
        resolveInnerVoiceForumHandle({ actorType, actorId, actorName, servers }),
      );
    });
    return () => {
      active = false;
    };
  }, [actorType, actorId, actorName]);
  return handle;
}

export interface InnerVoiceCardProps {
  message: Message;
  conversationMessages: Message[];
  actorName: string;
  actorAvatar?: string;
  actorHandle?: string;
  pageLabel?: string;
  onChanged: () => Promise<void> | void;
  onSource: (messageId: string) => void;
  onAll?: () => void;
  onNotice?: (message: string) => void;
}

export function InnerVoiceCard({
  message,
  conversationMessages,
  actorName,
  actorAvatar,
  actorHandle,
  pageLabel,
  onChanged,
  onSource,
  onAll,
  onNotice,
}: InnerVoiceCardProps) {
  const cardRef = useRef<HTMLElement>(null),
    scrollRef = useRef<HTMLDivElement>(null),
    sectionRefs = useRef<Record<string, HTMLElement | null>>({}),
    [liking, setLiking] = useState(false),
    [exporting, setExporting] = useState(false),
    [status, setStatus] = useState(""),
    [activeSection, setActiveSection] = useState("");
  const voice = message.innerVoice!,
    sections = useMemo(() => displayInnerVoiceSections(voice), [voice]),
    turnMessages = innerVoiceTurnMessages(conversationMessages, message),
    sourceMessage = turnMessages[0],
    changed = innerVoiceSourceChanged(voice, conversationMessages),
    liked = Boolean(voice.favoritedAt);

  useEffect(() => {
    setActiveSection(sections[0]?.key ?? "");
    const root = scrollRef.current;
    if (root) {
      if (typeof root.scrollTo === "function") root.scrollTo({ top: 0 });
      else root.scrollTop = 0;
    }
  }, [voice.id, sections]);

  const notify = (value: string) => {
    setStatus(value);
    onNotice?.(value);
    window.setTimeout(
      () => setStatus((current) => (current === value ? "" : current)),
      1800,
    );
  };

  const toggleFavorite = async () => {
    if (liking) return;
    setLiking(true);
    try {
      const stored = await db.messages.get(message.id);
      if (!stored?.innerVoice) return;
      const { favoritedAt: _favoritedAt, ...rest } = stored.innerVoice;
      await db.messages.update(message.id, {
        innerVoice: stored.innerVoice.favoritedAt
          ? rest
          : { ...stored.innerVoice, favoritedAt: Date.now() },
        updatedAt: Date.now(),
      });
      await onChanged();
    } finally {
      setLiking(false);
    }
  };

  const saveImage = async () => {
    const source = cardRef.current;
    if (!source || exporting) return;
    setExporting(true);
    let clone: HTMLElement | undefined;
    try {
      clone = source.cloneNode(true) as HTMLElement;
      clone.classList.add("inner-voice-export-clone");
      clone.style.width = `${source.getBoundingClientRect().width}px`;
      clone.style.maxHeight = "none";
      clone.style.height = "auto";
      clone
        .querySelectorAll(
          ".inner-voice-card-actions,.inner-voice-card-status",
        )
        .forEach((node) => node.remove());
      const cloneScroll = clone.querySelector<HTMLElement>(
        ".inner-voice-card-scroll",
      );
      if (cloneScroll) {
        cloneScroll.style.maxHeight = "none";
        cloneScroll.style.height = "auto";
        cloneScroll.style.overflow = "visible";
      }
      const cloneTabs = clone.querySelector<HTMLElement>(
        ".inner-voice-section-index",
      );
      if (cloneTabs) cloneTabs.style.overflow = "visible";
      document.body.appendChild(clone);
      const { default: html2canvas } = await import("html2canvas"),
        canvas = await html2canvas(clone, {
          backgroundColor: "#ffffff",
          scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
          useCORS: true,
          logging: false,
        }),
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
      if (!blob) throw new Error("capture_failed");
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(actorName)}-心声-${fileStamp(voice.createdAt)}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("心声日记已保存");
    } catch {
      notify("存图失败，请检查头像图片是否允许跨域访问");
    } finally {
      clone?.remove();
      setExporting(false);
    }
  };

  const scrollToSection = (key: string) => {
    const target = sectionRefs.current[key],
      root = scrollRef.current;
    if (!target || !root) return;
    const top = Math.max(0, target.offsetTop - 12);
    if (typeof root.scrollTo === "function")
      root.scrollTo({ top, behavior: "smooth" });
    else root.scrollTop = top;
    setActiveSection(key);
  };

  const updateActiveSection = () => {
    const root = scrollRef.current;
    if (!root) return;
    const marker = root.scrollTop + 54;
    let current = sections[0]?.key ?? "";
    for (const section of sections) {
      const node = sectionRefs.current[section.key];
      if (node && node.offsetTop <= marker) current = section.key;
    }
    setActiveSection(current);
  };

  return (
    <article className="inner-voice-card" ref={cardRef}>
      <div className="inner-voice-coils" aria-hidden="true" />
      <header className="inner-voice-card-author">
        <Avatar text={actorName} src={actorAvatar} size="md" />
        <div>
          <b>{actorName}</b>
          {actorHandle && <span>{actorHandle}</span>}
        </div>
        <time>{timeText(voice.createdAt)}</time>
        {pageLabel && <strong className="inner-voice-page-number">{pageLabel}</strong>}
      </header>
      <nav className="inner-voice-section-index" aria-label="心声章节索引">
        {sections.map((section, index) => (
          <button
            type="button"
            key={section.key}
            className={`inner-voice-index-tab tab-${index + 1} ${activeSection === section.key ? "is-active" : ""}`}
            onClick={() => scrollToSection(section.key)}
          >
            {section.tab}
          </button>
        ))}
      </nav>
      <div
        className="inner-voice-card-scroll"
        ref={scrollRef}
        onScroll={updateActiveSection}
      >
        <div className="inner-voice-sections">
          {sections.map((section) => (
            <section
              className="inner-voice-section"
              key={section.key}
              ref={(node) => {
                sectionRefs.current[section.key] = node;
              }}
            >
              <h3>{section.title}</h3>
              <p>{section.content}</p>
            </section>
          ))}
        </div>
        {changed && (
          <small className="inner-voice-stale">来源回复后来被编辑过</small>
        )}
        <div className="inner-voice-card-meta">
          <time>
            <Clock3 />
            {timeText(voice.createdAt)}
          </time>
          <span>
            <LockKeyhole />私密
          </span>
        </div>
      </div>
      <footer className="inner-voice-card-actions">
        <button
          type="button"
          className={liked ? "is-liked" : ""}
          aria-pressed={liked}
          disabled={liking}
          onClick={() => void toggleFavorite()}
        >
          <Heart fill={liked ? "currentColor" : "none"} />
          {liked ? "已喜欢" : "喜欢"}
        </button>
        <button
          type="button"
          disabled={!sourceMessage}
          onClick={() => sourceMessage && onSource(sourceMessage.id)}
        >
          <MessageCircle />来源
        </button>
        <button type="button" disabled={exporting} onClick={() => void saveImage()}>
          <Download />{exporting ? "保存中" : "存图"}
        </button>
        {onAll && (
          <button type="button" onClick={onAll}>
            <List />全部
          </button>
        )}
      </footer>
      {status && (
        <small className="inner-voice-card-status" aria-live="polite">
          {status}
        </small>
      )}
    </article>
  );
}

export interface InnerVoiceDialogProps {
  actorType: InnerVoiceActorType;
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  conversationId: string;
  conversationMessages: Message[];
  enabled: boolean;
  initialMessageId?: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onSource: (messageId: string) => void;
  onAll: () => void;
  onNotice?: (message: string) => void;
}

function initialEntryIndex(entries: Message[], messages: Message[], messageId?: string) {
  if (!messageId) return 0;
  const clicked = messages.find((message) => message.id === messageId),
    turnId = clicked?.generation?.speakerTurnId ?? clicked?.innerVoice?.speakerTurnId;
  const index = entries.findIndex(
    (message) =>
      message.id === messageId ||
      (turnId && message.innerVoice?.speakerTurnId === turnId),
  );
  return index < 0 ? 0 : index;
}

export function InnerVoiceDialog({
  actorType,
  actorId,
  actorName,
  actorAvatar,
  conversationId,
  conversationMessages,
  enabled,
  initialMessageId,
  onClose,
  onChanged,
  onSource,
  onAll,
  onNotice,
}: InnerVoiceDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null),
    swipeStart = useRef<{ x: number; y: number } | undefined>(undefined),
    actorHandle = useInnerVoiceForumHandle(actorType, actorId, actorName),
    entries = useMemo(
      () =>
        selectInnerVoiceMessages(
          conversationMessages,
          conversationId,
          actorType,
          actorId,
        ),
      [conversationMessages, conversationId, actorType, actorId],
    ),
    [currentIndex, setCurrentIndex] = useState(() =>
      initialEntryIndex(entries, conversationMessages, initialMessageId),
    );

  useEffect(() => {
    setCurrentIndex(initialEntryIndex(entries, conversationMessages, initialMessageId));
  }, [actorType, actorId, initialMessageId]);

  useEffect(() => {
    setCurrentIndex((value) => Math.min(value, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft")
          setCurrentIndex((value) => Math.min(entries.length - 1, value + 1));
        if (event.key === "ArrowRight")
          setCurrentIndex((value) => Math.max(0, value - 1));
      };
    closeRef.current?.focus();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [entries.length, onClose]);

  const current = entries[currentIndex],
    goOlder = () => setCurrentIndex((value) => Math.min(entries.length - 1, value + 1)),
    goNewer = () => setCurrentIndex((value) => Math.max(0, value - 1));

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = undefined;
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx > 0) goOlder();
    else goNewer();
  };

  return (
    <div
      className="inner-voice-dialog-shade"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="inner-voice-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${actorName}的心声`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <button
          ref={closeRef}
          type="button"
          className="inner-voice-dialog-close"
          aria-label="关闭心声"
          onClick={onClose}
        >
          <X />
        </button>
        {!enabled && (
          <div className="inner-voice-disabled dialog-note">
            当前群聊已关闭新心声生成，已有记录仍会保留。
          </div>
        )}
        {current ? (
          <div className="inner-voice-dialog-stage">
            <button
              type="button"
              className="inner-voice-history-arrow is-left"
              aria-label="上一页心声"
              disabled={currentIndex >= entries.length - 1}
              onClick={goOlder}
            >
              <ChevronLeft />
            </button>
            <InnerVoiceCard
              key={current.innerVoice!.id}
              message={current}
              conversationMessages={conversationMessages}
              actorName={actorName}
              actorAvatar={actorAvatar}
              actorHandle={actorHandle}
              pageLabel={`${currentIndex + 1} / ${entries.length}`}
              onChanged={onChanged}
              onSource={onSource}
              onAll={onAll}
              onNotice={onNotice}
            />
            <button
              type="button"
              className="inner-voice-history-arrow is-right"
              aria-label="下一页心声"
              disabled={currentIndex <= 0}
              onClick={goNewer}
            >
              <ChevronRight />
            </button>
          </div>
        ) : (
          <div className="inner-voice-empty compact">
            <Sparkles />
            <h2>还没有心声</h2>
            <p>之后产生的新角色回复，会把结构化的中文心声记录在这里。</p>
            <button type="button" onClick={onAll}>查看全部心声</button>
          </div>
        )}
      </section>
    </div>
  );
}