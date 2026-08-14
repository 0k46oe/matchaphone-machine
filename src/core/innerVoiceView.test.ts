import { describe, expect, it } from "vitest";
import { forumHandleOf } from "./forum";
import {
  innerVoiceTurnMessages,
  resolveInnerVoiceForumHandle,
  selectInnerVoiceMessages,
} from "./innerVoiceView";
import type { ForumServer, Message } from "./types";

const message = (overrides: Partial<Message>): Message =>
  ({
    id: "m",
    conversationId: "cv",
    senderType: "character",
    senderId: "c",
    kind: "text",
    content: "reply",
    status: "complete",
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 1,
    ...overrides,
  }) as Message;

const server = (overrides: Partial<ForumServer>): ForumServer =>
  ({
    id: "server",
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    name: "community",
    description: "",
    iconText: "F",
    color: "#000",
    order: 0,
    ...overrides,
  }) as ForumServer;

describe("inner voice view helpers", () => {
  it("selects only the requested actor and sorts newest first", () => {
    const rows = [
      message({
        id: "old",
        innerVoice: {
          id: "v-old",
          actorType: "character",
          actorId: "c",
          speakerTurnId: "turn-old",
          content: "old",
          continuity: { emotion: "calm" },
          sourceHash: "x",
          createdAt: 10,
        },
      }),
      message({
        id: "new",
        innerVoice: {
          id: "v-new",
          actorType: "character",
          actorId: "c",
          speakerTurnId: "turn-new",
          content: "new",
          continuity: { emotion: "happy" },
          sourceHash: "y",
          createdAt: 20,
        },
      }),
      message({
        id: "other",
        innerVoice: {
          id: "v-other",
          actorType: "npc",
          actorId: "npc",
          speakerTurnId: "turn-other",
          content: "other",
          continuity: { emotion: "quiet" },
          sourceHash: "z",
          createdAt: 30,
        },
      }),
    ];
    expect(selectInnerVoiceMessages(rows, "cv", "character", "c").map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("finds all bubbles in the source turn in chronological order", () => {
    const rows = [
      message({ id: "second", createdAt: 2, generation: { model: "m", temperature: 1, speakerTurnId: "turn" } }),
      message({ id: "first", createdAt: 1, generation: { model: "m", temperature: 1, speakerTurnId: "turn" }, innerVoice: { id: "v", actorType: "character", actorId: "c", speakerTurnId: "turn", content: "thought", continuity: { emotion: "calm" }, sourceHash: "x", createdAt: 1 } }),
    ];
    expect(innerVoiceTurnMessages(rows, rows[1]).map((row) => row.id)).toEqual(["first", "second"]);
  });

  it("prefers the newest customized forum handle", () => {
    const servers = [
      server({ id: "a", memberProfiles: { "character:c": { actorType: "character", actorId: "c", displayName: "C", handle: "old", bio: "", persona: "", joinedAt: 1, updatedAt: 2 } } }),
      server({ id: "b", memberProfiles: { "character:c": { actorType: "character", actorId: "c", displayName: "C", handle: "@new", bio: "", persona: "", joinedAt: 1, updatedAt: 3 } } }),
    ];
    expect(resolveInnerVoiceForumHandle({ actorType: "character", actorId: "c", actorName: "角色", servers })).toBe("@new");
  });

  it("uses stable character fallback and hides unrelated NPC handles", () => {
    expect(resolveInnerVoiceForumHandle({ actorType: "character", actorId: "c", actorName: "角色", servers: [] })).toBe(forumHandleOf("角色", "c"));
    expect(resolveInnerVoiceForumHandle({ actorType: "npc", actorId: "npc", actorName: "路人", servers: [] })).toBeUndefined();
    expect(resolveInnerVoiceForumHandle({ actorType: "npc", actorId: "npc", actorName: "路人", servers: [server({ npcs: [{ id: "npc", name: "路人", handle: "street", avatar: undefined, persona: "", enabled: true, createdAt: 1, updatedAt: 2 }] })] })).toBe("@street");
  });
});
