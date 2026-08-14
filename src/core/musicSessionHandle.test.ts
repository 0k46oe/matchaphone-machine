import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMusicLoginQr, getMusicSessionHandle, logoutMusicAccount, pollMusicLoginQr } from "./music";

describe("music browser session fallback", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("stores only the opaque QR session handle and sends it as a bearer token", async () => {
    const handle = "a".repeat(32);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: "qr", qrUrl: "https://music.163.com/login", expiresAt: Date.now() + 1000, sessionHandle: handle }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "waiting" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await createMusicLoginQr();
    expect(getMusicSessionHandle()).toBe(handle);
    expect(JSON.stringify(localStorage)).not.toContain("accessToken");
    await pollMusicLoginQr("qr");
    const pollHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(pollHeaders.get("Authorization")).toBe(`Bearer ${handle}`);
    await logoutMusicAccount();
    expect(getMusicSessionHandle()).toBeUndefined();
  });
});
