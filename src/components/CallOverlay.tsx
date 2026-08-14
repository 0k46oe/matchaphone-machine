import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, SendHorizonal, Square } from "lucide-react";
import { buildContext } from "../core/context";
import { resolveChatPresenceContext } from "../core/chatPresence";
import { pauseActiveMeetForOnlineActivity, resolveOnlineCrossModeContinuity } from "../core/crossModeContinuity";
import { validateLocalCharacterReply } from "../core/replyValidation";
import {
  prepareRoleplayResources,
  reviewCharacterReply,
} from "../core/personaEngine";
import { db } from "../core/db";
import {
  generateCharacterMessageGroup,
  generateCharacterMessageGroupBilingual,
  selectGroupReplyOrder,
} from "../core/groupChat";
import { OpenAIProvider } from "../core/provider";
import { speechForCharacter } from "../core/speech";
import {
  evaluateStrategyInteraction,
  generateConfessionMessages,
  saveConfessionMessages,
} from "../core/relationshipStrategy";
import { ProviderError } from "../core/provider";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type AppSettings,
  type Character,
  type Conversation,
  type LoreBook,
  type MediaAsset,
  type Memory,
  type Message,
  type ProviderSettings,
} from "../core/types";
import { Avatar } from "./ui";
import {
  autoTranslateCharacter,
  bilingualSingleInstruction,
  parseBilingualSingle,
} from "../core/bilingual";

type Line = {
  id: string;
  characterId?: string;
  name: string;
  text: string;
  translation?: string;
  role: "user" | "character";
};
type Props = {
  type: "voice" | "video";
  conversation: Conversation;
  members: Character[];
  provider: ProviderSettings;
  messages: Message[];
  loreBooks: LoreBook[];
  memories: Memory[];
  mediaAssets: MediaAsset[];
  settings: AppSettings;
  onEnd: (durationMs: number, summary: string) => Promise<void>;
};

