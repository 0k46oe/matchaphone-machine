import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureFileName,
  shareOrDownloadCapture,
  waitForCaptureImages,
} from "./chatCapture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("chat capture helpers", () => {
  it("builds a safe timestamped PNG filename", () => {
    expect(
      captureFileName('  阿/茶:*?"<>|  ', new Date("2026-08-07T08:09:10.000Z")),
    ).toBe("阿-茶-聊天截图-2026-08-07T08-09-10-000Z.png");
  });

  it("marks broken and timed-out images without rejecting the capture", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<span class="capture-image-shell"><img></span><span class="capture-image-shell"><img></span>';
    const [broken] = [...root.querySelectorAll("img")];
    const waiting = waitForCaptureImages(root, 5);
    broken.dispatchEvent(new Event("error"));
    await waiting;
    expect(root.querySelectorAll(".capture-image-unavailable")).toHaveLength(2);
  });

  it("uses the system file share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    await expect(
      shareOrDownloadCapture(new Blob(["png"], { type: "image/png" }), "chat.png", "聊天截图"),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(share.mock.calls[0][0].files[0]).toBeInstanceOf(File);
  });

  it("falls back to download and releases the object URL", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:capture"),
      revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined),
      click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await expect(
      shareOrDownloadCapture(new Blob(["png"]), "chat.png", "聊天截图"),
    ).resolves.toBe("downloaded");
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:capture");
  });
});
