import { describe, expect, it } from "vitest";
import { autoTranslateCharacter, bilingualLanguage } from "./bilingual";
import { SCHEMA_VERSION, type Character } from "./types";

const character = {
  id: "cantonese",
  schemaVersion: SCHEMA_VERSION,
  createdAt: 1,
  updatedAt: 1,
  name: "Role",
  avatar: "",
  bio: "",
  personality: "",
  speakingStyle: "",
  background: "",
  language: "\u7ca4\u8bed",
  proactive: {
    messages: false,
    timeAware: false,
    frequency: "low",
    quietStart: "23:00",
    quietEnd: "08:00",
    catchupLimit: 0,
    dailyLimit: 0,
  },
  relationship: { intimacy: 0, trust: 0, mood: "", recentEvents: [] },
  lastActiveAt: 1,
} as Character;

describe("bilingual language rules", () => {
  it("includes Cantonese but still excludes Simplified Chinese", () => {
    expect(bilingualLanguage("\u7ca4\u8bed")).toBe(true);
    expect(bilingualLanguage("\u4e2d\u6587")).toBe(false);
    expect(autoTranslateCharacter(character)).toBe(true);
  });

  it("honors the character translation switch for Cantonese", () => {
    expect(
      autoTranslateCharacter({
        ...character,
        chatSettings: {
          language: "\u7ca4\u8bed",
          contextLimit: 30,
          stream: false,
          autoTranslate: false,
        },
      }),
    ).toBe(false);
  });
});
