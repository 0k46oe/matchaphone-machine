import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  Forward,
  Inbox,
  Mail,
  MapPin,
  MessageCircleMore,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { Modal } from "../components/ui";
import {
  getCharacterPhoneState,
  movePhoneMailToTrash,
  restorePhoneMail,
  retryPhoneMailReply,
  retryPhoneTalkReply,
  savePhoneMailDraft,
} from "../core/phoneEcosystem";
import {
  sendEnhancedMail,
  sendEnhancedTalkMessage,
} from "../core/phoneEcosystemEnhancements";
import { autoTranslateCharacter } from "../core/bilingual";
import type {
  Character,
  CharacterPhoneState,
  PhoneContact,
  PhoneMailMessage,
  ProviderSettings,
} from "../core/types";

const fmt = (value: number) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const timeOnly = (value: number) =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
type OpenTarget = (
  app: "messages" | "mail" | "calls",
  contactId?: string,
) => void;

export function PersistentTalkApp({
  character,
  state,
  provider,
  onChange,
  onBack,
  initialContactId,
  onOpen,
}: {
  character: Character;
  state: CharacterPhoneState;
  provider: ProviderSettings;
  onChange: (state: CharacterPhoneState) => void;
  onBack: () => void;
  initialContactId?: string;
  onOpen: OpenTarget;
}) {
  const [selected, setSelected] = useState(initialContactId ?? ""),
    [profile, setProfile] = useState(""),
    [tab, setTab] = useState<"chats" | "contacts" | "discover">("chats"),
    [text, setText] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialContactId) setSelected(initialContactId);
  }, [initialContactId]);
  const contact = state.contacts.find((item) => item.id === selected),
    profileContact = state.contacts.find((item) => item.id === profile),
    thread = contact
      ? state.talkThreads.find((item) => item.contactId === contact.id)
      : undefined;
  const submit = async () => {
    if (!contact || !text.trim() || busy) return;
    setBusy(true);
    setError("");
    const content = text.trim();
    setConfirm(false);
    setText("");
    try {
      const next = await sendEnhancedTalkMessage({
        characterId: character.id,
        contactId: contact.id,
        content,
        provider,
      });
      onChange(next);
    } catch (e) {
      const next = await getCharacterPhoneState(character.id);
      if (next) onChange(next);
      setError(e instanceof Error ? e.message : "消息已发出，但暂未收到回复");
    } finally {
      setBusy(false);
    }
  };
  const retry = async (eventId: string) => {
    setBusy(true);
    setError("");
    try {
      onChange(
        await retryPhoneTalkReply({
          characterId: character.id,
          eventId,
          provider,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法收取回复");
    } finally {
      setBusy(false);
    }
  };
  if (profileContact)
    return (
      <div className="phone-messages-content talk-profile">
        <header className="talk-main-head">
          <button onClick={() => setProfile("")}>
            <ChevronLeft />
          </button>
          <b>联系人资料</b>
          <span />
        </header>
        <section className="talk-profile-card">
          <span>
            {profileContact.avatarText || profileContact.name.slice(0, 1)}
          </span>
          <h2>{profileContact.name}</h2>
          <b>{profileContact.relationship}</b>
          <small>{profileContact.status || "最近保持联系"}</small>
          <p>{profileContact.persona}</p>
          <div className="phone-contact-actions">
            <button
              onClick={() => {
                setProfile("");
                setSelected(profileContact.id);
              }}
            >
              <MessageCircleMore />发 Talk
            </button>
            <button onClick={() => onOpen("mail", profileContact.id)}>
              <Mail />
              发邮件
            </button>
          </div>
        </section>
      </div>
    );
  if (contact)
    return (
      <div className="phone-messages-content talk-room">
        <div className="talk-room-wallpaper" aria-hidden="true" />
        <header className="talk-room-head">
          <button onClick={() => setSelected("")}>
            <ChevronLeft />
          </button>
          <span>{contact.avatarText || contact.name.slice(0, 1)}</span>
          <div>
            <b>{contact.name}</b>
            <small>{contact.relationship}</small>
          </div>
          <button onClick={() => setProfile(contact.id)}>
            <Search />
          </button>
        </header>
        <section className="talk-chat-thread">
          <time>Talk</time>
          {(thread?.messages ?? []).map((message) => (
            <article
              key={message.id}
              className={message.senderType === "character" ? "owner" : "other"}
            >
              {message.senderType === "contact" && (
                <span>{contact.name.slice(0, 1)}</span>
              )}
              <div>
                <small>
                  {message.senderType === "character"
                    ? character.name
                    : contact.name}
                </small>
                <p>{message.content}</p>
                {autoTranslateCharacter(character) &&
                  message.translation?.status === "complete" &&
                  message.translation.text && (
                    <p className="content-translation phone-translation">
                      {message.translation.text}
                    </p>
                  )}
                <em>{timeOnly(message.createdAt)}</em>
                {message.replyStatus === "pending" && <i>对方正在回复…</i>}
                {message.replyStatus === "failed" &&
                  message.generationEventId && (
                    <button
                      className="phone-inline-retry"
                      disabled={busy}
                      onClick={() => void retry(message.generationEventId!)}
                    >
                      <RefreshCw />
                      重试收取回复
                    </button>
                  )}
              </div>
            </article>
          ))}
        </section>
        {error && <p className="phone-ecosystem-error">{error}</p>}
        <footer className="talk-composer editable">
          <input
            value={text}
            maxLength={2000}
            placeholder={`以 ${character.name} 的身份发送`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                e.preventDefault();
                setConfirm(true);
              }
            }}
          />
          <button
            aria-label="发送"
            disabled={!text.trim() || busy}
            onClick={() => setConfirm(true)}
          >
            <Send />
          </button>
        </footer>
        {confirm && (
          <ConfirmSend
            character={character}
            kind="Talk 消息"
            preview={text}
            busy={busy}
            onCancel={() => setConfirm(false)}
            onConfirm={() => void submit()}
          />
        )}
      </div>
    );
  const discussions = (state.appContents.messages as any)?.discoveries ?? [],
    services = (state.appContents.messages as any)?.services ?? [];
  return (
    <div className="phone-messages-content talk-list">
      <header className="talk-main-head">
        <button onClick={onBack}>
          <ChevronLeft />
        </button>
        <b>
          {tab === "chats" ? "Talk" : tab === "contacts" ? "联系人" : "发现"}
        </b>
        <button>
          <Search />
        </button>
      </header>
      <main className="talk-tab-content">
        {tab === "chats" && (
          <nav className="talk-chat-list">
            {state.talkThreads
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((item) => {
                const person = state.contacts.find(
                  (c) => c.id === item.contactId,
                );
                if (!person) return null;
                return (
                  <button key={item.id} onClick={() => setSelected(person.id)}>
                    <span>{person.avatarText || person.name.slice(0, 1)}</span>
                    <div>
                      <b>{person.name}</b>
                      <p>{item.messages.at(-1)?.content || "开始聊天"}</p>
                    </div>
                    <small>{fmt(item.updatedAt)}</small>
                    <ChevronRight />
                  </button>
                );
              })}
          </nav>
        )}
        {tab === "contacts" && (
          <section className="talk-contact-list">
            {state.contacts.map((item) => (
              <button key={item.id} onClick={() => setProfile(item.id)}>
                <span>{item.avatarText || item.name.slice(0, 1)}</span>
                <div>
                  <b>{item.name}</b>
                  <p>{item.status || item.relationship}</p>
                </div>
                <small>{item.relationship}</small>
                <ChevronRight />
              </button>
            ))}
          </section>
        )}
        {tab === "discover" && (
          <section className="talk-discover">
            <div className="talk-discovery-feed">
              {discussions.map((item: any, index: number) => (
                <article key={index}>
                  <span>{String(item.author || "友").slice(0, 1)}</span>
                  <div>
                    <b>{item.author}</b>
                    <small>
                      {item.category} · {item.time}
                    </small>
                    <p>{item.content}</p>
                  </div>
                </article>
              ))}
            </div>
            <h3>服务与话题</h3>
            <div className="talk-service-grid">
              {services.map((item: any, index: number) => (
                <article key={index}>
                  <Compass />
                  <div>
                    <b>{item.title}</b>
                    <p>{item.subtitle}</p>
                  </div>
                  <small>{item.category}</small>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer className="talk-tabbar">
        <button
          className={tab === "chats" ? "active" : ""}
          onClick={() => setTab("chats")}
        >
          <MessageCircleMore />
          <span>聊天</span>
        </button>
        <button
          className={tab === "contacts" ? "active" : ""}
          onClick={() => setTab("contacts")}
        >
          <Users />
          <span>联系人</span>
        </button>
        <button
          className={tab === "discover" ? "active" : ""}
          onClick={() => setTab("discover")}
        >
          <Compass />
          <span>发现</span>
        </button>
      </footer>
    </div>
  );
}

function ConfirmSend({
  character,
  kind,
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  character: Character;
  kind: string;
  preview: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <div className="phone-send-confirm">
        <Send />
        <small>IDENTITY CONFIRMATION</small>
        <h2>以角色身份发送？</h2>
        <p>
          将以「{character.name}」的身份发送这条{kind}
          。对方和角色本人以后可能察觉。
        </p>
        <blockquote>{preview.slice(0, 280)}</blockquote>
        <div>
          <button onClick={onCancel}>取消</button>
          <button disabled={busy} onClick={onConfirm}>
            {busy ? "发送中…" : "确认发送"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PhoneContactsApp({
  state,
  onBack,
  onOpen,
  initialContactId,
}: {
  state: CharacterPhoneState;
  onBack: () => void;
  onOpen: OpenTarget;
  initialContactId?: string;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(initialContactId ?? "");
  useEffect(() => {
    if (initialContactId) setSelected(initialContactId);
  }, [initialContactId]);
  const contacts = state.contacts.filter((c) =>
      `${c.name}${c.relationship}${c.status ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    contact = state.contacts.find((c) => c.id === selected);
  if (contact)
    return (
      <div className="phone-contacts-app">
        <header className="ecosystem-app-head">
          <button onClick={() => setSelected("")}>
            <ChevronLeft />
          </button>
          <b>联系人资料</b>
          <span />
        </header>
        <main>
          <section className="ecosystem-contact-card">
            <span>{contact.avatarText || contact.name.slice(0, 1)}</span>
            <h2>{contact.name}</h2>
            <b>{contact.relationship}</b>
            <small>{contact.status || "保持联系"}</small>
            <p>{contact.persona}</p>
          </section>
          <section className="ecosystem-info-list">
            {contact.phone && (
              <div>
                <small>电话</small>
                <b>{contact.phone}</b>
              </div>
            )}
            {contact.email && (
              <div>
                <small>邮箱</small>
                <b>{contact.email}</b>
              </div>
            )}
            {contact.origin && (
              <div>
                <small>联系人来源</small>
                <b>
                  {contact.origin === "initial"
                    ? "原有联系人"
                    : contact.origin === "lore"
                      ? "世界书人物"
                      : contact.origin === "plot"
                        ? "剧情中认识"
                        : "角色主动活动中认识"}
                </b>
              </div>
            )}
            {contact.addresses?.map((item, index) => (
              <div key={index}>
                <small>{item.label}</small>
                <b>{item.address}</b>
              </div>
            ))}
          </section>
          <div className="ecosystem-action-grid">
            <button onClick={() => onOpen("messages", contact.id)}>
              <MessageCircleMore />
              Talk
            </button>
            <button onClick={() => onOpen("mail", contact.id)}>
              <Mail />
              邮件
            </button>
            <button onClick={() => onOpen("calls", contact.id)}>
              <Users />
              通话
            </button>
          </div>
        </main>
      </div>
    );
  return (
    <div className="phone-contacts-app">
      <header className="ecosystem-app-head">
        <button onClick={onBack}>
          <ChevronLeft />
        </button>
        <b>联系人</b>
        <span>{state.contacts.length}/40</span>
      </header>
      <div className="ecosystem-search">
        <Search />
        <input
          value={query}
          placeholder="搜索联系人"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <section className="ecosystem-contact-list">
        {contacts.map((contact) => (
          <button key={contact.id} onClick={() => setSelected(contact.id)}>
            <span>{contact.avatarText || contact.name.slice(0, 1)}</span>
            <div>
              <b>{contact.name}</b>
              <p>{contact.status || contact.relationship}</p>
            </div>
            <small>{contact.relationship}</small>
            <ChevronRight />
          </button>
        ))}
      </section>
    </div>
  );
}
export function PhoneMapsApp({
  state,
  onBack,
  initialPlaceId,
}: {
  state: CharacterPhoneState;
  onBack: () => void;
  initialPlaceId?: string;
}) {
  const [tab, setTab] = useState<"recent" | "saved" | "searches">(
      initialPlaceId ? "saved" : "recent",
    ),
    [selected, setSelected] = useState(initialPlaceId ?? "");
  useEffect(() => {
    if (initialPlaceId) {
      setSelected(initialPlaceId);
      setTab("saved");
    }
  }, [initialPlaceId]);
  const places = new Map(state.maps.savedPlaces.map((p) => [p.id, p])),
    place = places.get(selected);
  if (place)
    return (
      <div className="phone-maps-app">
        <header className="ecosystem-app-head">
          <button onClick={() => setSelected("")}>
            <ChevronLeft />
          </button>
          <b>地点详情</b>
          <MapPin />
        </header>
        <main className="map-place-detail">
          <MapPin />
          <h2>{place.name}</h2>
          <b>{place.category}</b>
          <small>{place.address || "没有详细地址"}</small>
          <p>{place.description}</p>
          {place.relatedContactIds.length > 0 && (
            <section>
              <h3>相关联系人</h3>
              {place.relatedContactIds
                .map((id) => state.contacts.find((item) => item.id === id))
                .filter(Boolean)
                .map((contact) => (
                  <span key={contact!.id}>
                    {contact!.name} · {contact!.relationship}
                  </span>
                ))}
            </section>
          )}
        </main>
      </div>
    );
  return (
    <div className="phone-maps-app">
      <header className="ecosystem-app-head">
        <button onClick={onBack}>
          <ChevronLeft />
        </button>
        <b>地图</b>
        <MapPin />
      </header>
      <div className="maps-hero">
        <MapPin />
        <div>
          <small>角色的地点记录</small>
          <b>{state.maps.savedPlaces.length} 个地点</b>
        </div>
      </div>
      <nav className="ecosystem-segment">
        <button
          className={tab === "recent" ? "active" : ""}
          onClick={() => setTab("recent")}
        >
          最近
        </button>
        <button
          className={tab === "saved" ? "active" : ""}
          onClick={() => setTab("saved")}
        >
          收藏
        </button>
        <button
          className={tab === "searches" ? "active" : ""}
          onClick={() => setTab("searches")}
        >
          搜索
        </button>
      </nav>
      <section className="maps-list">
        {tab === "recent" &&
          state.maps.recentVisits
            .slice()
            .sort((a, b) => b.visitedAt - a.visitedAt)
            .map((visit) => {
              const item = places.get(visit.placeId);
              return item ? (
                <button key={visit.id} onClick={() => setSelected(item.id)}>
                  <MapPin />
                  <div>
                    <b>{item.name}</b>
                    <p>{visit.purpose || item.description}</p>
                    <small>
                      {fmt(visit.visitedAt)} · {item.address || item.category}
                    </small>
                  </div>
                </button>
              ) : null;
            })}
        {tab === "saved" &&
          state.maps.savedPlaces.map((item) => (
            <button key={item.id} onClick={() => setSelected(item.id)}>
              <MapPin />
              <div>
                <b>{item.name}</b>
                <p>{item.description}</p>
                <small>{item.address || item.category}</small>
              </div>
            </button>
          ))}
        {tab === "searches" &&
          state.maps.searches
            .slice()
            .sort((a, b) => b.searchedAt - a.searchedAt)
            .map((item) => (
              <article key={item.id}>
                <Search />
                <div>
                  <b>{item.query}</b>
                  <small>{fmt(item.searchedAt)}</small>
                </div>
              </article>
            ))}
      </section>
    </div>
  );
}
interface ComposeState {
  draftId?: string;
  toContactIds: string[];
  toAddresses: string[];
  subject: string;
  body: string;
  quotedMessageId?: string;
  action: "compose" | "reply" | "forward";
}
const emptyCompose: ComposeState = {
  toContactIds: [],
  toAddresses: [],
  subject: "",
  body: "",
  action: "compose",
};
export function PhoneMailApp({
  character,
  state,
  provider,
  onChange,
  onBack,
  initialTargetId,
}: {
  character: Character;
  state: CharacterPhoneState;
  provider: ProviderSettings;
  onChange: (state: CharacterPhoneState) => void;
  onBack: () => void;
  initialTargetId?: string;
}) {
  const initialMessageId =
      initialTargetId &&
      state.mail.messages.some((item) => item.id === initialTargetId)
        ? initialTargetId
        : "",
    initialContactId =
      initialTargetId &&
      state.contacts.some((item) => item.id === initialTargetId)
        ? initialTargetId
        : undefined;
  const [folder, setFolder] = useState<PhoneMailMessage["folder"]>("inbox"),
    [selected, setSelected] = useState(initialMessageId),
    [compose, setCompose] = useState<ComposeState | null>(
      initialContactId
        ? {
            ...emptyCompose,
            toContactIds: [initialContactId],
            toAddresses: [
              state.contacts.find((c) => c.id === initialContactId)?.email ??
                "",
            ],
          }
        : null,
    ),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!initialTargetId) return;
    if (state.mail.messages.some((item) => item.id === initialTargetId)) {
      setSelected(initialTargetId);
      setCompose(null);
    } else if (state.contacts.some((item) => item.id === initialTargetId)) {
      setSelected("");
      setCompose({
        ...emptyCompose,
        toContactIds: [initialTargetId],
        toAddresses: [
          state.contacts.find((c) => c.id === initialTargetId)?.email ?? "",
        ],
      });
    }
  }, [initialTargetId]);
  useEffect(() => {
    if (!compose || (!compose.subject.trim() && !compose.body.trim())) return;
    const timer = setTimeout(
      () =>
        void savePhoneMailDraft({
          characterId: character.id,
          draftId: compose.draftId,
          toContactIds: compose.toContactIds,
          toAddresses: compose.toAddresses,
          subject: compose.subject,
          body: compose.body,
          quotedMessageId: compose.quotedMessageId,
        }).then(async (draft) => {
          if (!compose.draftId)
            setCompose((current) =>
              current ? { ...current, draftId: draft.id } : current,
            );
          const next = await getCharacterPhoneState(character.id);
          if (next) onChange(next);
        }),
      700,
    );
    return () => clearTimeout(timer);
  }, [
    compose?.toContactIds.join(","),
    compose?.toAddresses.join(","),
    compose?.subject,
    compose?.body,
  ]);
  const message = state.mail.messages.find((m) => m.id === selected),
    messages = useMemo(
      () =>
        state.mail.messages
          .filter((m) => m.folder === folder)
          .sort(
            (a, b) => (b.sentAt ?? b.updatedAt) - (a.sentAt ?? a.updatedAt),
          ),
      [state, folder],
    );
  const startReply = (source: PhoneMailMessage, forward = false) => {
    const contact = source.fromContactId
      ? state.contacts.find((c) => c.id === source.fromContactId)
      : undefined;
    setCompose({
      toContactIds: forward ? [] : contact ? [contact.id] : [],
      toAddresses: forward ? [] : [source.fromAddress].filter(Boolean),
      subject: forward
        ? `Fwd: ${source.subject}`
        : source.subject.startsWith("Re:")
          ? source.subject
          : `Re: ${source.subject}`,
      body: forward ? `\n\n--- 转发邮件 ---\n${source.body}` : "",
      quotedMessageId: source.id,
      action: forward ? "forward" : "reply",
    });
  };
  const send = async () => {
    if (!compose || busy) return;
    setBusy(true);
    setConfirm(false);
    setError("");
    try {
      const next = await sendEnhancedMail({
        characterId: character.id,
        provider,
        draftId: compose.draftId,
        toContactIds: compose.toContactIds,
        toAddresses: compose.toAddresses,
        subject: compose.subject,
        body: compose.body,
        quotedMessageId: compose.quotedMessageId,
        action: compose.action,
      });
      onChange(next);
      setCompose(null);
      setFolder("sent");
    } catch (e) {
      const next = await getCharacterPhoneState(character.id);
      if (next) onChange(next);
      setError(e instanceof Error ? e.message : "邮件已发送，但暂未收到回复");
      setCompose(null);
      setFolder("sent");
    } finally {
      setBusy(false);
    }
  };
  const trash = async (id: string) => {
      await movePhoneMailToTrash(character.id, id);
      const next = await getCharacterPhoneState(character.id);
      if (next) onChange(next);
      setSelected("");
    },
    restore = async (id: string) => {
      await restorePhoneMail(character.id, id);
      const next = await getCharacterPhoneState(character.id);
      if (next) onChange(next);
      setSelected("");
    };
  if (compose)
    return (
      <div className="phone-mail-app mail-compose">
        <header className="ecosystem-app-head">
          <button onClick={() => setCompose(null)}>
            <ChevronLeft />
          </button>
          <b>
            {compose.action === "reply"
              ? "回复邮件"
              : compose.action === "forward"
                ? "转发邮件"
                : "新邮件"}
          </b>
          <button
            disabled={
              busy ||
              !compose.subject.trim() ||
              !compose.body.trim() ||
              (!compose.toContactIds.length &&
                !compose.toAddresses.some(Boolean))
            }
            onClick={() => setConfirm(true)}
          >
            <Send />
          </button>
        </header>
        <main>
          <label>
            收件人
            <select
              value={compose.toContactIds[0] ?? ""}
              onChange={(e) => {
                const c = state.contacts.find((x) => x.id === e.target.value);
                setCompose((v) =>
                  v
                    ? {
                        ...v,
                        toContactIds: c ? [c.id] : [],
                        toAddresses: c ? [c.email ?? ""] : v.toAddresses,
                      }
                    : v,
                );
              }}
            >
              <option value="">手动填写邮箱</option>
              {state.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            邮箱地址
            <input
              value={compose.toAddresses[0] ?? ""}
              onChange={(e) =>
                setCompose((v) =>
                  v ? { ...v, toAddresses: [e.target.value] } : v,
                )
              }
              placeholder="name@example.com"
            />
          </label>
          <label>
            主题
            <input
              value={compose.subject}
              maxLength={200}
              onChange={(e) =>
                setCompose((v) => (v ? { ...v, subject: e.target.value } : v))
              }
            />
          </label>
          <textarea
            value={compose.body}
            maxLength={5000}
            placeholder="邮件正文"
            onChange={(e) =>
              setCompose((v) => (v ? { ...v, body: e.target.value } : v))
            }
          />
          <small>草稿会自动保存</small>
          {error && <p className="phone-ecosystem-error">{error}</p>}
        </main>
        {confirm && (
          <ConfirmSend
            character={character}
            kind="邮件"
            preview={`${compose.subject}\n${compose.body}`}
            busy={busy}
            onCancel={() => setConfirm(false)}
            onConfirm={() => void send()}
          />
        )}
      </div>
    );
  if (message)
    return (
      <div className="phone-mail-app mail-detail">
        <header className="ecosystem-app-head">
          <button onClick={() => setSelected("")}>
            <ChevronLeft />
          </button>
          <b>邮件</b>
          <button onClick={() => void trash(message.id)}>
            <Trash2 />
          </button>
        </header>
        <main>
          <small>
            {message.folder === "inbox"
              ? message.fromAddress
              : message.toAddresses.join("、")}
          </small>
          <h2>{message.subject}</h2>
          {autoTranslateCharacter(character) &&
            message.subjectTranslation?.status === "complete" &&
            message.subjectTranslation.text && (
              <small className="content-translation phone-translation">
                {message.subjectTranslation.text}
              </small>
            )}
          <time>{fmt(message.sentAt ?? message.updatedAt)}</time>
          <p>{message.body}</p>
          {autoTranslateCharacter(character) &&
            message.translation?.status === "complete" &&
            message.translation.text && (
              <p className="content-translation phone-translation">
                {message.translation.text}
              </p>
            )}
          {message.replyStatus === "pending" && <em>对方正在回复…</em>}
          {message.replyStatus === "failed" && message.generationEventId && (
            <button
              className="mail-retry"
              onClick={() =>
                void retryPhoneMailReply({
                  characterId: character.id,
                  eventId: message.generationEventId!,
                  provider,
                })
                  .then(onChange)
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : "收取失败"),
                  )
              }
            >
              <RefreshCw />
              重试收取回复
            </button>
          )}
          <div className="mail-detail-actions">
            {message.folder === "trash" ? (
              <button onClick={() => void restore(message.id)}>
                <RefreshCw />
                恢复
              </button>
            ) : (
              <>
                <button onClick={() => startReply(message)}>
                  <Reply />
                  回复
                </button>
                <button onClick={() => startReply(message, true)}>
                  <Forward />
                  转发
                </button>
              </>
            )}
          </div>
          {error && <p className="phone-ecosystem-error">{error}</p>}
        </main>
      </div>
    );
  return (
    <div className="phone-mail-app">
      <header className="ecosystem-app-head">
        <button onClick={onBack}>
          <ChevronLeft />
        </button>
        <b>邮箱</b>
        <button onClick={() => setCompose({ ...emptyCompose })}>
          <FileText />
        </button>
      </header>
      <nav className="mail-folders">
        <button
          className={folder === "inbox" ? "active" : ""}
          onClick={() => setFolder("inbox")}
        >
          <Inbox />
          收件箱 <i>{state.mail.unreadCount}</i>
        </button>
        <button
          className={folder === "sent" ? "active" : ""}
          onClick={() => setFolder("sent")}
        >
          <Send />
          已发送
        </button>
        <button
          className={folder === "draft" ? "active" : ""}
          onClick={() => setFolder("draft")}
        >
          <FileText />
          草稿
        </button>
        <button
          className={folder === "trash" ? "active" : ""}
          onClick={() => setFolder("trash")}
        >
          <Trash2 />
          垃圾箱
        </button>
      </nav>
      <section className="mail-list">
        {messages.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              item.folder === "draft"
                ? setCompose({
                    draftId: item.id,
                    toContactIds: item.toContactIds,
                    toAddresses: item.toAddresses,
                    subject: item.subject,
                    body: item.body,
                    quotedMessageId: item.quotedMessageId,
                    action: "compose",
                  })
                : setSelected(item.id)
            }
          >
            <span>
              {item.folder === "inbox"
                ? (state.contacts.find((c) => c.id === item.fromContactId)
                    ?.name ?? item.fromAddress)
                : item.toContactIds
                    .map((id) => state.contacts.find((c) => c.id === id)?.name)
                    .filter(Boolean)
                    .join("、") || item.toAddresses.join("、")}
            </span>
            <b>{item.subject || "无主题"}</b>
            <p>{item.body}</p>
            <small>{fmt(item.sentAt ?? item.updatedAt)}</small>
            <ChevronRight />
          </button>
        ))}
        {!messages.length && (
          <div className="ecosystem-empty">
            <Mail />
            <p>这里暂时没有邮件</p>
          </div>
        )}
      </section>
      {error && <p className="phone-ecosystem-error">{error}</p>}
    </div>
  );
}
