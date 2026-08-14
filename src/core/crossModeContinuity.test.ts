import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  buildMeetCrossModeContinuity,
  buildOnlineCrossModeContinuity,
  meetModeOf,
  pauseActiveMeetForOnlineActivity,
  pauseMeetSessionForOnlineActivity,
  resumeMeetSessionForOfflineActivity,
  trimContinuityEvents,
} from "./crossModeContinuity";
import { inferChatPresenceContext } from "./chatPresence";
import type { Conversation, CrossModeContinuityEvent, MeetSession, Message } from "./types";

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

function session(overrides: Partial<MeetSession> = {}): MeetSession {
  return {
    id: "meet",
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    conversationId: conversation.id,
    participantIds: ["character"],
    initiator: "user",
    scene: { opening: "在咖啡店见面", location: "咖啡店" },
    suggestionsEnabled: false,
    status: "active",
    entries: [
      {
        id: "user-entry",
        roundId: "round",
        senderType: "user",
        content: "我把票放在桌上",
        createdAt: 10,
      },
      {
        id: "character-entry",
        roundId: "round",
        senderType: "character",
        senderId: "character",
        prose: "她看了一眼桌上的票。",
        thought: "这件事不能让别人知道。",
        dialogue: "这张票先别丢。",
        createdAt: 11,
      },
    ],
    startedAt: 1,
    lastActivityAt: 11,
    ...overrides,
  };
}

function onlineMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message",
    schemaVersion: 1,
    createdAt: 21,
    updatedAt: 21,
    conversationId: conversation.id,
    senderType: "user",
    content: "票我会收好，周末再确认时间。",
    status: "complete",
    ...overrides,
  };
}

describe("cross-mode continuity bridge", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("treats legacy sessions as meet mode and keeps the first online window start", () => {
    const legacy = session();
    expect(meetModeOf(legacy)).toBe("meet");
    const paused = pauseMeetSessionForOnlineActivity(legacy, 20);
    const pausedAgain = pauseMeetSessionForOnlineActivity(paused, 25);
    expect(pausedAgain.modeBridge).toEqual({
      currentMode: "online-paused",
      switchedAt: 20,
      latestOnlineWindow: { startedAt: 20 },
    });
    const resumed = resumeMeetSessionForOfflineActivity(pausedAgain, 30);
    expect(resumed.modeBridge).toEqual({
      currentMode: "meet",
      switchedAt: 30,
      latestOnlineWindow: { startedAt: 20, endedAt: 30 },
    });
  });

  it("persists online pause without creating a visible message", async () => {
    await db.conversations.add(conversation);
    await db.meetSessions.add(session());
    await db.transaction("rw", [db.meetSessions, db.messages], async () => {
      await pauseActiveMeetForOnlineActivity(conversation.id, 20);
      await db.messages.add(onlineMessage({ createdAt: 20, updatedAt: 20 }));
    });
    const saved = await db.meetSessions.get("meet");
    expect(saved?.modeBridge?.currentMode).toBe("online-paused");
    expect(saved?.modeBridge?.latestOnlineWindow?.startedAt).toBe(20);
    expect(await db.messages.count()).toBe(1);
  });

  it("forces paused active meets to remote presence", () => {
    const paused = pauseMeetSessionForOnlineActivity(session(), 20);
    expect(
      inferChatPresenceContext({
        conversation,
        actorId: "character",
        messages: [onlineMessage({ content: "我们现在就在一起" })],
        meetSessions: [paused],
      }),
    ).toEqual({ mode: "remote", evidence: "default" });
  });

  it("injects public meet events and excludes character thought", () => {
    const text = buildOnlineCrossModeContinuity({
      conversation,
      actorId: "character",
      meetSessions: [pauseMeetSessionForOnlineActivity(session(), 20)],
      names: { character: "阿茶" },
    });
    expect(text).toContain("我把票放在桌上");
    expect(text).toContain("这张票先别丢");
    expect(text).not.toContain("不能让别人知道");
    expect(text).toContain("远程聊天处理");
  });

  it("injects only the latest online window when returning to meet", () => {
    const resumed = resumeMeetSessionForOfflineActivity(
      pauseMeetSessionForOnlineActivity(session(), 20),
      30,
    );
    const text = buildMeetCrossModeContinuity({
      session: resumed,
      conversation,
      actorId: "character",
      messages: [
        onlineMessage({ id: "old", createdAt: 19, content: "旧消息" }),
        onlineMessage(),
        onlineMessage({
          id: "other",
          senderType: "character",
          senderId: "other",
          createdAt: 22,
          content: "其他私聊角色的内容",
        }),
        onlineMessage({ id: "late", createdAt: 31, content: "窗口之后" }),
      ],
      names: { character: "阿茶", other: "其他角色" },
    });
    expect(text).toContain("周末再确认时间");
    expect(text).not.toContain("旧消息");
    expect(text).not.toContain("窗口之后");
    expect(text).not.toContain("其他私聊角色");
    expect(text).toContain("不要自行补写分别、回家、重新到场");
  });

  it("keeps boundary and latest events within the shared budget", () => {
    const events: CrossModeContinuityEvent[] = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      mode: "online",
      createdAt: index,
      senderType: "user",
      text: `事件${index}`,
    }));
    const trimmed = trimContinuityEvents(events, 6, 200);
    expect(trimmed.map((event) => event.id)).toEqual(["0", "1", "26", "27", "28", "29"]);
  });
});
