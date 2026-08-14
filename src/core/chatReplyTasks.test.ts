import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, setSetting } from "./db";
import { saveProviderPreset } from "./providerPresets";
import {
  claimNextChatReplyTask,
  enqueueChatReply,
  ensureRunnableChatReplyTask,
  processChatReplyTask,
  retryChatReply,
  stopChatReply,
} from "./chatReplyTasks";
import {
  SCHEMA_VERSION,
  type Character,
  type Conversation,
  type Message,
  type ProviderSettings,
} from "./types";

const t = 1_700_000_000_000;
const character = {
  id: "c1",
  schemaVersion: SCHEMA_VERSION,
  createdAt: t,
  updatedAt: t,
  name: "\u89d2\u8272",
  avatar: "",
  bio: "",
  personality: "\u72ec\u7acb",
  speakingStyle: "\u7b80\u77ed",
  background: "",
  language: "\u4e2d\u6587",
  coreSetting: "\u6838\u5fc3",
  persona: "\u4eba\u8bbe",
  proactive: {
    messages: false,
    timeAware: false,
    frequency: "low",
    quietStart: "23:00",
    quietEnd: "08:00",
    catchupLimit: 0,
    dailyLimit: 0,
  },
  relationship: {
    intimacy: 0,
    trust: 0,
    mood: "\u5e73\u9759",
    recentEvents: [],
  },
  lastActiveAt: t,
} as Character;
const privateConversation = {
  id: "p1",
  schemaVersion: SCHEMA_VERSION,
  createdAt: t,
  updatedAt: t,
  type: "private",
  title: "",
  memberIds: [character.id],
  lastActivityAt: t,
} as Conversation;
const groupConversation = {
  ...privateConversation,
  id: "g1",
  type: "group",
  title: "\u7fa4\u804a",
} as Conversation;
const provider: ProviderSettings = {
  baseUrl: "https://example.com/v1",
  apiKey: "test-key",
  model: "test-model",
  stream: false,
  temperature: 0.8,
  maxTokens: 800,
  contextLimit: 30,
  timeoutMs: 60_000,
};

