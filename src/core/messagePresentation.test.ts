import { describe, expect, it } from "vitest";
import { isCardOnlyMessage } from "./messagePresentation";
import type { MessageAttachment } from "./types";

const cardTypes: MessageAttachment["type"][] = [
  "transfer",
  "commerce",
  "red-packet",
  "call",
  "meet-invitation",
  "meet-event",
  "poll",
  "music-invitation",
  "music-event",
  "music-search-candidates",
  "music-control-proposal",
  "music-session-summary",
  "couple-island-invitation",
];

describe("message presentation", () => {
  it.each(cardTypes)("renders %s as a standalone card", (type) => {
    expect(isCardOnlyMessage({ attachments: [{ type } as MessageAttachment] })).toBe(true);
  });

  it.each(["sticker", "image", "text-image", "voice"] as MessageAttachment["type"][])(
    "keeps ordinary %s media out of the structured-card classifier",
    (type) => {
      expect(isCardOnlyMessage({ attachments: [{ type } as MessageAttachment] })).toBe(false);
    },
  );
});
