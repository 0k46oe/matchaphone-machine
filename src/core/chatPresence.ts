import { db } from "./db";
import type { Conversation, MeetSession, Message } from "./types";
import { meetModeOf } from "./crossModeContinuity";

export type ChatPresenceMode = "remote" | "co-present";
export type ChatPresenceEvidence =
  | "default"
  | "active-meet"
  | "user-arrival"
  | "user-departure";
export interface ChatPresenceContext {
  mode: ChatPresenceMode;
  evidence: ChatPresenceEvidence;
}

const arrivalPatterns = [
  /(?:我|我们)(?:已经|现在|刚刚|刚才)?(?:到了|到你(?:家|门口|楼下|身边|旁边|面前)了|过来了|进来了|就在一起|就在你(?:身边|旁边|面前)|正和你待在一起|和你在一起|现在和你在一起)/i,
  /(?:见面|会面)(?:已经)?(?:开始|进行中)|双方(?:已经)?(?:同处|到了同一地点)/i,
  /\b(?:i(?:'m| am) (?:at your door|right beside you|with you now)|i(?:'ve| have) arrived|we(?:'re| are) together now)\b/i,
  /(?:着いた|到着した|今あなたの(?:隣|そば|目の前)にいる|一緒にいる)/i,
  /(?:도착했어|지금 네 (?:옆|앞)에 있어|우리 지금 같이 있어)/i,
  /(?:я (?:у твоей двери|рядом с тобой|уже приехал(?:а)?|уже приш[её]л)|мы сейчас вместе)/i,
];
const departurePatterns = [
  /(?:我|我们)(?:已经|现在|刚刚|刚才)?(?:先)?(?:离开了|走了|先走了|回家了|到家了|回去了|不在你(?:身边|旁边)了|和你分开了)/i,
  /(?:见面|会面)(?:已经)?(?:结束|取消|终止)|双方(?:已经)?分开/i,
  /\b(?:i(?:'ve| have) left|i(?:'m| am) home now|i went home|we(?:'re| are) apart now|the (?:meeting|visit) is over)\b/i,
  /(?:もう帰った|家に着いた|別れた|会うのは終わった)/i,
  /(?:이미 떠났어|집에 왔어|우리 헤어졌어|만남이 끝났어)/i,
  /(?:я уже уш[её]л|я уже дома|мы разошлись|встреча закончилась)/i,
];

export function classifyPresenceStatement(
  text: string,
): "arrival" | "departure" | undefined {
  const value = text.trim();
  if (!value) return undefined;
  if (departurePatterns.some((pattern) => pattern.test(value))) return "departure";
  if (arrivalPatterns.some((pattern) => pattern.test(value))) return "arrival";
  return undefined;
}

export function inferChatPresenceContext(input: {
  conversation: Conversation;
  actorId?: string;
  messages: Message[];
  meetSessions?: MeetSession[];
}): ChatPresenceContext {
  const relevantMeets = input.meetSessions?.filter(
    (session) =>
      session.status === "active" &&
      session.conversationId === input.conversation.id &&
      (!input.actorId || session.participantIds.includes(input.actorId)),
  );
  if (relevantMeets?.some((session) => meetModeOf(session) === "online-paused"))
    return { mode: "remote", evidence: "default" };
  const relevant = input.messages
    .filter(
      (message) =>
        message.conversationId === input.conversation.id &&
        message.status === "complete" &&
        (message.senderType === "user" || message.senderType === "system"),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
  for (const message of relevant) {
    const statement = classifyPresenceStatement(message.content);
    if (statement === "departure")
      return { mode: "remote", evidence: "user-departure" };
    if (statement === "arrival")
      return { mode: "co-present", evidence: "user-arrival" };
  }
  const activeMeet = relevantMeets?.some(
    (session) => meetModeOf(session) === "meet",
  );
  return activeMeet
    ? { mode: "co-present", evidence: "active-meet" }
    : { mode: "remote", evidence: "default" };
}

export async function resolveChatPresenceContext(input: {
  conversation: Conversation;
  actorId?: string;
  messages: Message[];
}): Promise<ChatPresenceContext> {
  const meetSessions = await db.meetSessions
    .where("conversationId")
    .equals(input.conversation.id)
    .filter((session) => session.status === "active")
    .toArray();
  return inferChatPresenceContext({ ...input, meetSessions });
}

export function chatPresenceInstruction(context: ChatPresenceContext) {
  if (context.mode === "co-present")
    return "当前上下文有可靠证据表明双方处于同一地点，可以在不替用户决定动作的前提下描写符合人设和场景的现实互动。";
  return [
    "【线上距离约束】当前是远程聊天或通话，默认双方不在同一地点。",
    "不得直接拥抱、牵手、触碰、亲吻、递东西、替用户开门、进入用户房间，也不得擅自写成自己已经来到用户门口、家中或身边。",
    "禁止使用“过来，手给我”“过来抱你”“把手机拿过来”等依赖双方同处的表达。",
    "需要表达关心或亲近时，应改为符合线上场景且符合角色人设的方式，例如让用户拍照、放到镜头前，或说明下次见面再做；不要套用统一温柔话术。",
  ].join("\n");
}

const allowedRemoteContext =
  /(?:下次|以后|等到|等我们|见面时|见面再|如果.{0,10}(?:身边|旁边|面前)|要是.{0,10}(?:身边|旁边|面前)|想抱|真想抱|隔着屏幕|云抱|镜头前|视频里|拍给我|发(?:张|个)?(?:照片|视频)|next time|when we meet|wish i (?:were|was) there|through the screen|camera|video|今度会った|会えたら|画面越し|다음에 만나|화면으로|когда встретимся|через экран)/i;
const remoteViolationPatterns = [
  /(?:过来|過嚟).{0,12}(?:抱|抱住|攬|亲|親|錫|手给我|手俾我|让我(?:抱|摸|牵)|讓我(?:攬|摸|拖)|手机拿过来|手機攞過嚟)/i,
  /(?:手给我|隻手俾我|给我抱抱|让我抱|我抱你|抱住你|攬住你|牵住你|拖住你|摸摸你|揉揉你|亲你|親你|錫你|把手机拿过来|拿着手机过来|攞部手機過嚟)/i,
  /(?:我|我而家|我依家)(?:已经|現在|现在|刚刚|啱啱)?(?:到你(?:门口|門口|家|楼下|樓下|身边|身邊)|在你(?:门口|門口|家|楼下|樓下|身边|身邊|旁边)|就在你(?:旁边|身边|面前)|喺你(?:門口|屋企|樓下|身邊)|过来了|過嚟咗|进来了|入嚟咗)/i,
  /(?:给我开门|開門|我就在门外|我喺門口|我在楼下|我喺樓下|我进来了|我入嚟喇)/i,
  /\b(?:come here|come over).{0,35}(?:hug|hold|kiss|give me your hand|bring (?:me )?your phone)|\bgive me your hand\b|\bi(?:'m| am) (?:at your door|outside your door|right beside you|in your room)\b|\bopen the door\b/i,
  /(?:こっちに来て|おいで).{0,18}(?:抱|手|スマホ)|手を(?:出して|貸して)|抱きしめ(?:る|て)|玄関にいる|ドアを開けて|今あなたの隣にいる/i,
  /(?:이리 와|여기로 와).{0,20}(?:안아|손|휴대폰)|손 줘|안아 줄게|문 앞에 있어|문 열어|지금 네 옆에 있어/i,
  /(?:подойди|иди сюда).{0,32}(?:обним|рук|телефон)|дай мне руку|я у твоей двери|открой дверь|я рядом с тобой/i,
];

export interface RemotePresenceViolation {
  text: string;
  excerpt: string;
}

export function detectRemotePresenceViolation(
  texts: Array<string | undefined>,
): RemotePresenceViolation | undefined {
  for (const text of texts) {
    if (!text?.trim()) continue;
    const segments = text
      .split(/[。！？!?；;\n]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      if (allowedRemoteContext.test(segment)) continue;
      if (remoteViolationPatterns.some((pattern) => pattern.test(segment)))
        return { text, excerpt: segment.slice(0, 120) };
    }
  }
  return undefined;
}
