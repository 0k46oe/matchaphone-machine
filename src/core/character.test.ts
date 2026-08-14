import { describe, expect, it } from "vitest";
import {
  characterAliasesOf,
  chatSettingsOf,
  coreSettingOf,
  mountedLoreBooks,
  personaOf,
} from "./character";
import type { Character, LoreBook } from "./types";
const old = {
  bio: "core",
  personality: "gentle",
  speakingStyle: "brief",
  language: "日本語",
} as Character;
describe("character compatibility", () => {
  it("maps legacy fields", () => {
    expect(coreSettingOf(old)).toBe("core");
    expect(personaOf(old)).toBe("gentle\nbrief");
    expect(chatSettingsOf(old)).toMatchObject({
      language: "日本語",
      contextLimit: 30,
      stream: false,
      minReplyMessages: undefined,
      maxReplyMessages: undefined,
      strategyMode: { enabled: false },
    });
  });
  it("treats the former implicit 2-4 range as adaptive", () => {
    expect(
      chatSettingsOf({
        ...old,
        chatSettings: {
          language: "English",
          contextLimit: 30,
          stream: false,
          minReplyMessages: 2,
          maxReplyMessages: 4,
        },
      } as Character),
    ).toMatchObject({
      minReplyMessages: undefined,
      maxReplyMessages: undefined,
      replyMessageRangeMode: "adaptive",
    });
  });
  it("uses explicit new settings", () => {
    const c: Character = {
      ...old,
      coreSetting: "new core",
      persona: "new persona",
      chatSettings: {
        language: "English",
        contextLimit: 8,
        stream: true,
        minReplyMessages: 3,
        maxReplyMessages: 6,
      },
    };
    expect(coreSettingOf(c)).toBe("new core");
    expect(personaOf(c)).toBe("new persona");
    expect(chatSettingsOf(c)).toMatchObject({
      language: "English",
      contextLimit: 8,
      stream: true,
      minReplyMessages: 3,
      maxReplyMessages: 6,
      strategyMode: { enabled: false },
    });
  });
  it("adds aliases to model persona without changing the real name", () => {
    const c = {
      ...old,
      name: "Real",
      aliases: ["Alias", "Alias", "Nick"],
    } as Character;
    expect(characterAliasesOf(c)).toEqual(["Alias", "Nick"]);
    expect(personaOf(c)).toContain("Alias、Nick");
    expect(c.name).toBe("Real");
  });
  it("preserves explicit strategy mode", () => {
    expect(
      chatSettingsOf({
        ...old,
        chatSettings: {
          language: "中文",
          contextLimit: 20,
          stream: false,
          strategyMode: { enabled: true },
        },
      }).strategyMode.enabled,
    ).toBe(true);
  });
  it("defaults both chat avatars on and preserves explicit visibility", () => {
    expect(chatSettingsOf(old).avatars).toEqual({
      showUserAvatar: true,
      showCharacterAvatar: true,
    });
    const configured = {
      ...old,
      chatSettings: {
        language: "English",
        contextLimit: 20,
        stream: false,
        avatars: { showUserAvatar: false, showCharacterAvatar: true },
      },
    } as Character;
    expect(chatSettingsOf(configured).avatars).toEqual({
      showUserAvatar: false,
      showCharacterAvatar: true,
    });
  });
  it("filters mounted lore but keeps legacy all", () => {
    const books = [{ id: "a" }, { id: "b" }] as LoreBook[];
    expect(mountedLoreBooks(old, books)).toHaveLength(2);
    expect(
      mountedLoreBooks({ ...old, loreBookIds: ["b"] }, books).map((b) => b.id),
    ).toEqual(["b"]);
    expect(mountedLoreBooks({ ...old, loreBookIds: [] }, books)).toEqual([]);
  });
});
