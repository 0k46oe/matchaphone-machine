import {
  detectRemotePresenceViolation,
  type ChatPresenceContext,
  type RemotePresenceViolation,
} from "./chatPresence";

export type LocalReplyIssue =
  | "empty"
  | "model-leak"
  | "character-prefix"
  | "chat-format"
  | "remote-presence";

export interface LocalReplyValidation {
  issues: LocalReplyIssue[];
  remoteViolation?: RemotePresenceViolation;
}

const leakPattern =
  /(system prompt|developer message|api key|authorization|token budget|系统提示词|语言模型|作为\s*(?:ai|AI)|```(?:json)?|^\s*\{[\s\S]*\}\s*$)/i;

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateLocalCharacterReply(input: {
  messages: string[];
  translations?: Array<string | undefined>;
  characterName: string;
  presence?: ChatPresenceContext;
}): LocalReplyValidation {
  const issues = new Set<LocalReplyIssue>(),
    messages = input.messages.map((value) => value.trim()),
    texts = [...messages, ...(input.translations ?? [])];
  if (!messages.length || messages.some((message) => !message)) issues.add("empty");
  const prefix = new RegExp(
      "^\\s*" + escapedPattern(input.characterName) + "\\s*[：:]",
      "i",
    ),
    action = /^\s*(?:（|\(|\*|【|\[).{0,24}(?:动作|心理|旁白|表情)/;
  if (texts.some((text) => Boolean(text && leakPattern.test(text))))
    issues.add("model-leak");
  if (messages.some((message) => prefix.test(message)))
    issues.add("character-prefix");
  if (messages.some((message) => action.test(message))) issues.add("chat-format");
  const remoteViolation =
    input.presence?.mode === "remote"
      ? detectRemotePresenceViolation(texts)
      : undefined;
  if (remoteViolation) issues.add("remote-presence");
  return { issues: [...issues], remoteViolation };
}

export function requiresStrictReplyReview(input: {
  messages: string[];
  translations?: Array<string | undefined>;
  characterName: string;
  presence?: ChatPresenceContext;
}) {
  return validateLocalCharacterReply(input).issues.length > 0;
}