export default function CallOverlay({
  type,
  conversation,
  members,
  provider,
  messages,
  loreBooks,
  memories,
  mediaAssets,
  settings,
  onEnd,
}: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [relationshipEvaluating, setRelationshipEvaluating] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  const started = useRef(Date.now());
  const controller = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrl = useRef("");
  const ended = useRef(false);
  const callHistory = useRef(false);
  const linesRef = useRef<Line[]>([]);
  const primaryCharacter = members[0];
  const roleName = primaryCharacter?.name ?? conversation.title;

  useEffect(() => {
    window.dispatchEvent(new Event("mira:real-audio-start"));
    return () => {
      window.dispatchEvent(new Event("mira:real-audio-stop"));
    };
  }, []);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  useEffect(() => setAvatarBroken(false), [primaryCharacter?.avatar]);
  useEffect(() => {
    if (type !== "video") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("当前浏览器不支持摄像头");
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((media) => {
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play();
        }
      })
      .catch(() => setCameraError("无法打开摄像头，角色画面仍可正常使用"));
    return () => stream.current?.getTracks().forEach((track) => track.stop());
  }, [type]);
  useEffect(() => {
    history.pushState({ chachaCall: true }, "");
    callHistory.current = true;
    const back = () => { if (!callHistory.current) return; callHistory.current = false; void end(); };
    window.addEventListener("popstate", back);
    return () => { callHistory.current = false; window.removeEventListener("popstate", back); };
  }, []);
  useEffect(
    () => () => {
      controller.current?.abort();
      activeAudio.current?.pause();
      if (activeAudioUrl.current) URL.revokeObjectURL(activeAudioUrl.current);
    },
    [],
  );

  const play = async (character: Character, content: string) => {
    setSpeechStatus("正在生成语音…");
    try {
      const speech = await speechForCharacter(character);
      if (!speech) {
        setSpeechStatus("语音不可用");
        window.setTimeout(() => setSpeechStatus(""), 1600);
        return;
      }
      const blob = await speech.synthesize(content, controller.current?.signal),
        url = URL.createObjectURL(blob),
        audio = new Audio(url);
      activeAudio.current = audio;
      activeAudioUrl.current = url;
      setSpeechStatus("正在播放语音…");
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      URL.revokeObjectURL(url);
      activeAudio.current = null;
      activeAudioUrl.current = "";
      setSpeechStatus("");
    } catch (error) {
      activeAudio.current?.pause();
      if (activeAudioUrl.current) URL.revokeObjectURL(activeAudioUrl.current);
      activeAudio.current = null;
      activeAudioUrl.current = "";
      if (!controller.current?.signal.aborted) {
        setSpeechStatus(
          error instanceof Error
            ? `语音不可用：${error.message}`
            : "语音不可用",
        );
        window.setTimeout(() => setSpeechStatus(""), 2400);
      }
    }
  };
  const ephemeral = () => {
    const base = now();
    return lines.map((line, index): Message => ({
      id: "call-" + line.id,
      schemaVersion: SCHEMA_VERSION,
      createdAt: base - lines.length + index,
      updatedAt: base,
      conversationId: conversation.id,
      senderType: line.role === "user" ? "user" : "character",
      senderId: line.characterId,
      content: line.text,
      status: "complete",
    }));
  };
  const send = async () => {
    const input = text.trim();
    if (!input || busy) return;
    if (!provider.apiKey) {
      setError("请先配置模型 API");
      return;
    }
    setText("");
    setError("");
    setBusy(true);
    const userLine: Line = {
      id: uid(),
      name: settings.userName || "我",
      text: input,
      role: "user",
    };
    setLines((old) => [...old, userLine]);
    const ctl = new AbortController();
    controller.current = ctl;
    try {
      await pauseActiveMeetForOnlineActivity(conversation.id);
      const historyMessages = [
        ...messages,
        ...ephemeral(),
        {
          id: "call-user",
          schemaVersion: SCHEMA_VERSION,
          createdAt: now(),
          updatedAt: now(),
          conversationId: conversation.id,
          senderType: "user" as const,
          content: input,
          status: "complete" as const,
        },
      ];
      if (conversation.type === "private") {
        let character = (await db.characters.get(members[0].id)) ?? members[0],
          shouldConfess = false;
        if (character.chatSettings?.strategyMode?.enabled) {
          setRelationshipEvaluating(true);
          try {
            const evaluated = await evaluateStrategyInteraction({
              character,
              sourceId: `call:${conversation.id}:${userLine.id}`,
              userText: input,
              messages: historyMessages,
              characters: members,
              provider,
              signal: ctl.signal,
            });
            character = evaluated.character;
            shouldConfess = evaluated.shouldConfess;
          } catch (strategyError) {
            if (
              strategyError instanceof ProviderError &&
              strategyError.kind === "aborted"
            )
              throw strategyError;
          } finally {
            setRelationshipEvaluating(false);
          }
        }
        const prepared = await prepareRoleplayResources({
          character,
          conversation,
          loreBooks,
          provider,
          signal: ctl.signal,
        });
        character = prepared.character;
        const callMembers = members.map((member) =>
            member.id === character.id ? character : member,
          ),
          presence = await resolveChatPresenceContext({
            conversation,
            actorId: character.id,
            messages: historyMessages,
          }),
          crossModeContinuity = await resolveOnlineCrossModeContinuity({
            conversation,
            actorId: character.id,
            names: Object.fromEntries(callMembers.map((item) => [item.id, item.name])),
          }),
          ctx = buildContext({
            character,
            conversation,
            messages: historyMessages,
            loreBooks: prepared.loreBooks,
            memories,
            userText:
              "你们正在进行实时通话。请用自然口语简短回应用户刚才的话，不要描述动作或界面。",
            settings,
            provider,
            characters: callMembers,
            mediaAssets,
            scene: "voice-call",
            presence,
            crossModeContinuity,
          });
        const bilingual = autoTranslateCharacter(character, conversation),
          raw = await new OpenAIProvider({ ...provider, stream: false }).chat(
            bilingual
              ? [
                  ...ctx,
                  { role: "system", content: bilingualSingleInstruction },
                ]
              : ctx,
            { stream: false, signal: ctl.signal },
          ),
          parsed = bilingual
            ? parseBilingualSingle(raw)
            : { content: raw, translation: undefined },
          localValidation = validateLocalCharacterReply({
            messages: [parsed.content],
            translations: [parsed.translation],
            characterName: prepared.character.name,
            presence,
          }),
          review = localValidation.issues.length
            ? await reviewCharacterReply({
            character,
            conversation,
            scene: "voice-call",
            draftMessages: [parsed.content],
            messages: historyMessages,
            characters: callMembers,
            loreBooks: prepared.loreBooks,
            memories,
            settings,
            provider,
            bilingual,
            presence,
            crossModeContinuity,
                signal: ctl.signal,
              })
            : undefined,
          reply = review?.revisedMessages[0] ?? parsed.content,
          translation = bilingual
            ? (review?.revisedTranslations?.[0] ?? parsed.translation)
            : undefined;
        if (bilingual && !translation?.trim())
          throw new ProviderError(
            "format",
            "Bilingual call reply is missing a translation",
          );
        const finalValidation = validateLocalCharacterReply({
          messages: [reply],
          translations: [translation],
          characterName: prepared.character.name,
          presence,
        });
        if (finalValidation.issues.length)
          throw new ProviderError(
            "format",
            finalValidation.issues.includes("remote-presence")
              ? "通话回复仍违反线上聊天距离约束"
              : "通话回复仍不符合本地格式要求",
          );
        const line = {
          id: uid(),
          characterId: character.id,
          name: character.name,
          text: reply,
          translation,
          role: "character" as const,
        };
        setLines((old) => [...old, line]);
        await play(character, reply);
        if (shouldConfess) {
          try {
            const confessionMessages = [
                ...historyMessages,
                {
                  id: "call-reply",
                  schemaVersion: SCHEMA_VERSION,
                  createdAt: now(),
                  updatedAt: now(),
                  conversationId: conversation.id,
                  senderType: "character" as const,
                  senderId: character.id,
                  content: reply,
                  status: "complete" as const,
                },
              ],
              confessionContext = buildContext({
                character,
                conversation,
                messages: confessionMessages,
                loreBooks: prepared.loreBooks,
                memories,
                userText: "在通话回复后自然完成首次表白。",
                settings,
                provider,
                characters: callMembers,
                mediaAssets,
                scene: "voice-call",
                presence,
                crossModeContinuity,
              }),
              parts = await generateConfessionMessages({
                character,
                context: confessionContext,
                provider,
                signal: ctl.signal,
              }),
              confessionReview = await reviewCharacterReply({
                character,
                conversation,
                scene: "voice-call",
                draftMessages: parts,
                messages: confessionMessages,
                characters: callMembers,
                loreBooks: prepared.loreBooks,
                memories,
                settings,
                provider,
                presence,
                crossModeContinuity,
                signal: ctl.signal,
              });
            const confessionValidation = validateLocalCharacterReply({
              messages: confessionReview.revisedMessages,
              characterName: character.name,
              presence,
            });
            if (confessionValidation.issues.length)
              throw new ProviderError(
                "format",
                confessionValidation.issues.includes("remote-presence")
                  ? "通话表白仍违反线上聊天距离约束"
                  : "通话表白仍不符合本地格式要求",
              );
            const saved = await saveConfessionMessages({
                characterId: character.id,
                conversationId: conversation.id,
                parts: confessionReview.revisedMessages,
                provider,
              });
            for (const message of saved) {
              const confessionLine = {
                id: uid(),
                characterId: character.id,
                name: character.name,
                text: message.content,
                role: "character" as const,
              };
              setLines((old) => [...old, confessionLine]);
              await play(character, message.content);
            }
          } catch (confessionError) {
            if (
              confessionError instanceof ProviderError &&
              confessionError.kind === "aborted"
            )
              throw confessionError;
          }
        }
      } else {
        const order = await selectGroupReplyOrder(
          provider,
          members,
          historyMessages,
          ctl.signal,
        );
        let rolling = historyMessages;
        for (const id of order) {
          const member = members.find((item) => item.id === id);
          if (!member) continue;
          const prepared = await prepareRoleplayResources({
              character: member,
              conversation,
              loreBooks,
              provider,
              signal: ctl.signal,
            }),
            callMembers = members.map((item) =>
              item.id === member.id ? prepared.character : item,
            ),
            presence = await resolveChatPresenceContext({
              conversation,
              actorId: prepared.character.id,
              messages: rolling,
            }),
            crossModeContinuity = await resolveOnlineCrossModeContinuity({
              conversation,
              actorId: prepared.character.id,
              names: Object.fromEntries(callMembers.map((item) => [item.id, item.name])),
            }),
            ctx = buildContext({
              character: prepared.character,
              conversation,
              messages: rolling,
              loreBooks: prepared.loreBooks,
              memories,
              userText:
                "你们正在群聊语音通话。请用自然口语简短回应，不要描述界面。",
              settings,
              provider,
              characters: callMembers,
              mediaAssets,
              scene: "voice-call",
              presence,
              crossModeContinuity,
            }),
            bilingual = autoTranslateCharacter(
              prepared.character,
              conversation,
            ),
            generatedParts = bilingual
              ? await generateCharacterMessageGroupBilingual(
                  provider,
                  ctx,
                  prepared.character,
                  ctl.signal,
                )
              : (
                  await generateCharacterMessageGroup(
                    provider,
                    ctx,
                    prepared.character,
                    ctl.signal,
                  )
                ).map((content) => ({ content, translation: undefined })),
            localValidation = validateLocalCharacterReply({
              messages: generatedParts.map((part) => part.content),
              translations: generatedParts.map((part) => part.translation),
              characterName: prepared.character.name,
              presence,
            }),
            review = localValidation.issues.length
              ? await reviewCharacterReply({
                  character: prepared.character,
              conversation,
              scene: "voice-call",
              draftMessages: generatedParts.map((part) => part.content),
              messages: rolling,
              characters: callMembers,
              loreBooks: prepared.loreBooks,
              memories,
              settings,
              provider,
              bilingual,
              presence,
            crossModeContinuity,
                  signal: ctl.signal,
                })
              : undefined,
            reply = (review?.revisedMessages ?? generatedParts.map((part) => part.content)).join(" "),
            translation = bilingual
              ? (review?.revisedTranslations ?? generatedParts.map((part) => part.translation ?? "")).join(" ")
              : undefined;
          if (bilingual && !translation?.trim())
            throw new ProviderError(
              "format",
              "Bilingual call reply is missing a translation",
            );
          const finalValidation = validateLocalCharacterReply({
          messages: [reply],
          translations: [translation],
          characterName: prepared.character.name,
          presence,
        });
        if (finalValidation.issues.length)
          throw new ProviderError(
            "format",
            finalValidation.issues.includes("remote-presence")
              ? "通话回复仍违反线上聊天距离约束"
              : "通话回复仍不符合本地格式要求",
          );
        const line = {
            id: uid(),
            characterId: prepared.character.id,
            name: prepared.character.name,
            text: reply,
            translation,
            role: "character" as const,
          };
          setLines((old) => [...old, line]);
          rolling = [
            ...rolling,
            {
              id: "call-" + line.id,
              schemaVersion: SCHEMA_VERSION,
              createdAt: now(),
              updatedAt: now(),
              conversationId: conversation.id,
              senderType: "character",
              senderId: prepared.character.id,
              content: reply,
              status: "complete",
            },
          ];
          await play(prepared.character, reply);
        }
      }
    } catch (e) {
      if (!ctl.signal.aborted)
        setError(e instanceof Error ? e.message : "通话回复失败");
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  async function end() {
    if (ended.current) return;
    ended.current = true;
    controller.current?.abort();
    activeAudio.current?.pause();
    if (activeAudioUrl.current) URL.revokeObjectURL(activeAudioUrl.current);
    activeAudio.current = null;
    activeAudioUrl.current = "";
    setSpeechStatus("");
    stream.current?.getTracks().forEach((track) => track.stop());
    const duration = Date.now() - started.current;
    const content = linesRef.current
      .map((line) => line.name + "：" + line.text)
      .join(" ");
    const summary = content
      ? content.slice(0, 180) + (content.length > 180 ? "…" : "")
      : "通话未产生对话内容";
    if (callHistory.current && history.state?.chachaCall) { callHistory.current = false; history.back(); }
    await onEnd(duration, summary);
  }

  const composer = (
    <div className="call-composer">
      <textarea
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="输入你在通话中说的话…"
        disabled={busy}
      />
      {busy ? (
        <button
          aria-label="停止通话回复"
          onClick={() => controller.current?.abort()}
        >
          <Square />
        </button>
      ) : (
        <button
          aria-label="发送通话文字"
          disabled={!text.trim() || !provider.apiKey}
          onClick={() => void send()}
        >
          <SendHorizonal />
        </button>
      )}
      <button
        className="hangup"
        aria-label="挂断通话"
        onClick={() => void end()}
      >
        <PhoneOff />
      </button>
    </div>
  );

  if (type === "video") {
    const recentLines = lines.slice(-3);
    return (
      <div className="call-overlay video">
        <div className="video-call-stage">
          {primaryCharacter?.avatar && !avatarBroken ? (
            <img
              className="video-role-image"
              src={primaryCharacter.avatar}
              alt={`${roleName}的角色画面`}
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <div
              className="video-role-fallback"
              aria-label={`${roleName}的默认角色画面`}
            >
              <span>{roleName.slice(0, 1)}</span>
            </div>
          )}
          <div className="video-call-shade" />
          <div className="video-call-heading">
            <span>视频通话</span>
            <b>{roleName}</b>
            <small>已接通</small>
          </div>
          <div
            className={`self-video-frame ${cameraError ? "unavailable" : ""}`}
          >
            <video ref={video} muted playsInline className="self-video" />
            {cameraError ? <small>{cameraError}</small> : <span>我的画面</span>}
          </div>
          <div className="video-call-transcript" aria-live="polite">
            {recentLines.map((line) => (
              <div key={line.id} className={line.role}>
                <b>{line.name}</b>
                <p>{line.text}</p>
                {line.translation && (
                  <small className="content-translation call-translation">
                    {line.translation}
                  </small>
                )}
              </div>
            ))}
            {relationshipEvaluating ? (
              <div className="call-thinking">
                <Mic />
                正在理解你们的关系…
              </div>
            ) : (
              busy &&
              !speechStatus && (
                <div className="call-thinking">
                  <Mic />
                  角色正在回应…
                </div>
              )
            )}
            {speechStatus && (
              <div className="call-thinking speech">
                <Mic />
                {speechStatus}
              </div>
            )}
            {error && <p className="call-error">{error}</p>}
          </div>
          {composer}
        </div>
      </div>
    );
  }

  return (
    <div className="call-overlay voice">
      <div className="call-backdrop">
        <div className="call-avatars">
          {members.slice(0, 5).map((character) => (
            <Avatar
              key={character.id}
              text={character.name}
              src={character.avatar}
              size="lg"
            />
          ))}
        </div>
        <h2>{conversation.title}</h2>
        <p>
          {conversation.type === "group"
            ? members.length + " 人语音通话"
            : "语音通话中"}
        </p>
      </div>
      <div className="call-transcript">
        {lines.map((line) => (
          <div key={line.id} className={line.role}>
            <b>{line.name}</b>
            <p>{line.text}</p>
            {line.translation && (
              <small className="content-translation call-translation">
                {line.translation}
              </small>
            )}
          </div>
        ))}
        {relationshipEvaluating ? (
          <div className="call-thinking">
            <Mic />
            正在理解你们的关系…
          </div>
        ) : (
          busy &&
          !speechStatus && (
            <div className="call-thinking">
              <Mic />
              角色正在回应…
            </div>
          )
        )}
        {speechStatus && (
          <div className="call-thinking speech">
            <Mic />
            {speechStatus}
          </div>
        )}
        {error && <p className="call-error">{error}</p>}
      </div>
      {composer}
    </div>
  );
}
