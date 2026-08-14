import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Download,
  Edit3,
  Heart,
  MessageCircleMore,
  Play,
  Settings2,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, Avatar, Modal, SheetHeader } from "../components/ui";
import { db, getSpeechSettings } from "../core/db";
import {
  chatSettingsOf,
  coreSettingOf,
  personaOf,
  rawPersonaOf,
  strategyModeEnabled,
} from "../core/character";
import {
  createCharacterCard,
  deleteCharacterCascade,
  downloadJson,
  getCharacterDeleteImpact,
} from "../core/backup";
import { useStore } from "../core/store";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type Character,
  type Language,
  type LoreBook,
} from "../core/types";
import { CharacterForm, parseAliases, type Draft } from "./CharactersPage";
import {
  emptyProactiveSettings,
  proactiveSettingsOf,
  validChannel,
} from "../core/proactiveRules";
import type {
  ProactiveSettings,
  MemoryExtractionSettings,
} from "../core/types";
import {
  defaultMemoryExtractionSettings,
  memoryExtractionSettingsOf,
  pendingCount,
  validMemoryExtractionSettings,
} from "../core/memoryExtraction";
import { compressImage } from "../core/imageAssets";
import { relationshipMetricLabel, relationshipStage } from "../core/rules";
import {
  normalizeCharacterSpeech,
  normalizeSpeechSettings,
  resolveCharacterSpeech,
  SpeechProvider,
  type SpeechModelOption,
  type SpeechVoiceOption,
} from "../core/speech";
type Impact = {
  conversationCount: number;
  messageCount: number;
  memoryCount: number;
  feedCount: number;
  total: number;
};
const detailDraftOf = (character: Character, loreBooks: LoreBook[]): Draft => ({
  name: character.name,
  aliases: (character.aliases ?? []).join("、"),
  coreSetting: coreSettingOf(character),
  persona: rawPersonaOf(character),
  loreBookIds: character.loreBookIds ?? loreBooks.map((book) => book.id),
});
export default function CharacterDetail() {
  const { id } = useParams(),
    nav = useNavigate(),
    { characters, conversations, loreBooks, reload } = useStore(),
    character = characters.find((c) => c.id === id);
  const [editing, setEditing] = useState(false),
    [chatOpen, setChatOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [menu, setMenu] = useState(false),
    [impact, setImpact] = useState<Impact | null>(null),
    [confirmName, setConfirmName] = useState(""),
    [proactiveOpen, setProactiveOpen] = useState(false),
    [proactiveDraft, setProactiveDraft] = useState<ProactiveSettings>(
      character ? proactiveSettingsOf(character) : emptyProactiveSettings(),
    ),
    [proactiveError, setProactiveError] = useState(""),
    [memoryOpen, setMemoryOpen] = useState(false),
    [memoryDraft, setMemoryDraft] = useState<MemoryExtractionSettings>(
      character
        ? memoryExtractionSettingsOf(character)
        : defaultMemoryExtractionSettings(),
    ),
    [memoryStats, setMemoryStats] = useState(0),
    [memorySettingsError, setMemorySettingsError] = useState("");
  const [draft, setDraft] = useState<Draft | undefined>(
      character
        ? {
            name: character.name,
            aliases: (character.aliases ?? []).join("、"),
            coreSetting: coreSettingOf(character),
            persona: rawPersonaOf(character),
            loreBookIds: character.loreBookIds ?? loreBooks.map((b) => b.id),
          }
        : undefined,
    ),
    [chat, setChat] = useState(character ? chatSettingsOf(character) : null),
    [avatarSaving, setAvatarSaving] = useState(false),
    avatarFileRef = useRef<HTMLInputElement>(null),
    messageOpenLockRef = useRef(false),
    [messageOpening, setMessageOpening] = useState(false),
    [relationshipOpen, setRelationshipOpen] = useState(false),
    [speechBusy, setSpeechBusy] = useState(false),
    [speechStatus, setSpeechStatus] = useState(""),
    [speechVoices, setSpeechVoices] = useState<SpeechVoiceOption[]>([]),
    [speechModels, setSpeechModels] = useState<SpeechModelOption[]>([]),
    [chatContextDraft, setChatContextDraft] = useState(
      character ? String(chatSettingsOf(character).contextLimit) : "",
    ),
    [chatError, setChatError] = useState(""),
    [memoryThresholdDraft, setMemoryThresholdDraft] = useState(
      character
        ? String(memoryExtractionSettingsOf(character).chatThreshold)
        : "",
    );
  useEffect(() => {
    if (!character) return;
    if (!editing) setDraft(detailDraftOf(character, loreBooks));
    if (!chatOpen) {
      const current = chatSettingsOf(character);
      setChat(current);
      setChatContextDraft(String(current.contextLimit));
      setChatError("");
    }
    if (!proactiveOpen) setProactiveDraft(proactiveSettingsOf(character));
    if (!memoryOpen) {
      const current = memoryExtractionSettingsOf(character);
      setMemoryDraft(current);
      setMemoryThresholdDraft(String(current.chatThreshold));
      setMemorySettingsError("");
    }
  }, [
    character?.id,
    character?.updatedAt,
    loreBooks,
    editing,
    chatOpen,
    proactiveOpen,
    memoryOpen,
  ]);
  if (!character || !draft || !chat)
    return <Navigate to="/characters" replace />;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((v) => v && { ...v, [key]: value });
  const strategyEnabled = strategyModeEnabled(character),
    stage = relationshipStage(
      character.relationship.intimacy,
      character.relationship.trust,
    );
  const openRelationship = () => setRelationshipOpen(true),
    openEditor = () => {
      setDraft(detailDraftOf(character, loreBooks));
      setEditing(true);
    },
    openChatSettings = () => {
      const current = chatSettingsOf(character);
      setChat(current);
      setChatContextDraft(String(current.contextLimit));
      setChatError("");
      setDraft(detailDraftOf(character, loreBooks));
      setChatOpen(true);
    },
    openProactiveSettings = () => {
      setProactiveDraft(proactiveSettingsOf(character));
      setProactiveError("");
      setProactiveOpen(true);
    };
  const setStrategy = async (enabled: boolean) => {
    const current = chatSettingsOf(character),
      next = { ...current, strategyMode: { enabled } };
    setChat(next);
    await db.characters.update(character.id, {
      chatSettings: next,
      language: next.language,
      updatedAt: Date.now(),
    });
    await reload();
  };
  const chooseAvatar = async (file?: File) => {
    if (!file || avatarSaving) return;
    setAvatarSaving(true);
    try {
      const image = await compressImage(file, "icon", 1024, 700_000);
      await db.characters.update(character.id, {
        avatar: image.data,
        updatedAt: Date.now(),
      });
      await reload();
    } catch {
      window.alert("头像处理失败，请换一张图片重试。");
    } finally {
      setAvatarSaving(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };
  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    await db.characters.update(character.id, {
      name: draft.name.trim(),
      aliases: parseAliases(draft.aliases),
      coreSetting: draft.coreSetting.trim(),
      persona: draft.persona.trim(),
      loreBookIds: draft.loreBookIds,
      bio: draft.coreSetting.trim(),
      personality: draft.persona.trim(),
      speakingStyle: "",
      updatedAt: Date.now(),
    });
    const cv = await db.conversations
      .where("memberIds")
      .equals(character.id)
      .filter((c) => c.type === "private" && c.memberIds.length === 1)
      .first();
    if (cv)
      await db.conversations.update(cv.id, {
        title: draft.name.trim(),
        updatedAt: Date.now(),
      });
    await reload();
    setSaving(false);
    setEditing(false);
  };
  const saveChat = async () => {
    const contextLimit = Number(chatContextDraft);
    if (
      !chatContextDraft.trim() ||
      !Number.isInteger(contextLimit) ||
      contextLimit < 2 ||
      contextLimit > 100
    ) {
      setChatError("上下文消息数量需要填写 2–100 的整数。");
      return;
    }
    const next = { ...chat, contextLimit };
    await db.characters.update(character.id, {
      chatSettings: next,
      language: next.language,
      loreBookIds: draft.loreBookIds,
      updatedAt: Date.now(),
    });
    setChat(next);
    await reload();
    setChatOpen(false);
  };
  const speechDraft = normalizeCharacterSpeech(chat.speech),
    patchSpeech = (next: ReturnType<typeof normalizeCharacterSpeech>) =>
      setChat({ ...chat, speech: next }),
    loadCharacterSpeechCatalog = async () => {
      setSpeechBusy(true);
      setSpeechStatus("正在读取可用音色…");
      try {
        const global = normalizeSpeechSettings(await getSpeechSettings()),
          kind =
            speechDraft.provider !== "inherit"
              ? speechDraft.provider
              : global.defaultProvider,
          vendor = global[kind],
          api = new SpeechProvider(kind, vendor),
          [voices, models] = await Promise.all([
            api.listVoices(),
            api.listModels(),
          ]);
        setSpeechVoices(voices);
        setSpeechModels(models);
        setSpeechStatus(
          `已读取 ${voices.length} 个音色和 ${models.length} 个模型`,
        );
      } catch (error) {
        setSpeechStatus(
          error instanceof Error ? error.message : "读取音色失败",
        );
      } finally {
        setSpeechBusy(false);
      }
    },
    testCharacterSpeech = async () => {
      setSpeechBusy(true);
      setSpeechStatus("正在生成试听语音…");
      try {
        const global = normalizeSpeechSettings(await getSpeechSettings()),
          resolved = resolveCharacterSpeech(
            { ...character, chatSettings: { ...chat, speech: speechDraft } },
            global,
          );
        if (!resolved)
          throw new Error("请先在角色语音服务中配置可用服务，并选择角色音色");
        const blob = await resolved.provider.synthesize(
            `你好，我是${character.name}。这是我的语音试听。`,
          ),
          url = URL.createObjectURL(blob),
          audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        await audio.play();
        setSpeechStatus("试听已开始播放");
      } catch (error) {
        setSpeechStatus(error instanceof Error ? error.message : "试听失败");
      } finally {
        setSpeechBusy(false);
      }
    };
  const saveProactive = async () => {
    const bad = (channel: ProactiveSettings["message"]) =>
      channel.enabled && !validChannel(channel);
    if (bad(proactiveDraft.message) || bad(proactiveDraft.feed)) {
      setProactiveError(
        "开启前请完整填写间隔与上限，且单次补算不能超过每日上限。",
      );
      return;
    }
    await db.characters.update(character.id, {
      proactiveSettings: proactiveDraft,
      updatedAt: Date.now(),
    });
    await reload();
    setProactiveOpen(false);
    window.dispatchEvent(new Event("mira:proactive-check"));
  };
  const openMemorySettings = async () => {
    const cvs = await db.conversations
      .where("memberIds")
      .equals(character.id)
      .toArray();
    let chatCount = 0;
    for (const cv of cvs)
      chatCount += await pendingCount(character, "chat", cv.id);
    setMemoryStats(chatCount);
    setMemoryOpen(true);
  };
  const saveMemorySettings = async () => {
    const chatThreshold = Number(memoryThresholdDraft),
      next = { ...memoryDraft, chatThreshold };
    if (
      !memoryThresholdDraft.trim() ||
      !Number.isInteger(chatThreshold) ||
      !validMemoryExtractionSettings(next)
    ) {
      setMemorySettingsError("自动模式需要填写 10–200 的聊天阈值。");
      return;
    }
    await db.characters.update(character.id, {
      memoryExtractionSettings: next,
      updatedAt: Date.now(),
    });
    setMemoryDraft(next);
    await reload();
    setMemoryOpen(false);
    window.dispatchEvent(new Event("mira:proactive-check"));
  };
  const openMessage = async () => {
    if (messageOpenLockRef.current) return;
    messageOpenLockRef.current = true;
    setMessageOpening(true);
    try {
      let conversation = conversations.find(
        (item) =>
          item.type === "private" &&
          item.memberIds.length === 1 &&
          item.memberIds[0] === character.id,
      );
      if (!conversation)
        conversation = await db.conversations
          .where("memberIds")
          .equals(character.id)
          .filter(
            (item) => item.type === "private" && item.memberIds.length === 1,
          )
          .first();
      if (!conversation) {
        const time = now();
        conversation = {
          id: uid(),
          schemaVersion: SCHEMA_VERSION,
          createdAt: time,
          updatedAt: time,
          title: character.name,
          type: "private",
          memberIds: [character.id],
          presetIds: [],
          loreBookIds: [],
          lastActivityAt: time,
        };
        await db.conversations.add(conversation);
        await reload();
      }
      nav(`/messages/${conversation.id}`);
    } finally {
      messageOpenLockRef.current = false;
      setMessageOpening(false);
    }
  };
  const remove = async () => {
    if (confirmName !== character.name) return;
    await deleteCharacterCascade(character.id);
    await reload();
    nav("/characters", { replace: true });
  };
  return (
    <div className="app-page character-detail wallet-character-detail">
      <AppTopBar
        className="character-detail-header"
        title="角色资料"
        onBack={() => nav("/characters")}
        actions={
          <button
            className="character-detail-edit"
            aria-label="编辑角色"
            onClick={openEditor}
          >
            <Edit3 />
          </button>
        }
      />
      <main className="character-profile-scroll">
        <section className="character-profile-head">
          <button
            className="character-avatar-button"
            aria-label="点击更换角色头像"
            aria-busy={avatarSaving}
            disabled={avatarSaving}
            onClick={() => avatarFileRef.current?.click()}
          >
            <Avatar text={character.name} src={character.avatar} size="lg" />
            <span>
              <Edit3 />
              {avatarSaving ? "更换中…" : "点击更换头像"}
            </span>
          </button>
          <input
            ref={avatarFileRef}
            hidden
            type="file"
            accept="image/*"
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => void chooseAvatar(event.target.files?.[0])}
          />
          <div className="character-profile-copy">
            <h2>{character.name}</h2>
            <p>{coreSettingOf(character) || "还没有核心设定"}</p>
            <small>
              {stage.label} · {character.relationship.mood}
            </small>
          </div>
          <div className="character-profile-stats">
            {strategyEnabled && (
              <>
                <div>
                  <b>{character.relationship.intimacy}</b>
                  <span>亲密度</span>
                </div>
                <div>
                  <b>{character.relationship.trust}</b>
                  <span>信任度</span>
                </div>
              </>
            )}
            <div>
              <b>
                {
                  (character.loreBookIds ?? loreBooks.map((book) => book.id))
                    .length
                }
              </b>
              <span>世界书</span>
            </div>
          </div>
          <div className="character-profile-actions">
            <button
              className="primary"
              disabled={messageOpening}
              onClick={() => void openMessage()}
            >
              <MessageCircleMore />
              {messageOpening ? "进入中…" : "发消息"}
            </button>
            <button onClick={openEditor}>
              <Edit3 />
              编辑资料
            </button>
          </div>
        </section>
        <section className="character-profile-group">
          <small>PROFILE</small>
          <article>
            <Sparkles />
            <div>
              <b>核心设定</b>
              <p>{coreSettingOf(character) || "还没有填写核心设定。"}</p>
            </div>
          </article>
          <article>
            <MessageCircleMore />
            <div>
              <b>人物设定</b>
              <p>{personaOf(character) || "还没有填写人物设定。"}</p>
            </div>
          </article>
          <article>
            <BookOpen />
            <div>
              <b>挂载世界书</b>
              <p>
                {(character.loreBookIds ?? loreBooks.map((book) => book.id))
                  .map(
                    (bookId) =>
                      loreBooks.find((book) => book.id === bookId)?.name,
                  )
                  .filter(Boolean)
                  .join("、") || "未挂载世界书"}
              </p>
            </div>
          </article>
        </section>
        <section className="character-profile-group character-function-group">
          <small>COMPANIONSHIP</small>
          <button onClick={openRelationship}>
            <Heart />
            <span>
              <b>{strategyEnabled ? "关系状态" : "攻略模式"}</b>
              <p>
                {strategyEnabled
                  ? `亲密度 ${character.relationship.intimacy} ? 信任度 ${character.relationship.trust} ? ${stage.label}`
                  : "未开启，点击后可设置"}
              </p>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => void openMemorySettings()}>
            <BookOpen />
            <span>
              <b>记忆整理</b>
              <p>查看未整理聊天和提取规则</p>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => setMenu(true)}>
            <MessageCircleMore />
            <span>
              <b>更多操作</b>
              <p>导出角色卡或删除角色</p>
            </span>
            <ChevronRight />
          </button>
        </section>
      </main>
      {relationshipOpen && (
        <Modal onClose={() => setRelationshipOpen(false)}>
          <SheetHeader
            title="关系状态"
            onClose={() => setRelationshipOpen(false)}
          />
          <div className="relationship-editor relationship-readonly">
            <label className="strategy-status-card strategy-toggle-card">
              <span>
                <b>攻略模式</b>
                <small>
                  {strategyEnabled
                    ? "已开启 · 私聊和通话会自动评估"
                    : "关闭时不显示、不使用关系数值"}
                </small>
              </span>
              <input
                type="checkbox"
                checked={strategyEnabled}
                onChange={(event) => void setStrategy(event.target.checked)}
              />
              <i />
            </label>
            {strategyEnabled && (
              <>
                <section className="relationship-stage">
                  <span>{stage.score}</span>
                  <div>
                    <b>{stage.label}</b>
                    <p>{stage.description}</p>
                  </div>
                </section>
                <div className="relationship-readonly-metrics">
                  <article>
                    <span>
                      <b>亲密度</b>
                      <small>
                        {relationshipMetricLabel(
                          "intimacy",
                          character.relationship.intimacy,
                        )}
                      </small>
                    </span>
                    <strong>
                      {character.relationship.intimacy}
                      <i>/100</i>
                    </strong>
                    <em>
                      <u
                        style={{ width: character.relationship.intimacy + "%" }}
                      />
                    </em>
                  </article>
                  <article>
                    <span>
                      <b>信任度</b>
                      <small>
                        {relationshipMetricLabel(
                          "trust",
                          character.relationship.trust,
                        )}
                      </small>
                    </span>
                    <strong>
                      {character.relationship.trust}
                      <i>/100</i>
                    </strong>
                    <em>
                      <u
                        style={{ width: character.relationship.trust + "%" }}
                      />
                    </em>
                  </article>
                </div>
                <div className="relationship-meta">
                  <span>
                    今日正向增长{" "}
                    <b>
                      亲密度 +
                      {character.relationship.dailyProgress?.date ===
                      new Date().toLocaleDateString("en-CA")
                        ? character.relationship.dailyProgress.intimacyGain
                        : 0}{" "}
                      ? 信任度 +
                      {character.relationship.dailyProgress?.date ===
                      new Date().toLocaleDateString("en-CA")
                        ? character.relationship.dailyProgress.trustGain
                        : 0}
                    </b>
                  </span>
                  <span>
                    首次表白{" "}
                    <b>
                      {character.relationship.confessionTriggeredAt
                        ? new Date(
                            character.relationship.confessionTriggeredAt,
                          ).toLocaleDateString("zh-CN")
                        : "尚未触发"}
                    </b>
                  </span>
                </div>
                <section className="relationship-events">
                  <h3>近期关系事件</h3>
                  {character.relationship.recentEvents.length ? (
                    <ul>
                      {character.relationship.recentEvents.map(
                        (event, index) => (
                          <li key={event + "-" + index}>{event}</li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p>还没有关系事件。</p>
                  )}
                </section>
                <p className="relationship-hint">
                  关系数值只能由攻略模式评估或记忆审核中的关系事件改变，用户不能直接修改。
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <SheetHeader title="编辑角色" onClose={() => setEditing(false)} />
          <CharacterForm
            draft={draft}
            set={set}
            saving={saving}
            submitLabel="保存修改"
            loreBooks={loreBooks}
            onSubmit={save}
          />
        </Modal>
      )}
      {chatOpen && (
        <Modal onClose={() => setChatOpen(false)}>
          <SheetHeader title="聊天设置" onClose={() => setChatOpen(false)} />
          <div className="simple-form">
            <label>
              输出语言
              <select
                value={chat.language}
                onChange={(e) =>
                  setChat({ ...chat, language: e.target.value as Language })
                }
              >
                {["中文", "粤语", "English", "日本語", "한국어", "Русский"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              上下文消息数量
              <input
                type="number"
                min="2"
                max="100"
                value={chatContextDraft}
                onChange={(event) => {
                  setChatContextDraft(event.target.value);
                  setChatError("");
                }}
              />
            </label>
            <label className="switch-row strategy-mode-switch">
              <span>
                <b>攻略模式</b>
                <small>
                  根据私聊和通话中的用户表现自动调整亲密度和信任度。
                </small>
              </span>
              <input
                type="checkbox"
                checked={chat.strategyMode?.enabled ?? false}
                onChange={(e) =>
                  setChat({
                    ...chat,
                    strategyMode: { enabled: e.target.checked },
                  })
                }
              />
            </label>
            <fieldset className="character-speech-settings">
              <legend>
                <Volume2 />
                角色语音
              </legend>
              <label className="switch-row">
                <span>
                  <b>通话语音</b>
                  <small>语音和视频通话中自动播放角色声音。</small>
                </span>
                <input
                  type="checkbox"
                  checked={speechDraft.enabled}
                  onChange={(event) =>
                    patchSpeech({
                      ...speechDraft,
                      enabled: event.target.checked,
                    })
                  }
                />
              </label>
              <label className="switch-row">
                <span>
                  <b>自主语音消息</b>
                  <small>角色根据语境自行决定是否把文字回复转换为语音。</small>
                </span>
                <input
                  type="checkbox"
                  checked={speechDraft.autoMessages?.enabled ?? false}
                  onChange={(event) =>
                    patchSpeech({
                      ...speechDraft,
                      autoMessages: {
                        ...(speechDraft.autoMessages ?? { tendency: "medium" }),
                        enabled: event.target.checked,
                      },
                    })
                  }
                />
              </label>
              <label>
                语音服务
                <select
                  value={speechDraft.provider}
                  onChange={(event) =>
                    patchSpeech({
                      ...speechDraft,
                      provider: event.target.value as
                        "inherit" | "minimax" | "elevenlabs",
                    })
                  }
                >
                  <option value="inherit">继承全局默认</option>
                  <option value="minimax">MiniMax</option>
                  <option value="elevenlabs">ElevenLabs</option>
                </select>
              </label>
              <div className="form-row">
                <label>
                  模型覆盖
                  <input
                    list="character-speech-models"
                    value={speechDraft.model ?? ""}
                    onChange={(event) =>
                      patchSpeech({
                        ...speechDraft,
                        model: event.target.value || undefined,
                      })
                    }
                    placeholder="留空则继承全局"
                  />
                  <datalist id="character-speech-models">
                    {speechModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label>
                  Voice ID
                  <input
                    list="character-speech-voices"
                    value={speechDraft.voiceId ?? ""}
                    onChange={(event) =>
                      patchSpeech({
                        ...speechDraft,
                        voiceId: event.target.value || undefined,
                      })
                    }
                    placeholder="留空则继承全局"
                  />
                  <datalist id="character-speech-voices">
                    {speechVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </datalist>
                </label>
              </div>
              <label>
                语音消息倾向
                <select
                  value={speechDraft.autoMessages?.tendency ?? "medium"}
                  onChange={(event) =>
                    patchSpeech({
                      ...speechDraft,
                      autoMessages: {
                        enabled: speechDraft.autoMessages?.enabled ?? false,
                        tendency: event.target.value as
                          "low" | "medium" | "high",
                        dailyProgress: speechDraft.autoMessages?.dailyProgress,
                        lastVoiceAt: speechDraft.autoMessages?.lastVoiceAt,
                      },
                    })
                  }
                >
                  <option value="low">很少 · 每日最多 1 条</option>
                  <option value="medium">偶尔 · 每日最多 3 条</option>
                  <option value="high">经常 · 每日最多 6 条</option>
                </select>
              </label>
              <div className="character-speech-actions">
                <button
                  disabled={speechBusy}
                  onClick={() => void loadCharacterSpeechCatalog()}
                >
                  <Volume2 />
                  拉取音色
                </button>
                <button
                  disabled={speechBusy}
                  onClick={() => void testCharacterSpeech()}
                >
                  <Play />
                  {speechBusy ? "处理中…" : "试听角色声音"}
                </button>
                <button onClick={() => nav("/settings/speech")}>
                  全局语音服务
                </button>
              </div>
              {speechStatus && <p className="form-hint">{speechStatus}</p>}
            </fieldset>
            <div className="lore-mount">
              <span>
                <BookOpen />
                挂载世界书
              </span>
              {loreBooks.map((b) => (
                <label key={b.id}>
                  <input
                    type="checkbox"
                    checked={draft.loreBookIds.includes(b.id)}
                    onChange={() =>
                      set(
                        "loreBookIds",
                        draft.loreBookIds.includes(b.id)
                          ? draft.loreBookIds.filter((x) => x !== b.id)
                          : [...draft.loreBookIds, b.id],
                      )
                    }
                  />
                  <i />
                  {b.name}
                </label>
              ))}
            </div>
            {chatError && <p className="form-error">{chatError}</p>}
            <button className="primary" onClick={saveChat}>
              保存聊天设置
            </button>
            <button
              className="secondary-action"
              onClick={openProactiveSettings}
            >
              主动互动设置
            </button>
            <button className="secondary-action" onClick={openMemorySettings}>
              记忆整理设置
            </button>
          </div>
        </Modal>
      )}
      {proactiveOpen && (
        <Modal onClose={() => setProactiveOpen(false)}>
          <SheetHeader
            title="主动互动"
            onClose={() => setProactiveOpen(false)}
          />
          <div className="simple-form proactive-form">
            <label className="switch-row">
              <span>
                <b>时间感知</b>
                <small>开启后会补算网页关闭期间到期的事件。</small>
              </span>
              <input
                type="checkbox"
                checked={proactiveDraft.timeAware}
                onChange={(e) =>
                  setProactiveDraft({
                    ...proactiveDraft,
                    timeAware: e.target.checked,
                  })
                }
              />
            </label>
            <div className="form-row">
              <label>
                勿扰开始
                <input
                  type="time"
                  value={proactiveDraft.quietStart}
                  onChange={(e) =>
                    setProactiveDraft({
                      ...proactiveDraft,
                      quietStart: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                勿扰结束
                <input
                  type="time"
                  value={proactiveDraft.quietEnd}
                  onChange={(e) =>
                    setProactiveDraft({
                      ...proactiveDraft,
                      quietEnd: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <Channel
              title="主动私聊"
              value={proactiveDraft.message}
              set={(message) =>
                setProactiveDraft({ ...proactiveDraft, message })
              }
            />
            <Channel
              title="主动动态"
              value={proactiveDraft.feed}
              set={(feed) => setProactiveDraft({ ...proactiveDraft, feed })}
            />
            {proactiveError && <p className="form-error">{proactiveError}</p>}
            <button className="primary" onClick={saveProactive}>
              保存主动互动设置
            </button>
            <button
              className="secondary-action"
              onClick={() =>
                window.dispatchEvent(new Event("mira:proactive-check"))
              }
            >
              立即检查
            </button>
          </div>
        </Modal>
      )}
      {memoryOpen && (
        <Modal onClose={() => setMemoryOpen(false)}>
          <SheetHeader title="记忆整理" onClose={() => setMemoryOpen(false)} />
          <div className="simple-form proactive-form">
            <label>
              整理模式
              <select
                value={memoryDraft.mode}
                onChange={(e) =>
                  setMemoryDraft({
                    ...memoryDraft,
                    mode: e.target.value as MemoryExtractionSettings["mode"],
                  })
                }
              >
                <option value="manual">手动整理</option>
                <option value="auto">自动提取候选</option>
              </select>
            </label>
            <label>
              聊天触发条数
              <input
                type="number"
                min="10"
                max="200"
                value={memoryThresholdDraft}
                onChange={(event) => {
                  setMemoryThresholdDraft(event.target.value);
                  setMemorySettingsError("");
                }}
              />
            </label>
            <div className="extraction-stats">
              <span>
                未整理聊天 <b>{memoryStats}</b>
              </span>
            </div>
            <p className="form-hint">动态内容不会参与记忆整理。</p>
            {memorySettingsError && (
              <p className="form-error">{memorySettingsError}</p>
            )}
            <button className="primary" onClick={saveMemorySettings}>
              保存记忆设置
            </button>
          </div>
        </Modal>
      )}
      {menu && (
        <Modal onClose={() => setMenu(false)}>
          <SheetHeader title="更多操作" onClose={() => setMenu(false)} />
          <div className="action-list">
            <button
              onClick={() =>
                downloadJson(
                  createCharacterCard(character),
                  `${character.name}.chachaji-character.json`,
                )
              }
            >
              <Download />
              <span>
                <b>导出角色卡</b>
              </span>
            </button>
            <button
              className="danger"
              onClick={async () => {
                setMenu(false);
                setImpact(await getCharacterDeleteImpact(character.id));
              }}
            >
              <Trash2 />
              <span>
                <b>删除角色</b>
              </span>
            </button>
          </div>
        </Modal>
      )}
      {impact && (
        <Modal onClose={() => setImpact(null)}>
          <div className="delete-confirm">
            <Trash2 />
            <h2>确定删除“{character.name}”吗？</h2>
            <p>
              将删除 {impact.conversationCount} 个会话、{impact.messageCount}{" "}
              条消息和 {impact.memoryCount} 条记忆。
            </p>
            <label>
              输入角色名字确认
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </label>
            <button
              className="danger-button"
              disabled={confirmName !== character.name}
              onClick={remove}
            >
              永久删除角色
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Channel({
  title,
  value,
  set,
}: {
  title: string;
  value: ProactiveSettings["message"];
  set: (v: ProactiveSettings["message"]) => void;
}) {
  return (
    <fieldset className="proactive-channel">
      <label className="switch-row">
        <span>
          <b>{title}</b>
          <small>仅网页打开时运行</small>
        </span>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ ...value, enabled: e.target.checked })}
        />
      </label>
      <div className="form-row">
        <label>
          间隔小时
          <input
            type="number"
            min="1"
            max="720"
            value={value.intervalHours ?? ""}
            onChange={(e) =>
              set({
                ...value,
                intervalHours: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </label>
        <label>
          单次补算
          <input
            type="number"
            min="1"
            value={value.catchupLimit ?? ""}
            onChange={(e) =>
              set({
                ...value,
                catchupLimit: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </label>
        <label>
          每日上限
          <input
            type="number"
            min="1"
            value={value.dailyLimit ?? ""}
            onChange={(e) =>
              set({
                ...value,
                dailyLimit: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
      </div>
    </fieldset>
  );
}