describe("persistent chat reply tasks", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await setSetting("provider", provider);
    await db.characters.add(character);
  });
  it("atomically creates one placeholder and deduplicates an unfinished conversation task", async () => {
    await db.conversations.add(privateConversation);
    const first = await enqueueChatReply({
        conversationId: privateConversation.id,
        mode: "private",
      }),
      second = await enqueueChatReply({
        conversationId: privateConversation.id,
        mode: "private",
      });
    expect(second.id).toBe(first.id);
    const rows = await db.messages
      .where("conversationId")
      .equals(privateConversation.id)
      .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("generating");
    expect(rows[0].generation?.taskEventId).toBe(first.eventId);
  });
  it("requeues a permanently failed task when the user generates again", async () => {
    await db.conversations.add(privateConversation);
    const first = await enqueueChatReply({ conversationId: privateConversation.id, mode: "private" });
    const payload = first.payload as any;
    await db.backgroundTasks.update(first.id, {
      state: "failed",
      nextAttemptAt: Number.MAX_SAFE_INTEGER,
      lastError: "old failure",
    });
    await db.messages.update(payload.outputMessageId, { status: "error" });
    const result = await ensureRunnableChatReplyTask({ conversationId: privateConversation.id, mode: "private" });
    expect(result.action).toBe("requeued");
    expect(result.task).toMatchObject({ id: first.id, state: "pending" });
    expect(result.task.attempts).toBe(0);
    expect((result.task.payload as any).generationCycle).toBe(2);
    expect((result.task.payload as any).providerCallCount).toBe(0);
    expect(result.task.nextAttemptAt).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect((await db.messages.get(payload.outputMessageId))?.status).toBe("generating");
  });
  it("recovers an expired running task without creating a duplicate", async () => {
    await db.conversations.add(privateConversation);
    const first = await enqueueChatReply({ conversationId: privateConversation.id, mode: "private" });
    await db.backgroundTasks.update(first.id, { state: "running", leaseExpiresAt: 1 });
    const result = await ensureRunnableChatReplyTask({ conversationId: privateConversation.id, mode: "private" });
    expect(result.action).toBe("requeued");
    expect(result.task).toMatchObject({ id: first.id, state: "pending" });
    expect(await db.backgroundTasks.where("conversationId").equals(privateConversation.id).count()).toBe(1);
  });
  it("keeps a running task with a valid lease", async () => {
    await db.conversations.add(privateConversation);
    const first = await enqueueChatReply({ conversationId: privateConversation.id, mode: "private" });
    await db.backgroundTasks.update(first.id, { state: "running", leaseExpiresAt: Date.now() + 60_000 });
    const result = await ensureRunnableChatReplyTask({ conversationId: privateConversation.id, mode: "private" });
    expect(result.action).toBe("reused");
    expect(result.task).toMatchObject({ id: first.id, state: "running" });
  });
  it("replaces a task whose placeholder is missing", async () => {
    await db.conversations.add(privateConversation);
    const first = await enqueueChatReply({ conversationId: privateConversation.id, mode: "private" });
    await db.messages.delete((first.payload as any).outputMessageId);
    const result = await ensureRunnableChatReplyTask({ conversationId: privateConversation.id, mode: "private" });
    expect(result.action).toBe("recovered");
    expect(result.task.id).not.toBe(first.id);
    expect((await db.backgroundTasks.get(first.id))?.state).toBe("completed");
    expect(await db.messages.get(result.placeholder.id)).toBeTruthy();
  });
  it("replaces malformed and cancelled tasks", async () => {
    await db.conversations.add(privateConversation);
    const malformed = await enqueueChatReply({ conversationId: privateConversation.id, mode: "private" });
    await db.backgroundTasks.update(malformed.id, { payload: { cancelled: true } });
    const result = await ensureRunnableChatReplyTask({ conversationId: privateConversation.id, mode: "private" });
    expect(result.action).toBe("recovered");
    expect(result.task.id).not.toBe(malformed.id);
    expect((await db.backgroundTasks.get(malformed.id))?.state).toBe("completed");
  });
  it("stopping a new reply removes only its unfinished placeholder", async () => {
    await db.conversations.add(privateConversation);
    await enqueueChatReply({
      conversationId: privateConversation.id,
      mode: "private",
    });
    await stopChatReply(privateConversation.id);
    expect(
      await db.messages
        .where("conversationId")
        .equals(privateConversation.id)
        .count(),
    ).toBe(0);
    expect((await db.backgroundTasks.toArray())[0].state).toBe("completed");
  });
  it("stopping private regeneration restores the original message", async () => {
    await db.conversations.add(privateConversation);
    const original = {
      id: "m1",
      schemaVersion: SCHEMA_VERSION,
      createdAt: t + 1,
      updatedAt: t + 1,
      conversationId: privateConversation.id,
      senderType: "character",
      senderId: character.id,
      content: "original",
      status: "complete",
    } as Message;
    await db.messages.add(original);
    await enqueueChatReply({
      conversationId: privateConversation.id,
      mode: "private",
      targetMessageId: original.id,
    });
    expect((await db.messages.get(original.id))?.content).toBe("");
    await stopChatReply(privateConversation.id);
    expect(await db.messages.get(original.id)).toMatchObject({
      content: "original",
      status: "complete",
    });
  });
  it("stopping private regeneration restores every bubble in the original speaker turn", async () => {
    await db.conversations.add(privateConversation);
    const base = {
        schemaVersion: SCHEMA_VERSION,
        conversationId: privateConversation.id,
        senderType: "character",
        senderId: character.id,
        status: "complete",
        generation: {
          model: "m",
          temperature: 0.8,
          stream: false,
          roundId: "r",
          speakerTurnId: "private-turn",
        },
      } as const,
      rows = [
        {
          ...base,
          id: "pm1",
          createdAt: t + 1,
          updatedAt: t + 1,
          content: "one",
          generation: { ...base.generation, segmentIndex: 0 },
        },
        {
          ...base,
          id: "pm2",
          createdAt: t + 2,
          updatedAt: t + 2,
          content: "two",
          generation: { ...base.generation, segmentIndex: 1 },
        },
      ] as Message[];
    await db.messages.bulkAdd(rows);
    await enqueueChatReply({
      conversationId: privateConversation.id,
      mode: "private",
      targetMessageId: "pm2",
    });
    expect(
      await db.messages
        .where("conversationId")
        .equals(privateConversation.id)
        .count(),
    ).toBe(1);
    await stopChatReply(privateConversation.id);
    const restored = await db.messages
      .where("conversationId")
      .equals(privateConversation.id)
      .sortBy("createdAt");
    expect(restored.map((message) => message.content)).toEqual(["one", "two"]);
  });
  it("stopping group regeneration restores every segment in the original speaker turn", async () => {
    await db.conversations.add(groupConversation);
    const base = {
        schemaVersion: SCHEMA_VERSION,
        conversationId: groupConversation.id,
        senderType: "character",
        senderId: character.id,
        status: "complete",
        generation: {
          model: "m",
          temperature: 0.8,
          stream: false,
          roundId: "r",
          speakerTurnId: "turn",
        },
      } as const,
      rows = [
        {
          ...base,
          id: "gm1",
          createdAt: t + 1,
          updatedAt: t + 1,
          content: "one",
          generation: { ...base.generation, segmentIndex: 0 },
        },
        {
          ...base,
          id: "gm2",
          createdAt: t + 2,
          updatedAt: t + 2,
          content: "two",
          generation: { ...base.generation, segmentIndex: 1 },
        },
      ] as Message[];
    await db.messages.bulkAdd(rows);
    await enqueueChatReply({
      conversationId: groupConversation.id,
      mode: "group",
      targetMessageId: "gm2",
      speakerOrder: [character.id],
    });
    expect(
      await db.messages
        .where("conversationId")
        .equals(groupConversation.id)
        .count(),
    ).toBe(1);
    await stopChatReply(groupConversation.id);
    const restored = await db.messages
      .where("conversationId")
      .equals(groupConversation.id)
      .sortBy("createdAt");
    expect(restored.map((message) => message.content)).toEqual(["one", "two"]);
  });
  it("persists a missing API configuration with guidance", async () => {
    await setSetting("provider", { ...provider, apiKey: "" });
    await db.conversations.add(privateConversation);
    const queued = await enqueueChatReply({
        conversationId: privateConversation.id,
        mode: "private",
      }),
      claimed = await claimNextChatReplyTask();
    expect(claimed?.id).toBe(queued.id);
    await processChatReplyTask(claimed!);
    const message = (await db.messages
      .where("conversationId")
      .equals(privateConversation.id)
      .first())!;
    expect(message.status).toBe("error");
    expect(message.generation?.apiError).toMatchObject({
      source: "api",
      kind: "auth",
      providerCode: "config_missing",
    });
    expect(
      message.generation?.apiError?.troubleshooting.length,
    ).toBeGreaterThan(1);
  });
  it("persists provider codes and clears them when the user retries", async () => {
    await db.conversations.add(privateConversation);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "No access",
              code: "invalid_api_key",
              type: "authentication_error",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const queued = await enqueueChatReply({
        conversationId: privateConversation.id,
        mode: "private",
      }),
      claimed = await claimNextChatReplyTask();
    await processChatReplyTask(claimed!);
    let message = (await db.messages
      .where("conversationId")
      .equals(privateConversation.id)
      .first())!;
    expect(message.status).toBe("error");
    expect(message.generation?.apiError).toMatchObject({
      httpStatus: 401,
      providerCode: "invalid_api_key",
      providerType: "authentication_error",
    });
    const task = await db.backgroundTasks.get(queued.id);
    expect((task?.payload as any).lastApiError?.providerCode).toBe(
      "invalid_api_key",
    );
    await retryChatReply(queued.eventId);
    const retriedTask = await db.backgroundTasks.get(queued.id);
    expect(retriedTask?.attempts).toBe(0);
    expect((retriedTask?.payload as any).generationCycle).toBe(2);
    expect((retriedTask?.payload as any).providerCallCount).toBe(0);
    message = (await db.messages.get(message.id))!;
    expect(message.status).toBe("generating");
    expect(message.generation?.apiError).toBeUndefined();
  });

  it("uses the complete conversation preset for a persisted reply task", async () => {
    const saved = await saveProviderPreset({
        name: "conversation",
        provider: {
          ...provider,
          baseUrl: "https://conversation.test/v1",
          apiKey: "conversation-key",
          model: "conversation-model",
        },
        activate: false,
      }),
      conversation = {
        ...privateConversation,
        id: "preset-conversation",
        chatSettings: {
          bubbleStyle: "inherit",
          characterAvatarSize: 36,
          fontScale: 92,
          providerPresetId: saved.preset.id,
          autoTranslate: true,
        },
      } as Conversation;
    await db.conversations.add(conversation);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  messages: [{ content: "hello" }, { content: "again" }],
                  innerVoice: {
                    sections: {
                      physicalState: "呼吸平稳，手指微微放松。",
                      emotionAndMind: "我在谨慎判断这句话是否自然。",
                      unspokenWords: "希望你能听懂我的认真。",
                      selfDeception: "我告诉自己这只是普通寒暄。",
                      triggeredMemory: "此刻没有被触发的具体回忆",
                      angelThought: "慢一点表达，不要给对方压力。",
                      devilThought: "直接把所有情绪都说出来。",
                    },
                    continuity: { emotion: "谨慎" },
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const queued = await enqueueChatReply({
        conversationId: conversation.id,
        mode: "private",
      }),
      placeholder = await db.messages.get(queued.entityId);
    expect(placeholder?.generation?.model).toBe("conversation-model");
    const claimed = await claimNextChatReplyTask();
    await processChatReplyTask(claimed!);
    expect(((await db.backgroundTasks.get(queued.id))?.payload as any).providerCallCount).toBe(1);
    const completed = await db.messages.get(queued.entityId),
      completedRows = await db.messages
        .where("conversationId")
        .equals(conversation.id)
        .sortBy("createdAt");
    expect(completed).toMatchObject({
      content: "hello",
      status: "complete",
      generation: { model: "conversation-model", segmentIndex: 0 },
      innerVoice: {
        sections: { unspokenWords: "希望你能听懂我的认真。" },
      },
    });
    expect(completedRows.map((message) => message.content)).toEqual([
      "hello",
      "again",
    ]);
    expect(
      new Set(completedRows.map((message) => message.generation?.speakerTurnId))
        .size,
    ).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("conversation.test");
  });
});

