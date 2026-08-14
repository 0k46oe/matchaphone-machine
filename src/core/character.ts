import type { Character, Language, LoreBook } from "./types";
export const CHARACTER_LANGUAGE_OPTIONS: Language[] = [
  "中文",
  "粤语",
  "English",
  "日本語",
  "한국어",
  "Русский",
];
export function languageStyleInstruction(language: Language) {
  if (language === "粤语")
    return "必须使用粤语回复，并采用自然、地道、符合粤语书面口语习惯的繁体字、语气词和句式；不要写成普通话直译，角色原文内不要夹带普通话解释。若输出格式要求独立 translation 字段，只在该字段提供忠实简体中文译文。";
  if (language === "English")
    return "必须使用自然、地道的 English 回复，使用符合英语母语者习惯的措辞、语序、标点和口语节奏；不要夹杂中文翻译。";
  if (language === "日本語")
    return "必须使用自然、地道的日本語回复，根据角色关系使用合适的敬语、口语层级、语气词和日文标点；不要写成中文式日语。";
  if (language === "한국어")
    return "必须使用自然、地道的한국어回复，根据角色关系使用合适的敬语层级、语尾和口语节奏；不要附中文翻译。";
  if (language === "Русский")
    return "必须使用自然、地道的 Русский 回复，使用符合俄语母语者习惯的语法、语气和标点；不要夹杂中文翻译。";
  return "必须使用中文回复，并采用自然、地道、符合角色身份和关系的简体中文措辞、语气与标点。";
}
export const coreSettingOf = (c: Character) => c.coreSetting ?? c.bio ?? "";
export const characterAliasesOf = (c: Character) => [
  ...new Set((c.aliases ?? []).map((value) => value.trim()).filter(Boolean)),
];
export const rawPersonaOf = (c: Character) =>
  c.persona ??
  ([c.personality, c.speakingStyle].filter(Boolean).join("\n") || "");
export const characterAliasContext = (c: Character) => {
  const aliases = characterAliasesOf(c);
  return aliases.length
    ? `角色别名/昵称：${aliases.join("、")}。这些称呼都指向当前角色，不改变角色真实姓名、身份或世界观。`
    : "";
};
export const personaOf = (c: Character) =>
  [rawPersonaOf(c), characterAliasContext(c)].filter(Boolean).join("\n");
export const chatSettingsOf = (c: Character) => {
  const storedMin = c.chatSettings?.minReplyMessages,
    storedMax = c.chatSettings?.maxReplyMessages,
    legacyDefaultRange =
      c.chatSettings?.replyMessageRangeMode === undefined &&
      storedMin === 2 &&
      storedMax === 4,
    fixedReplyRange =
      c.chatSettings?.replyMessageRangeMode === "fixed" ||
      (c.chatSettings?.replyMessageRangeMode === undefined &&
        !legacyDefaultRange &&
        Number.isFinite(storedMin) &&
        Number.isFinite(storedMax)),
    normalizedMin = fixedReplyRange
      ? Math.max(1, Math.min(8, Math.trunc(storedMin!)))
      : undefined,
    normalizedMax = fixedReplyRange
      ? Math.max(
          normalizedMin!,
          Math.max(1, Math.min(8, Math.trunc(storedMax!))),
        )
      : undefined;
  return {
  language: (c.chatSettings?.language ?? c.language ?? "\u4e2d\u6587") as Language,
  contextLimit: Math.max(2, Math.min(100, c.chatSettings?.contextLimit ?? 30)),
  stream: c.chatSettings?.stream ?? false,
  autoTranslate: c.chatSettings?.autoTranslate ?? true,
  minReplyMessages: normalizedMin,
  maxReplyMessages: normalizedMax,
  replyMessageRangeMode: fixedReplyRange ? ("fixed" as const) : ("adaptive" as const),
  speech: c.chatSettings?.speech,
  feedImage: c.chatSettings?.feedImage,
  strategyMode: { enabled: c.chatSettings?.strategyMode?.enabled ?? false },
  meetInvitations: {
    enabled: c.chatSettings?.meetInvitations?.enabled ?? false,
  },
  music: {
    canInviteToListen: c.chatSettings?.music?.canInviteToListen ?? true,
    canControlPlayback: c.chatSettings?.music?.canControlPlayback ?? true,
    commentaryLevel: c.chatSettings?.music?.commentaryLevel ?? "medium",
    djEnabled: c.chatSettings?.music?.djEnabled ?? true,
    controlMode: c.chatSettings?.music?.controlMode ?? "balanced",
    allowNeteaseSearch: c.chatSettings?.music?.allowNeteaseSearch ?? true,
    moodImprintEnabled: c.chatSettings?.music?.moodImprintEnabled ?? true,
    moodRecallEnabled: c.chatSettings?.music?.moodRecallEnabled ?? true,
    lastProactiveInviteAt: c.chatSettings?.music?.lastProactiveInviteAt,
    lastCommentAt: c.chatSettings?.music?.lastCommentAt,
    lastCommentTrackId: c.chatSettings?.music?.lastCommentTrackId,
  },
  avatars: {
    showUserAvatar: c.chatSettings?.avatars?.showUserAvatar ?? true,
    showCharacterAvatar: c.chatSettings?.avatars?.showCharacterAvatar ?? true,
  },
  };
};
export const strategyModeEnabled = (c: Character) =>
  chatSettingsOf(c).strategyMode.enabled;
export const relationshipContextOf = (c: Character) =>
  strategyModeEnabled(c)
    ? `当前关系状态仅用于内在演绎，不得说出数值：亲密度 ${c.relationship.intimacy}/100，信任度 ${c.relationship.trust}/100，心情 ${c.relationship.mood}。近期关系事件：${c.relationship.recentEvents.join("；") || "无"}。`
    : "";
export const mountedLoreBooks = (c: Character, books: LoreBook[]) =>
  books.filter(
    (book) =>
      book.mount?.mode === "global" ||
      (book.mount?.mode !== "none" &&
        (c.loreBookIds === undefined || c.loreBookIds.includes(book.id))),
  );

