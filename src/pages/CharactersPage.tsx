import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Camera,
  FileUp,
  Plus,
  Save,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppTopBar, Avatar, Empty, Modal } from "../components/ui";
import { db, setSetting } from "../core/db";
import {
  CHARACTER_DOCUMENT_ACCEPT,
  readCharacterDocumentText,
} from "../core/characterDocumentImport";
import { relationshipStage } from "../core/rules";
import { compressImage } from "../core/imageAssets";
import { USER_PERSONA_MAX_LENGTH } from "../core/userPersona";
import { useStore } from "../core/store";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type AppSettings,
  type Character,
} from "../core/types";

export type Draft = {
  name: string;
  aliases: string;
  coreSetting: string;
  persona: string;
  loreBookIds: string[];
};
const emptyDraft: Draft = {
  name: "",
  aliases: "",
  coreSetting: "",
  persona: "",
  loreBookIds: [],
};
const cardTone = (id: string) =>
  [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;

export default function CharactersPage() {
  const nav = useNavigate(),
    [params, setParams] = useSearchParams(),
    { characters, conversations, loreBooks, settings, reload } = useStore(),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [draft, setDraft] = useState<Draft>(emptyDraft);
  useEffect(() => {
    if (params.get("create") === "1" || params.get("import") === "1") {
      setOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const view = params.get("view") === "persona" ? "persona" : "characters",
    ordered = useMemo(() => {
      const activity = (character: Character) =>
        Math.max(
          character.lastActiveAt ?? 0,
          ...conversations
            .filter(
              (conversation) =>
                conversation.type === "private" &&
                conversation.memberIds.length === 1 &&
                conversation.memberIds[0] === character.id,
            )
            .map((conversation) => conversation.lastActivityAt),
        );
      return [...characters].sort(
        (a, b) =>
          activity(a) - activity(b) || a.name.localeCompare(b.name, "zh-CN"),
      );
    }, [characters, conversations]);
  const setDraftField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    const time = now(),
      id = uid();
    await db.characters.add({
      id,
      schemaVersion: SCHEMA_VERSION,
      createdAt: time,
      updatedAt: time,
      name: draft.name.trim(),
      aliases: parseAliases(draft.aliases),
      avatar: "",
      bio: draft.coreSetting.trim(),
      personality: draft.persona.trim(),
      speakingStyle: "",
      background: "",
      language: "中文",
      coreSetting: draft.coreSetting.trim(),
      persona: draft.persona.trim(),
      loreBookIds: draft.loreBookIds,
      chatSettings: { language: "中文", contextLimit: 30, stream: false },
      contactState: { status: "not-added" },
      memoryExtractionSettings: {
        enabled: true,
        mode: "auto",
        chatThreshold: 50,
        maxMemoriesPerBatch: 8,
        includeSummary: true,
        autoSaveHighConfidence: true,
        meetMemoryEnabled: true,
      },
      relationship: { intimacy: 0, trust: 0, mood: "期待", recentEvents: [] },
      proactive: {
        messages: false,
        timeAware: false,
        frequency: "medium",
        quietStart: "23:00",
        quietEnd: "08:00",
        catchupLimit: 3,
        dailyLimit: 10,
      },
      lastActiveAt: time,
    });
    await reload();
    setSaving(false);
    setOpen(false);
    setDraft(emptyDraft);
  };
  return (
    <div className="app-page app-characters wallet-characters-page">
      <AppTopBar
        className="character-app-header"
        title="角色"
        backLabel="返回桌面"
        onBack={() => nav("/")}
        actions={
          view === "characters" ? (
            <button
              className="character-add"
              aria-label="新建角色"
              onClick={() => setOpen(true)}
            >
              <Plus />
            </button>
          ) : undefined
        }
      />
      <nav className="character-view-tabs" aria-label="角色页面切换">
        <button
          className={view === "characters" ? "active" : ""}
          onClick={() => setParams({})}
        >
          角色
        </button>
        <button
          className={view === "persona" ? "active" : ""}
          onClick={() => setParams({ view: "persona" })}
        >
          我的人设
        </button>
      </nav>
      <main
        className={`character-wallet-scroll ${view === "persona" ? "persona-overview-scroll" : ""}`}
      >
        {view === "persona" ? (
          <PersonaInlineEditor settings={settings} reload={reload} />
        ) : ordered.length ? (
          <section className="character-wallet-stack" aria-label="角色卡包">
            {ordered.map((character, index) => {
              const stage = relationshipStage(
                character.relationship.intimacy,
                character.relationship.trust,
              );
              return (
                <button
                  className={`character-wallet-card tone-${index % 5} ${index === ordered.length - 1 ? "front" : ""}`}
                  style={{ "--wallet-index": index } as React.CSSProperties}
                  key={character.id}
                  onClick={() => nav(`/characters/${character.id}`)}
                  aria-label={`打开${character.name}的角色档案`}
                >
                  <div className="wallet-card-head">
                    <Avatar
                      text={character.name}
                      src={character.avatar}
                      size="lg"
                    />
                    <div>
                      <small>{stage.label}</small>
                      <h2>{character.name}</h2>
                      <p>
                        {(character.coreSetting ?? character.bio) ||
                          "还没有核心设定"}
                      </p>
                    </div>
                    <span>{character.relationship.mood}</span>
                  </div>
                  <div className="wallet-card-relationship">
                    <label>
                      亲密度 <b>{character.relationship.intimacy}</b>
                      <i>
                        <em
                          style={{
                            width: `${character.relationship.intimacy}%`,
                          }}
                        />
                      </i>
                    </label>
                    <label>
                      信任度 <b>{character.relationship.trust}</b>
                      <i>
                        <em
                          style={{ width: `${character.relationship.trust}%` }}
                        />
                      </i>
                    </label>
                  </div>
                </button>
              );
            })}
          </section>
        ) : (
          <Empty
            icon={<UserRound size={42} />}
            title="角色会在这里相遇"
            text="点击右上角加号，创建第一位角色。"
          />
        )}
      </main>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="sheet-head">
            <div>
              <small>NEW CHARACTER</small>
              <h2>编辑角色</h2>
            </div>
            <button onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          <CharacterForm
            draft={draft}
            set={setDraftField}
            saving={saving}
            submitLabel="创建角色"
            loreBooks={loreBooks}
            onSubmit={save}
          />
        </Modal>
      )}
    </div>
  );
}

function PersonaInlineEditor({
  settings,
  reload,
}: {
  settings: AppSettings | null | undefined;
  reload: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null),
    [name, setName] = useState(settings?.userName ?? "我"),
    [bio, setBio] = useState(settings?.userBio ?? ""),
    [persona, setPersona] = useState(settings?.userPersona ?? ""),
    [avatar, setAvatar] = useState(settings?.userAvatar ?? ""),
    [saving, setSaving] = useState(false),
    [avatarSaving, setAvatarSaving] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!settings) return;
    setName(settings.userName ?? "我");
    setBio(settings.userBio ?? "");
    setPersona(settings.userPersona ?? "");
    setAvatar(settings.userAvatar ?? "");
  }, [settings]);
  if (!settings)
    return (
      <Empty
        icon={<UserRound size={42} />}
        title="正在读取我的人设"
        text="请稍后再试。"
      />
    );
  const chooseAvatar = async (file?: File) => {
    if (!file || avatarSaving) return;
    setAvatarSaving(true);
    setNotice("");
    try {
      const image = await compressImage(file, "icon", 1024, 700_000);
      setAvatar(image.data);
    } catch {
      setNotice("头像处理失败，请换一张图片重试。");
    } finally {
      setAvatarSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName || saving) return;
    setSaving(true);
    setNotice("");
    try {
      await setSetting("app", {
        ...settings,
        userName: cleanName.slice(0, 30),
        userBio: bio.trim().slice(0, 160),
        userAvatar: avatar,
        userPersona: persona.trim().slice(0, USER_PERSONA_MAX_LENGTH),
      });
      await reload();
      setNotice("我的人设已保存");
    } catch {
      setNotice("保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="persona-inline-editor">
      <div className="persona-inline-decoration">
        <i />
        <i />
        <i />
      </div>
      <div className="persona-inline-head">
        <button
          className="persona-inline-avatar"
          onClick={() => fileRef.current?.click()}
          aria-label="更换我的头像"
        >
          <Avatar text={name || "我"} src={avatar} size="lg" />
          <span>
            <Camera />
          </span>
        </button>
        <div>
          <small>MY ONLY PERSONA</small>
          <b>{name.trim() || "我的人设"}</b>
          <p>名称、头像和简介会与“我的”页面同步</p>
        </div>
      </div>
      <div className="persona-inline-fields">
        <label>
          名称 <em>必填</em>
          <input
            value={name}
            maxLength={30}
            onChange={(event) => setName(event.target.value)}
            placeholder="你希望角色怎样称呼你"
          />
        </label>
        <label>
          简介 <span>{bio.length}/160</span>
          <textarea
            rows={3}
            value={bio}
            maxLength={160}
            onChange={(event) => setBio(event.target.value)}
            placeholder="会展示在“我的”页面和个人资料中"
          />
        </label>
        <label>
          详细人物设定{" "}
          <span>
            {persona.length}/{USER_PERSONA_MAX_LENGTH}
          </span>
          <textarea
            className="persona-inline-long"
            rows={10}
            value={persona}
            maxLength={USER_PERSONA_MAX_LENGTH}
            onChange={(event) => setPersona(event.target.value)}
            placeholder="你的身份、经历、性格、习惯、偏好，以及希望角色了解的背景。模型不会替你决定行动或心理。"
          />
        </label>
        <div className="persona-inline-note">
          <Sparkles />
          <p>
            <b>全局身份</b>
            <small>
              角色会用这份资料理解你，但不会替你决定行为、情绪或发言。
            </small>
          </p>
        </div>
        {notice && <p className="persona-inline-notice">{notice}</p>}
        <button
          className="persona-inline-save"
          disabled={!name.trim() || saving}
          onClick={() => void save()}
        >
          <Save />
          {saving ? "正在保存…" : "保存我的人设"}
        </button>
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*"
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={(event) => void chooseAvatar(event.target.files?.[0])}
      />
    </section>
  );
}
export const parseAliases = (value: string) =>
  [
    ...new Set(
      value
        .split(/[\n,??/]+/)
        .map((item) => item.trim().slice(0, 30))
        .filter(Boolean),
    ),
  ].slice(0, 8);
export function CharacterForm({
  draft,
  set,
  saving,
  submitLabel,
  loreBooks,
  onSubmit,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  saving: boolean;
  submitLabel: string;
  loreBooks: { id: string; name: string; enabled: boolean }[];
  onSubmit: () => void;
}) {
  const toggle = (id: string) =>
      set(
        "loreBookIds",
        draft.loreBookIds.includes(id)
          ? draft.loreBookIds.filter((value) => value !== id)
          : [...draft.loreBookIds, id],
      ),
    documentRef = useRef<HTMLInputElement>(null),
    [documentStatus, setDocumentStatus] = useState("");
  const importPersona = async (file?: File) => {
    setDocumentStatus("");
    if (!file) return;
    try {
      const text = await readCharacterDocumentText(file),
        persona = text.slice(0, 10_000);
      set("persona", persona);
      setDocumentStatus(
        text.length > 10_000
          ? "文档超过 10000 字，已保留前 10000 字。"
          : `已导入 ${persona.length} 字的人物设定。`,
      );
    } catch (error) {
      setDocumentStatus(
        error instanceof Error ? error.message : "无法读取这个角色文档。",
      );
    } finally {
      if (documentRef.current) documentRef.current.value = "";
    }
  };
  return (
    <div className="character-form">
      <label>
        角色名字 *
        <input
          autoFocus
          value={draft.name}
          maxLength={30}
          placeholder="例如：林澈"
          onChange={(event) => set("name", event.target.value)}
        />
      </label>
      <label>
        核心设定
        <textarea
          value={draft.coreSetting}
          rows={4}
          maxLength={10000}
          placeholder="角色最关键的身份、经历和定位"
          onChange={(event) => set("coreSetting", event.target.value)}
        />
      </label>
      <div className="character-persona-field">
        <div className="character-field-head">
          <span>人物设定</span>
          <button type="button" onClick={() => documentRef.current?.click()}>
            <FileUp />
            导入 TXT / DOCX
          </button>
        </div>
        <textarea
          value={draft.persona}
          rows={6}
          maxLength={10000}
          placeholder="性格、表达方式、习惯和行为"
          onChange={(event) => set("persona", event.target.value)}
        />
        <input
          ref={documentRef}
          className="character-document-input"
          hidden
          type="file"
          accept={CHARACTER_DOCUMENT_ACCEPT}
          onChange={(event) => void importPersona(event.target.files?.[0])}
        />
        {documentStatus && (
          <p className="character-document-status">{documentStatus}</p>
        )}
      </div>
      <div className="lore-mount">
        <span>
          <BookOpen />
          挂载世界书
        </span>
        {loreBooks.length ? (
          loreBooks.map((book) => (
            <label key={book.id}>
              <input
                type="checkbox"
                checked={draft.loreBookIds.includes(book.id)}
                onChange={() => toggle(book.id)}
              />
              <i />
              {book.name}
              <small>{book.enabled ? "已启用" : "已停用"}</small>
            </label>
          ))
        ) : (
          <p>还没有世界书，可以稍后在聊天设置中挂载。</p>
        )}
      </div>
      <button
        className="primary"
        disabled={!draft.name.trim() || saving}
        onClick={onSubmit}
      >
        {saving ? "正在保存…" : submitLabel}
      </button>
    </div>
  );
}
