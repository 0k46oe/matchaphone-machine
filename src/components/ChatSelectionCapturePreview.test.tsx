import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSelectionCapturePreview } from "./ChatSelectionCapturePreview";
import type { Message } from "../core/types";

const captureElementAsPng = vi.fn(),
  shareOrDownloadCapture = vi.fn();
vi.mock("../core/chatCapture", () => ({
  captureElementAsPng: (...args: unknown[]) => captureElementAsPng(...args),
  captureFileName: () => "会话-聊天截图.png",
  shareOrDownloadCapture: (...args: unknown[]) => shareOrDownloadCapture(...args),
}));

const baseMessage: Message = {
  id: "selected-message",
  schemaVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  conversationId: "conversation",
  senderType: "character",
  senderId: "character",
  content: "Selected original",
  status: "complete",
  quote: {
    messageId: "quoted",
    senderType: "user",
    senderName: "我",
    kind: "text",
    preview: "Quoted copy",
  },
  translation: {
    targetLanguage: "zh-CN",
    text: "选中消息译文",
    sourceHash: "hash",
    status: "complete",
    updatedAt: 1,
  },
  reactions: [{ kind: "like", reactorType: "user", createdAt: 1 }],
};

const props = {
  title: "会话",
  messages: [baseMessage],
  actors: new Map([["character", { id: "character", name: "角色", avatar: "" }]]),
  assets: new Map(),
  userName: "我",
  showCharacterAvatar: true,
  showUserAvatar: true,
  autoTranslate: true,
  bubbleStyle: "kawaii",
  avatarShape: "circle",
  characterAvatarSize: 36,
  fontScale: 100,
  width: 320,
  onClose: vi.fn(),
  onReturn: vi.fn(),
  onResult: vi.fn(),
};

describe("chat selection capture preview", () => {
  beforeEach(() => {
    cleanup();
    captureElementAsPng.mockReset().mockResolvedValue(new Blob(["png"]));
    shareOrDownloadCapture.mockReset().mockResolvedValue("downloaded");
    props.onClose.mockReset();
    props.onReturn.mockReset();
    props.onResult.mockReset();
  });
  afterEach(cleanup);

  it("renders only the supplied static messages with translation, quote and reaction", () => {
    render(<ChatSelectionCapturePreview {...props} />);
    expect(screen.getByText("Selected original")).toBeInTheDocument();
    expect(screen.getByText("选中消息译文")).toBeInTheDocument();
    expect(screen.getByText("Quoted copy")).toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(document.querySelector("input[type=checkbox]")).not.toBeInTheDocument();
    expect(document.querySelector("audio")).not.toBeInTheDocument();
    expect(document.querySelector(".select-to-here")).not.toBeInTheDocument();
  });

  it("renders voice as a static transcript rather than an audio control", () => {
    const voice: Message = {
      ...baseMessage,
      id: "voice",
      content: "voice",
      translation: undefined,
      attachments: [
        { type: "voice", assetId: "voice-asset", durationMs: 4200, transcript: "语音文字稿" },
      ],
    };
    render(<ChatSelectionCapturePreview {...props} messages={[voice]} />);
    expect(screen.getByText("语音文字稿")).toBeInTheDocument();
    expect(screen.getByText("语音 · 4 秒")).toBeInTheDocument();
    expect(document.querySelector("audio")).not.toBeInTheDocument();
  });

  it("closes or returns without clearing selection in the component", () => {
    render(<ChatSelectionCapturePreview {...props} />);
    fireEvent.click(screen.getAllByText("返回修改")[0]);
    expect(props.onReturn).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("exports only the document node and reports save completion", async () => {
    render(<ChatSelectionCapturePreview {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /保存.*分享/ }));
    await waitFor(() => expect(captureElementAsPng).toHaveBeenCalledOnce());
    const element = captureElementAsPng.mock.calls[0][0] as HTMLElement;
    expect(element.classList.contains("chat-capture-document")).toBe(true);
    expect(element.closest(".chat-capture-preview")?.querySelector("footer")).not.toBe(
      element,
    );
    expect(shareOrDownloadCapture).toHaveBeenCalledOnce();
    expect(props.onResult).toHaveBeenCalledWith("聊天截图已保存");
  });
});

describe("sticker capture privacy", () => {
  it("uses an explicit sticker-only row without rendering the meaning", () => {
    const sticker: Message = {
      ...baseMessage,
      id: "sticker",
      content: "[表情包]",
      kind: "sticker",
      quote: undefined,
      translation: undefined,
      reactions: undefined,
      attachments: [
        {
          type: "sticker",
          stickerId: "s",
          name: "无语",
          description: "无语地看着你",
          url: "https://example.com/sticker.png",
        },
      ],
    };
    render(<ChatSelectionCapturePreview {...props} messages={[sticker]} />);
    expect(document.querySelector(".message-row.sticker-only")).toBeTruthy();
    expect(document.querySelector(".bubble.sticker-bubble")).toBeTruthy();
    expect(screen.queryByText("无语地看着你")).not.toBeInTheDocument();
  });
});
