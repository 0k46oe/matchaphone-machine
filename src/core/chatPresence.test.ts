import { describe, expect, it } from "vitest";
import {
  chatPresenceInstruction,
  classifyPresenceStatement,
  detectRemotePresenceViolation,
  inferChatPresenceContext,
} from "./chatPresence";
import { validateLocalCharacterReply } from "./replyValidation";
import type { Conversation, MeetSession, Message } from "./types";

const conversation: Conversation = {
  id: "conversation",
  schemaVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  title: "聊天",
  type: "private",
  memberIds: ["character"],
  presetIds: [],
  loreBookIds: [],
  lastActivityAt: 1,
};

function message(
  id: string,
  content: string,
  senderType: Message["senderType"] = "user",
  createdAt = 1,
): Message {
  return {
    id,
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    conversationId: conversation.id,
    senderType,
    senderId: senderType === "character" ? "character" : "user",
    content,
    status: "complete",
  };
}

function meet(participantIds = ["character"]): MeetSession {
  return {
    id: "meet",
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    conversationId: conversation.id,
    participantIds,
    initiator: "user",
    scene: { opening: "见面" },
    suggestionsEnabled: true,
    status: "active",
    entries: [],
    startedAt: 1,
    lastActivityAt: 1,
  };
}

describe("chat presence", () => {
  it("defaults to remote and explains the online distance rule", () => {
    expect(
      inferChatPresenceContext({ conversation, messages: [] }),
    ).toEqual({ mode: "remote", evidence: "default" });
    expect(
      chatPresenceInstruction({ mode: "remote", evidence: "default" }),
    ).toContain("默认双方不在同一地点");
  });

  it("recognizes explicit arrival and departure from user or system facts", () => {
    expect(classifyPresenceStatement("我已经到你门口了")).toBe("arrival");
    expect(classifyPresenceStatement("我们现在就在一起")).toBe("arrival");
    expect(classifyPresenceStatement("我已经回家了")).toBe("departure");
    expect(
      inferChatPresenceContext({
        conversation,
        messages: [message("arrival", "我已经到你门口了", "user", 2)],
      }),
    ).toEqual({ mode: "co-present", evidence: "user-arrival" });
  });

  it("lets the newest departure override older arrival and an active meet", () => {
    expect(
      inferChatPresenceContext({
        conversation,
        messages: [
          message("arrival", "我已经到你门口了", "user", 2),
          message("departure", "我先回家了", "user", 3),
        ],
        meetSessions: [meet()],
      }),
    ).toEqual({ mode: "remote", evidence: "user-departure" });
  });

  it("uses an active meet only for a participating actor", () => {
    expect(
      inferChatPresenceContext({
        conversation,
        actorId: "character",
        messages: [],
        meetSessions: [meet()],
      }),
    ).toEqual({ mode: "co-present", evidence: "active-meet" });
    expect(
      inferChatPresenceContext({
        conversation,
        actorId: "other-character",
        messages: [],
        meetSessions: [meet()],
      }),
    ).toEqual({ mode: "remote", evidence: "default" });
  });

  it("never treats a character's own arrival claim as presence evidence", () => {
    expect(
      inferChatPresenceContext({
        conversation,
        messages: [message("bad", "我已经在你门口了", "character", 4)],
      }),
    ).toEqual({ mode: "remote", evidence: "default" });
  });

  it.each([
    "过来，手给我",
    "過嚟俾我攬住你",
    "Come here and let me hug you",
    "こっちに来て、抱きしめる",
    "이리 와, 안아 줄게",
    "Иди сюда, я тебя обниму",
  ])("detects remote physical-contact language: %s", (content) => {
    expect(detectRemotePresenceViolation([content])).toBeDefined();
  });

  it("allows clearly hypothetical or screen-mediated affection", () => {
    expect(detectRemotePresenceViolation(["下次见面再抱你"])).toBeUndefined();
    expect(detectRemotePresenceViolation(["把手放到镜头前给我看"])).toBeUndefined();
  });

  it("checks the translated text even when the original text is compliant", () => {
    const result = validateLocalCharacterReply({
      messages: ["Show me on camera."],
      translations: ["把手机拿过来"],
      characterName: "角色",
      presence: { mode: "remote", evidence: "default" },
    });
    expect(result.issues).toContain("remote-presence");
  });
});
