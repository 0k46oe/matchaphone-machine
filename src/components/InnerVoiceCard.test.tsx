import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  displayInnerVoiceSections,
  InnerVoiceCard,
  InnerVoiceDialog,
} from "./InnerVoiceCard";
import { db } from "../core/db";
import type { Message, MessageInnerVoiceSections } from "../core/types";

const sections: MessageInnerVoiceSections = {
  physicalState: "呼吸平稳，肩膀还有一点紧。",
  emotionAndMind: "我在认真判断对方的语气。",
  unspokenWords: "其实我想问，你愿不愿意再留一会儿。",
  selfDeception: "我假装这只是一句随口的挽留。",
  triggeredMemory: "此刻没有被触发的具体回忆",
  angelThought: "尊重对方的决定，不要给压力。",
  devilThought: "直接把人留下，不再绕弯子。",
};

const row: Message = {
  id: "message",
  conversationId: "conversation",
  senderType: "character",
  senderId: "character",
  kind: "text",
  content: "spoken reply",
  status: "complete",
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 1,
  generation: {
    model: "model",
    temperature: 0.7,
    speakerTurnId: "turn",
  },
  innerVoice: {
    id: "voice",
    actorType: "character",
    actorId: "character",
    speakerTurnId: "turn",
    content: "兼容纯文本",
    sections,
    continuity: { emotion: "平静" },
    sourceHash: "source",
    createdAt: 1,
  },
};

const older: Message = {
  ...row,
  id: "older",
  createdAt: 0,
  updatedAt: 0,
  generation: { ...row.generation!, speakerTurnId: "older-turn" },
  innerVoice: {
    ...row.innerVoice!,
    id: "older-voice",
    speakerTurnId: "older-turn",
    createdAt: 0,
    sections: undefined,
    content: "旧外语心声",
    translation: {
      targetLanguage: "zh-CN",
      text: "旧心声中文译文",
      sourceHash: "hash",
      source: "same-generation",
      status: "complete",
      updatedAt: 1,
    },
  },
};

describe("notebook inner voice cards", () => {
  beforeEach(async () => {
    cleanup();
    await db.messages.clear();
    await db.forumServers.clear();
  });

  it("renders seven titled sections and toggles persistent favorite state", async () => {
    await db.messages.put(row);
    const changed = vi.fn(),
      source = vi.fn(),
      all = vi.fn();
    const { rerender } = render(
      <InnerVoiceCard
        message={row}
        conversationMessages={[row]}
        actorName="角色"
        actorHandle="@role"
        onChanged={changed}
        onSource={source}
        onAll={all}
      />,
    );
    expect(screen.getByText("身体此刻")).toBeInTheDocument();
    expect(screen.getByText("嘴硬与自我欺骗")).toBeInTheDocument();
    expect(screen.getByText(sections.devilThought)).toBeInTheDocument();
    expect(screen.getByText("@role")).toBeInTheDocument();
    expect(screen.getByText("私密")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "喜欢" }));
    await waitFor(async () =>
      expect((await db.messages.get(row.id))?.innerVoice?.favoritedAt).toEqual(
        expect.any(Number),
      ),
    );
    expect(changed).toHaveBeenCalled();
    const favorited = (await db.messages.get(row.id))!;
    rerender(
      <InnerVoiceCard
        message={favorited}
        conversationMessages={[favorited]}
        actorName="角色"
        onChanged={changed}
        onSource={source}
        onAll={all}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "已喜欢" }));
    await waitFor(async () =>
      expect(
        (await db.messages.get(row.id))?.innerVoice?.favoritedAt,
      ).toBeUndefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: "来源" }));
    expect(source).toHaveBeenCalledWith(row.id);
    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(all).toHaveBeenCalled();
  });

  it("uses the old Chinese translation as one legacy section", () => {
    expect(displayInnerVoiceSections(older.innerVoice!)).toEqual([
      {
        key: "legacy",
        title: "旧日心声",
        tab: "旧日",
        content: "旧心声中文译文",
      },
    ]);
  });

  it("opens the clicked turn, switches one page at a time, and closes", () => {
    const close = vi.fn();
    render(
      <InnerVoiceDialog
        actorType="character"
        actorId="character"
        actorName="角色"
        conversationId="conversation"
        conversationMessages={[older, row]}
        enabled
        initialMessageId="older"
        onClose={close}
        onChanged={() => undefined}
        onSource={() => undefined}
        onAll={() => undefined}
      />,
    );
    expect(screen.getByRole("dialog", { name: "角色的心声" })).toBeInTheDocument();
    expect(screen.getByText("旧日心声")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页心声" }));
    expect(screen.getByText("身体此刻")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the empty state in a centered dialog", () => {
    const close = vi.fn();
    render(
      <InnerVoiceDialog
        actorType="npc"
        actorId="npc"
        actorName="路人"
        conversationId="conversation"
        conversationMessages={[]}
        enabled={false}
        onClose={close}
        onChanged={() => undefined}
        onSource={() => undefined}
        onAll={() => undefined}
      />,
    );
    expect(screen.getByText("还没有心声")).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector(".inner-voice-dialog-shade")!);
    expect(close).toHaveBeenCalledTimes(1);
  });
});