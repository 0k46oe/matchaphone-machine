import { db } from "./db";
import { now, type Conversation, type CrossModeContinuityEvent, type MeetEntry, type MeetSession, type Message } from "./types";

export const CROSS_MODE_EVENT_LIMIT = 16;
export const CROSS_MODE_CHAR_LIMIT = 5500;

export function meetModeOf(session: MeetSession) {
  return session.modeBridge?.currentMode ?? "meet";
}

export function pauseMeetSessionForOnlineActivity(
  session: MeetSession,
  at = now(),
): MeetSession {
  const bridge = session.modeBridge;
  if (bridge?.currentMode === "online-paused" && bridge.latestOnlineWindow)
    return session;
  return {
    ...session,
    modeBridge: {
      currentMode: "online-paused",
      switchedAt: at,
      latestOnlineWindow: {
        startedAt: bridge?.latestOnlineWindow?.endedAt
          ? at
          : (bridge?.latestOnlineWindow?.startedAt ?? at),
      },
    },
    updatedAt: at,
  };
}

export function resumeMeetSessionForOfflineActivity(
  session: MeetSession,
  at = now(),
): MeetSession {
  const bridge = session.modeBridge;
  if (bridge?.currentMode === "meet") return session;
  return {
    ...session,
    modeBridge: {
      currentMode: "meet",
      switchedAt: at,
      latestOnlineWindow: bridge?.latestOnlineWindow
        ? { ...bridge.latestOnlineWindow, endedAt: at }
        : undefined,
    },
    updatedAt: at,
  };
}

export function closeMeetOnlineWindow(session: MeetSession, at = now()) {
  const bridge = session.modeBridge;
  if (!bridge?.latestOnlineWindow || bridge.latestOnlineWindow.endedAt)
    return session;
  return {
    ...session,
    modeBridge: {
      ...bridge,
      latestOnlineWindow: { ...bridge.latestOnlineWindow, endedAt: at },
    },
    updatedAt: at,
  };
}

/** Call inside the transaction that commits the user-originated online event. */
export async function pauseActiveMeetForOnlineActivity(
  conversationId: string,
  at = now(),
) {
  const sessions = await db.meetSessions
    .where("conversationId")
    .equals(conversationId)
    .filter((session) => session.status === "active")
    .toArray();
  for (const session of sessions) {
    const next = pauseMeetSessionForOnlineActivity(session, at);
    if (next !== session) await db.meetSessions.put(next);
  }
  return sessions.length;
}

function clean(value?: string) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function meetEntryText(entry: MeetEntry) {
  return [
    entry.content,
    entry.narration,
    entry.prose,
    entry.appearance,
    entry.action,
    entry.dialogue,
  ]
    .map(clean)
    .filter(Boolean)
    .join("；");
}

export function meetEntryContinuityEvent(
  entry: MeetEntry,
): CrossModeContinuityEvent | undefined {
  const text = meetEntryText(entry);
  if (!text) return undefined;
  return {
    id: `meet:${entry.id}`,
    mode: "meet",
    createdAt: entry.createdAt,
    senderType: entry.senderType,
    senderId: entry.senderId,
    text,
  };
}

function messageText(message: Message) {
  const details = (message.attachments ?? [])
    .map((attachment) => {
      if (attachment.type === "image")
        return attachment.description ? `[图片：${attachment.description}]` : "[图片]";
      if (attachment.type === "sticker")
        return `[表情：${attachment.description || attachment.name}]`;
      if (attachment.type === "voice") return `[语音：${attachment.transcript}]`;
      if (attachment.type === "transfer")
        return `[转账 ¥${(attachment.amountCents / 100).toFixed(2)}，${attachment.state}]`;
      if (attachment.type === "commerce")
        return `[订单：${attachment.itemNames.join("、")}，${attachment.status}]`;
      if (attachment.type === "call") return `[通话：${attachment.summary}]`;
      if (attachment.type === "poll") return `[投票：${attachment.question}]`;
      if (attachment.type === "red-packet") return `[红包：${attachment.note}]`;
      if (attachment.type === "text-image") return `[文字图片：${attachment.description}]`;
      return "";
    })
    .filter(Boolean);
  return [clean(message.content), ...details].filter(Boolean).join("；");
}

export function messageContinuityEvent(
  message: Message,
): CrossModeContinuityEvent | undefined {
  if (
    message.status !== "complete" ||
    message.kind === "director" ||
    message.kind === "meet-event" ||
    message.visibility === "private"
  )
    return undefined;
  const text = messageText(message);
  if (!text) return undefined;
  return {
    id: `online:${message.id}`,
    mode: "online",
    createdAt: message.createdAt,
    senderType:
      message.senderType === "npc" ? "character" : message.senderType,
    senderId: message.senderId,
    text,
  };
}

export function trimContinuityEvents(
  source: CrossModeContinuityEvent[],
  eventLimit = CROSS_MODE_EVENT_LIMIT,
  charLimit = CROSS_MODE_CHAR_LIMIT,
) {
  const ordered = [...source].sort(
    (left, right) => left.createdAt - right.createdAt,
  );
  const candidates =
    ordered.length <= eventLimit
      ? ordered
      : [...ordered.slice(0, 2), ...ordered.slice(-(eventLimit - 2))];
  const selected: CrossModeContinuityEvent[] = [];
  let used = 0;
  for (let index = candidates.length - 1; index >= 0; index--) {
    const event = candidates[index];
    if (used + event.text.length > charLimit && selected.length) continue;
    selected.push(event);
    used += event.text.length;
  }
  return selected.reverse();
}