describe("mounted reply stickers", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
    await setSetting("provider", provider);
    await db.characters.add(character);
    await db.stickerPacks.add({
      id: "pack",
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      name: "角色可用",
      order: 0,
      stickers: [
        {
          id: "sticker-real",
          source: "url",
          url: "https://example.com/sticker.png",
          name: "无语",
          description: "无语地看着你",
          order: 0,
        },
      ],
    });
  });

  const modelTurn = (stickerId: string) =>
    JSON.stringify({
      messages: [{ content: "好吧" }],
      stickerId,
      innerVoice: {
        sections: {
          physicalState: "呼吸平稳。",
          emotionAndMind: "有一点无奈。",
          unspokenWords: "你应该懂。",
          selfDeception: "我没有在意。",
          triggeredMemory: "没有具体回忆。",
          angelThought: "温和一点。",
          devilThought: "瞪他一眼。",
        },
        continuity: { emotion: "无奈" },
      },
    });

  async function runStickerReply(stickerId: string) {
    const conversation: Conversation = {
      ...privateConversation,
      id: `sticker-${stickerId}`,
      chatSettings: {
        bubbleStyle: "inherit",
        characterAvatarSize: 36,
        fontScale: 92,
        permissions: {
          proactiveChatImage: false,
          proactiveVoiceCall: false,
          proactiveVideoCall: false,
          proactiveMeetInvitation: false,
          proactiveSticker: true,
        },
        proactiveStickerPackIds: ["pack"],
      },
    };
    await db.conversations.add(conversation);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: modelTurn(stickerId) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await enqueueChatReply({ conversationId: conversation.id, mode: "private" });
    const claimed = await claimNextChatReplyTask();
    await processChatReplyTask(claimed!);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return db.messages
      .where("conversationId")
      .equals(conversation.id)
      .sortBy("createdAt");
  }

  it("saves a validated mounted sticker after the text bubbles", async () => {
    const rows = await runStickerReply("sticker-real");
    expect(rows.map((row) => row.content)).toEqual(["好吧", "[表情包]"]);
    expect(rows[1]).toMatchObject({
      kind: "sticker",
      attachments: [
        {
          type: "sticker",
          stickerId: "sticker-real",
          description: "无语地看着你",
        },
      ],
    });
  });

  it("ignores an unmounted sticker id instead of falling back to the first sticker", async () => {
    const rows = await runStickerReply("not-mounted");
    expect(rows.map((row) => row.content)).toEqual(["好吧"]);
    expect(rows.some((row) => row.kind === "sticker")).toBe(false);
  });
});

