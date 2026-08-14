import { describe, expect, it } from "vitest";
import {
  conversationInnerVoiceEnabled,
  createMessageInnerVoice,
  innerVoiceContinuityContext,
  innerVoiceSourceChanged,
  parseGeneratedInnerVoice,
} from "./innerVoice";
import type {
  Conversation,
  Message,
  MessageInnerVoiceSections,
  ProviderSettings,
} from "./types";

const provider = { model: "m", temperature: 0.7 } as ProviderSettings;
const conversation = {
  id: "cv",
  type: "private",
  chatSettings: {},
  memberIds: [],
  presetIds: [],
  loreBookIds: [],
} as unknown as Conversation;
const sections: MessageInnerVoiceSections = {
  physicalState: "呼吸稍微放缓，肩膀仍有些紧。",
  emotionAndMind: "我有一点犹豫，也在判断对方是否认真。",
  unspokenWords: "其实我还想再问一句，你会不会留下。",
  selfDeception: "我告诉自己这只是随口一问，并不是真的在意。",
  triggeredMemory: "此刻没有被触发的具体回忆",
  angelThought: "先尊重对方的节奏，不要逼得太紧。",
  devilThought: "干脆直接追问答案，免得继续猜。",
};

describe("chat inner voice", () => {
  it("requires all seven Simplified Chinese sections and continuity", () => {
    const raw = JSON.stringify({
      innerVoice: {
        sections,
        continuity: {
          emotion: "紧张",
          pendingIntent: "保持冷静",
          physicalState: "肩膀紧绷",
        },
      },
    });
    expect(parseGeneratedInnerVoice(raw, true, true)).toMatchObject({
      sections,
      continuity: { emotion: "紧张", physicalState: "肩膀紧绷" },
    });
    expect(parseGeneratedInnerVoice(raw, true, true)?.content).toContain(
      "【身体此刻】",
    );
    expect(() =>
      parseGeneratedInnerVoice(
        JSON.stringify({
          innerVoice: {
            sections: { ...sections, devilThought: "" },
            continuity: { emotion: "平静" },
          },
        }),
        false,
        true,
      ),
    ).toThrow("恶魔的想法");
    expect(() =>
      parseGeneratedInnerVoice(
        JSON.stringify({
          innerVoice: {
            sections: { ...sections, angelThought: "stay calm" },
            continuity: { emotion: "平静" },
          },
        }),
        false,
        true,
      ),
    ).toThrow("简体中文");
  });

  it("forces private conversations and defaults groups on", () => {
    expect(conversationInnerVoiceEnabled(conversation)).toBe(true);
    expect(conversationInnerVoiceEnabled({ ...conversation, type: "group" })).toBe(
      true,
    );
    expect(
      conversationInnerVoiceEnabled({
        ...conversation,
        type: "group",
        chatSettings: { groupInnerVoiceEnabled: false },
      } as Conversation),
    ).toBe(false);
  });

  it("stores only compressed continuity in the next-turn context", () => {
    const voice = createMessageInnerVoice({
      draft: {
        content: "不会进入下一轮的完整心声",
        sections,
        continuity: {
          emotion: "犹豫",
          concern: "担心被误解",
          physicalState: "肩膀仍然紧绷",
        },
      },
      actorType: "character",
      actorId: "c",
      speakerTurnId: "turn",
      contents: ["original reply"],
      provider,
      createdAt: 1,
    });
    const message = {
      id: "m",
      conversationId: "cv",
      senderType: "character",
      senderId: "c",
      content: "original reply",
      status: "complete",
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: 1,
      innerVoice: voice,
      generation: {
        model: "m",
        temperature: 0.7,
        speakerTurnId: "turn",
      },
    } as Message;
    const context = innerVoiceContinuityContext([message], "c");
    expect(context).toContain("犹豫");
    expect(context).toContain("肩膀仍然紧绷");
    expect(context).not.toContain("没说出口的话");
    expect(context).not.toContain("不会进入下一轮的完整心声");
    expect(innerVoiceSourceChanged(voice, [message])).toBe(false);
    expect(
      innerVoiceSourceChanged(voice, [{ ...message, content: "edited reply" }]),
    ).toBe(true);
  });
});