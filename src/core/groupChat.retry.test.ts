import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCharacterReplyTurn } from "./groupChat";
import { OpenAIProvider, ProviderError } from "./provider";
import { defaultProvider, type Character } from "./types";

const character = {
  id: "character-1",
  name: "角色",
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 1,
  settings: "",
  chatSettings: {
    language: "zh-CN",
    contextLimit: 20,
    stream: false,
    replyMessageRangeMode: "adaptive",
  },
} as unknown as Character;

const voice = {
  sections: {
    physicalState: "呼吸平稳",
    emotionAndMind: "我在认真思考",
    unspokenWords: "还有话没有说出口",
    selfDeception: "我假装自己并不紧张",
    triggeredMemory: "此刻没有被触发的具体回忆",
    angelThought: "先尊重对方的感受",
    devilThought: "想更直接地表达自己",
  },
  continuity: { emotion: "专注" },
};

function result(text: string) {
  return {
    text,
    truncated: false,
    responseShape: "direct-role-json",
    rawLength: text.length,
    parseStatus: "strict-json" as const,
    strictParseSucceeded: true,
    repairAttempted: false,
    repairedParseSucceeded: false,
    outerContainerClosed: true,
    unterminatedString: false,
    hasMessages: true,
    hasInnerVoice: true,
  };
}

describe("generateCharacterReplyTurn strict retry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries once for an incomplete role protocol and then succeeds", async () => {
    const chat = vi.spyOn(OpenAIProvider.prototype, "chatWithMeta")
      .mockResolvedValueOnce(result(JSON.stringify({ messages: [{ content: "只有正文" }] })))
      .mockResolvedValueOnce(result(JSON.stringify({ messages: [{ content: "完整回复" }], innerVoice: voice })));
    const turn = await generateCharacterReplyTurn(
      { ...defaultProvider, apiKey: "test", stream: false },
      [{ role: "user", content: "你好" }],
      character,
      false,
      "private",
      true,
    );
    expect(chat).toHaveBeenCalledTimes(2);
    expect(turn.parts[0].content).toBe("完整回复");
    expect(turn.innerVoice?.continuity.emotion).toBe("专注");
  });

  it("makes exactly two calls and preserves missing_inner_voice diagnostics", async () => {
    const incomplete = result(JSON.stringify({ messages: [{ content: "只有正文" }] }));
    const chat = vi.spyOn(OpenAIProvider.prototype, "chatWithMeta")
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(incomplete);
    const error = await generateCharacterReplyTurn(
      { ...defaultProvider, apiKey: "test", stream: false },
      [{ role: "user", content: "你好" }],
      character,
      false,
      "private",
      true,
    ).catch((value) => value) as ProviderError;
    expect(chat).toHaveBeenCalledTimes(2);
    expect(error.apiError).toMatchObject({ providerCode: "missing_inner_voice", failureStage: "inner-voice" });
  });

  it("accepts a complete repaired role protocol even when the relay reports finish_reason length", async () => {
    const malformed = `{messages:[{content:"完整回复",}],innerVoice:{sections:{physicalState:"呼吸平稳",emotionAndMind:"我在认真思考",unspokenWords:"还有话没有说出口",selfDeception:"我假装自己并不紧张",triggeredMemory:"此刻没有被触发的具体回忆",angelThought:"先尊重对方的感受",devilThought:"想更直接地表达自己"},continuity:{emotion:"专注"}},}`;
    const response = {
      ...result(malformed),
      truncated: true,
      finishReason: "length",
      responseShape: "choices",
      rawLength: 3011,
      parseStatus: "repaired-json" as const,
      strictParseSucceeded: false,
      repairAttempted: true,
      repairedParseSucceeded: true,
      outerContainerClosed: false,
      unterminatedString: false,
    };
    const chat = vi.spyOn(OpenAIProvider.prototype, "chatWithMeta").mockResolvedValueOnce(response);
    const turn = await generateCharacterReplyTurn(
      { ...defaultProvider, apiKey: "test", stream: false },
      [{ role: "user", content: "你好" }],
      character,
      false,
      "private",
      true,
    );
    expect(chat).toHaveBeenCalledTimes(1);
    expect(turn.parts[0].content).toBe("完整回复");
    expect(turn.innerVoice?.continuity.emotion).toBe("专注");
  });;
});
