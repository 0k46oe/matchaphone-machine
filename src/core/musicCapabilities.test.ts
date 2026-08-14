import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMusicCapabilities, MusicApiError } from "./music";

afterEach(() => vi.unstubAllGlobals());

describe("music capability client", () => {
  it("loads the current cookie-scoped official CLI capabilities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      search: true,
      playlists: true,
      lyrics: false,
      stream: false,
      reasons: { lyrics: "官方 CLI 登录会话未注册“歌词”命令" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMusicCapabilities(true)).resolves.toMatchObject({ authenticated: true, search: true, lyrics: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/music/capabilities?refresh=1", expect.objectContaining({ credentials: "include" }));
  });

  it("preserves the specific unavailable capability details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "capability_unavailable",
      message: "当前个人开发者权限未开放“歌曲搜索”功能",
      details: { capability: "search", reason: "official_cli_command_missing" },
    }), { status: 501, headers: { "Content-Type": "application/json" } })));

    try {
      await fetchMusicCapabilities();
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MusicApiError);
      expect(error).toMatchObject({ code: "capability_unavailable", status: 501, details: { capability: "search" } });
    }
  });
});