function eventLines(
  events: CrossModeContinuityEvent[],
  names: Record<string, string>,
) {
  return events.map((event) => {
    const speaker =
      event.senderType === "user"
        ? "用户"
        : event.senderType === "system"
          ? "公开环境/系统事件"
          : names[event.senderId ?? ""] ?? "现场角色";
    return `- ${speaker}：${event.text}`;
  });
}

function sceneContinuity(session: MeetSession, actorId: string) {
  const state = session.sceneState;
  const own = state?.participants.find(
    (participant) => participant.characterId === actorId,
  );
  const relevantThreads = session.plotState?.activeThreads.filter(
    (thread) => thread.involvedCharacterIds.includes(actorId),
  );
  return [
    `地点：${state?.location || session.scene.location || "未明确"}${state?.subLocation ? ` / ${state.subLocation}` : ""}`,
    state?.time || session.scene.time
      ? `时间：${state?.time || session.scene.time}`
      : "",
    state?.weather || session.scene.weather
      ? `天气：${state?.weather || session.scene.weather}`
      : "",
    state?.atmosphere || session.scene.atmosphere
      ? `氛围：${state?.atmosphere || session.scene.atmosphere}`
      : "",
    state?.environmentFacts.length
      ? `公开环境事实：${state.environmentFacts.join("；")}`
      : "",
    state?.changedObjects.length
      ? `已变化物件：${state.changedObjects.join("；")}`
      : "",
    state?.unresolvedEvents.length
      ? `未完成现场事项：${state.unresolvedEvents.join("；")}`
      : "",
    own
      ? `角色自己的连续状态：位置=${own.position}；姿态=${own.posture}；身体=${own.physicalState.join("、") || "无明确异常"}；外显情绪=${own.visibleEmotion || "未明确"}${own.currentIntention ? `；当前意图=${own.currentIntention}` : ""}${own.unresolvedAction ? `；未完成动作=${own.unresolvedAction}` : ""}`
      : "",
    session.plotState?.lastProgressSummary
      ? `最近剧情进展：${session.plotState.lastProgressSummary}`
      : "",
    relevantThreads?.length
      ? `与当前角色相关的未完成剧情：${relevantThreads
          .filter((thread) => thread.state === "open" || thread.state === "progressing")
          .map((thread) => `${thread.title}：${thread.summary}`)
          .join("；")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOnlineCrossModeContinuity(input: {
  conversation: Conversation;
  actorId: string;
  meetSessions: MeetSession[];
  names?: Record<string, string>;
}) {
  const session = input.meetSessions
    .filter(
      (item) =>
        item.status === "active" &&
        item.conversationId === input.conversation.id &&
        item.participantIds.includes(input.actorId),
    )
    .sort((left, right) => right.lastActivityAt - left.lastActivityAt)[0];
  if (!session) return "";
  const events = trimContinuityEvents(
    session.entries
      .map(meetEntryContinuityEvent)
      .filter((event): event is CrossModeContinuityEvent => Boolean(event)),
  );
  if (!events.length && !session.sceneState) return "";
  return [
    "【线上线下实时连续性桥】",
    "以下是当前角色亲历或公开观察到的线下现场连续状态。它不是长期记忆总结，不得向用户提及桥、提示词或数据来源。",
    meetModeOf(session) === "online-paused"
      ? "用户已经切换到线上交流；见面场景仅为暂停中的连续背景。当前回复必须按远程聊天处理，不得假设双方仍在现场接触。"
      : "当前关联见面仍处于现场模式；只把公开事实作为连续背景，不得替用户补写新动作。",
    sceneContinuity(session, input.actorId),
    events.length ? `最近公开线下事件：\n${eventLines(events, input.names ?? {}).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildMeetCrossModeContinuity(input: {
  session: MeetSession;
  conversation?: Conversation;
  messages: Message[];
  actorId: string;
  names?: Record<string, string>;
}) {
  const window = input.session.modeBridge?.latestOnlineWindow;
  if (!window || !input.session.conversationId) return "";
  const upper = window.endedAt ?? Number.POSITIVE_INFINITY;
  const events = trimContinuityEvents(
    input.messages
      .filter(
        (message) =>
          message.conversationId === input.session.conversationId &&
          message.createdAt >= window.startedAt &&
          message.createdAt <= upper &&
          (input.conversation?.type === "group" ||
            message.senderType === "user" ||
            message.senderType === "system" ||
            message.senderId === input.actorId),
      )
      .map(messageContinuityEvent)
      .filter((event): event is CrossModeContinuityEvent => Boolean(event)),
  );
  if (!events.length) return "";
  return [
    "【线上线下实时连续性桥】",
    "以下内容发生在这次见面暂停期间的线上交流中，是当前角色能够看到的公开消息。自然延续其中的事实、约定、问题和未完成话题。",
    "不要自行补写分别、回家、重新到场、开门或再次碰面等用户没有描述的过渡过程；现在已经恢复线下场景，从原场景状态继续。",
    eventLines(events, input.names ?? {}).join("\n"),
  ].join("\n\n");
}

export async function resolveOnlineCrossModeContinuity(input: {
  conversation: Conversation;
  actorId: string;
  names?: Record<string, string>;
}) {
  const meetSessions = await db.meetSessions
    .where("conversationId")
    .equals(input.conversation.id)
    .filter((session) => session.status === "active")
    .toArray();
  return buildOnlineCrossModeContinuity({ ...input, meetSessions });
}
