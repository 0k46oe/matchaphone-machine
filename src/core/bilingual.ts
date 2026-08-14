import type {
  Character,
  ContentTranslation,
  Conversation,
  Language,
} from "./types";

const languages = new Set<Language>([
  "\u7ca4\u8bed",
  "English",
  "\u65e5\u672c\u8a9e",
  "\ud55c\uad6d\uc5b4",
  "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
]);
export function bilingualLanguage(language?: Language) {
  return Boolean(language && languages.has(language));
}
export function autoTranslateCharacter(
  character?: Character,
  conversation?: Conversation,
) {
  if (!character || !bilingualLanguage(character.language)) return false;
  return (
    conversation?.chatSettings?.autoTranslate ??
    character.chatSettings?.autoTranslate ??
    true
  );
}
export function textHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
export function completedTranslation(
  original: string,
  text: string,
  model?: string,
  source: "same-generation" | "manual" = "same-generation",
): ContentTranslation {
  return {
    targetLanguage: "zh-CN",
    text: text.trim(),
    sourceHash: textHash(original),
    source,
    status: "complete",
    model,
    updatedAt: Date.now(),
  };
}
export const bilingualSingleInstruction =
  'Return strict JSON: {"content":"the original character response in the character output language","translation":"a faithful Simplified Chinese translation"}. Preserve tone, names, line breaks, punctuation and emoji. The translation is display-only and must not add plot or explanations.';
export const bilingualGroupInstruction =
  'Return strict JSON: {"messages":[{"content":"original bubble","translation":"faithful Simplified Chinese translation"}]}. Every bubble must have exactly one translation.';
function stripFence(value: string) {
  return value
    .trim()
    .replace(/^\x60\x60\x60(?:json)?\s*/i, "")
    .replace(/\s*\x60\x60\x60$/i, "");
}
export function parseBilingualSingle(raw: string) {
  const value = JSON.parse(stripFence(raw)) as {
    content?: unknown;
    translation?: unknown;
  };
  if (
    typeof value.content !== "string" ||
    !value.content.trim() ||
    typeof value.translation !== "string" ||
    !value.translation.trim()
  )
    throw new Error("Bilingual response is missing content or translation");
  return {
    content: value.content.trim(),
    translation: value.translation.trim(),
  };
}
export function parseBilingualItems(value: unknown, limit = 8) {
  const raw = (value as { messages?: unknown })?.messages;
  if (!Array.isArray(raw)) throw new Error("Bilingual message list is invalid");
  const items = raw
    .map((item) =>
      typeof item === "object" && item
        ? (item as { content?: unknown; translation?: unknown })
        : {},
    )
    .filter(
      (item) =>
        typeof item.content === "string" &&
        item.content.trim() &&
        typeof item.translation === "string" &&
        item.translation.trim(),
    )
    .slice(0, limit)
    .map((item) => ({
      content: (item.content as string).trim(),
      translation: (item.translation as string).trim(),
    }));
  if (!items.length || items.length !== Math.min(raw.length, limit))
    throw new Error("Bilingual message list is incomplete");
  return items;
}
