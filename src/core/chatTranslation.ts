import { db } from "./db";
import { resolveSecondaryProvider } from "./modelServices";
import { OpenAIProvider } from "./provider";
import type {
  Character,
  Conversation,
  Language,
  Message,
  ProviderSettings,
} from "./types";

const inFlight = new Set<string>();
const supported = new Set<Language>([
  "\u7ca4\u8bed",
  "English",
  "日本語",
  "한국어",
  "Русский",
]);
export function shouldTranslateLanguage(language?: Language) {
  return Boolean(language && supported.has(language));
}
export function translationSourceHash(
  message: Pick<Message, "content" | "senderId" | "kind">,
) {
  const value = [
    message.senderId ?? "",
    message.kind ?? "text",
    message.content,
  ].join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
export function translatableCharacterMessage(
  message: Message,
  character?: Character,
) {
  if (
    !character ||
    !shouldTranslateLanguage(character.language) ||
    message.status !== "complete" ||
    !message.content.trim()
  )
    return false;
  if (message.senderType !== "character" && message.senderType !== "npc")
    return false;
  return !message.kind || message.kind === "text" || message.kind === "voice";
}
function emit() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("mira:chat-translation-change"));
}
function parseTranslations(raw: string, ids: string[]) {
  const clean = raw
      .trim()
      .replace(/^\x60\x60\x60(?:json)?\s*/i, "")
      .replace(/\s*\x60\x60\x60$/, ""),
    parsed = JSON.parse(clean) as {
      translations?: Array<{ id?: unknown; text?: unknown }>;
    },
    map = new Map<string, string>();
  for (const item of parsed.translations ?? []) {
    if (
      typeof item.id === "string" &&
      ids.includes(item.id) &&
      typeof item.text === "string" &&
      item.text.trim()
    )
      map.set(item.id, item.text.trim());
  }
  if (map.size !== ids.length)
    throw new Error(
      "\u7ffb\u8bd1\u670d\u52a1\u6ca1\u6709\u8fd4\u56de\u5b8c\u6574\u8bd1\u6587",
    );
  return map;
}
export async function translateChatMessages(input: {
  messageIds: string[];
  character: Character;
  conversation: Conversation;
  primaryProvider: ProviderSettings;
  force?: boolean;
}) {
  if (!shouldTranslateLanguage(input.character.language)) return [];
  const key =
    input.conversation.id +
    ":" +
    input.character.id +
    ":" +
    input.messageIds.join(",");
  if (inFlight.has(key)) return [];
  inFlight.add(key);
  try {
    const rows = (await db.messages.bulkGet(input.messageIds)).filter(
        (message): message is Message =>
          Boolean(
            message && translatableCharacterMessage(message, input.character),
          ),
      ),
      pending = rows.filter((message) => {
        const hash = translationSourceHash(message),
          current = message.translation;
        if (current?.sourceHash !== hash) return true;
        if (input.force) return true;
        return current.status === "pending";
      });
    if (!pending.length) return [];
    const time = Date.now();
    await db.transaction("rw", db.messages, async () => {
      for (const message of pending)
        await db.messages.update(message.id, {
          translation: {
            targetLanguage: "zh-CN",
            sourceHash: translationSourceHash(message),
            source: "manual",
            status: "pending",
            updatedAt: time,
          },
        });
    });
    emit();
    const provider = await resolveSecondaryProvider(input.primaryProvider);
    if (!provider.apiKey.trim())
      throw new Error(
        "\u5c1a\u672a\u914d\u7f6e\u53ef\u7528\u7684\u7ffb\u8bd1 API",
      );
    const payload = pending.map((message) => ({
        id: message.id,
        text: message.content,
      })),
      raw = await new OpenAIProvider({
        ...provider,
        stream: false,
        temperature: 0.1,
      }).chat(
        [
          {
            role: "system",
            content:
              '\u4f60\u662f\u5fe0\u5b9e\u7684\u804a\u5929\u7ffb\u8bd1\u5668\u3002\u5c06\u8f93\u5165\u7ffb\u8bd1\u4e3a\u7b80\u4f53\u4e2d\u6587\uff0c\u4fdd\u7559\u8bed\u6c14\u3001\u79f0\u547c\u3001\u6362\u884c\u3001\u6807\u70b9\u548c\u8868\u60c5\uff0c\u4e0d\u6539\u5199\u5267\u60c5\uff0c\u4e0d\u6dfb\u52a0\u89e3\u91ca\u3002\u53ea\u8f93\u51fa\u4e25\u683c JSON\uff1a{"translations":[{"id":"\u539f id","text":"\u8bd1\u6587"}]}',
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { stream: false },
      ),
      translated = parseTranslations(
        raw,
        pending.map((message) => message.id),
      ),
      completedAt = Date.now();
    await db.transaction("rw", db.messages, async () => {
      for (const original of pending) {
        const current = await db.messages.get(original.id),
          hash = translationSourceHash(original);
        if (!current || translationSourceHash(current) !== hash) continue;
        await db.messages.update(original.id, {
          translation: {
            targetLanguage: "zh-CN",
            text: translated.get(original.id),
            sourceHash: hash,
            source: "manual",
            status: "complete",
            model: provider.model,
            updatedAt: completedAt,
          },
        });
      }
    });
    emit();
    return pending.map((message) => message.id);
  } catch (error) {
    const failedAt = Date.now(),
      reason =
        error instanceof Error ? error.message : "\u7ffb\u8bd1\u5931\u8d25";
    for (const id of input.messageIds) {
      const current = await db.messages.get(id);
      if (!current || !translatableCharacterMessage(current, input.character))
        continue;
      const hash = translationSourceHash(current);
      if (
        current.translation?.sourceHash !== hash ||
        current.translation.status !== "pending"
      )
        continue;
      await db.messages.update(id, {
        translation: {
          ...current.translation,
          status: "error",
          error: reason.slice(0, 300),
          updatedAt: failedAt,
        },
      });
    }
    emit();
    return [];
  } finally {
    inFlight.delete(key);
  }
}
export async function translateChatMessage(input: {
  messageId: string;
  character: Character;
  conversation: Conversation;
  primaryProvider: ProviderSettings;
  force?: boolean;
}) {
  return translateChatMessages({ ...input, messageIds: [input.messageId] });
}
