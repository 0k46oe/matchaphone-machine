import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  addTracksToLocalPlaylist,
  clearMusicTrackLyrics,
  createLocalMusicPlaylist,
  deleteLocalMusicPlaylist,
  deleteMusicTrack,
  importDirectMusicUrl,
  importMusicLink,
  isMusicTrackSaved,
  recordMusicTrackPlayed,
  removeTrackFromLocalPlaylist,
  renameLocalMusicPlaylist,
  setMusicTrackFavorite,
  setMusicTrackLyrics,
  updateLocalMusicPlaylistTracks,
  updateMusicTrackMetadata,
} from "./music";
import { createBackup, restoreBackup } from "./backup";
import type { ListeningSession, MusicFile, MusicTrack } from "./types";

const makeTrack = (id: string, patch: Partial<MusicTrack> = {}): MusicTrack => ({
  id,
  schemaVersion: 1,
  createdAt: 1000,
  updatedAt: 1000,
  importedAt: 1000,
  source: "direct-url",
  title: `歌曲 ${id}`,
  artists: ["茶茶"],
  directUrl: `https://example.com/${id}.mp3`,
  ...patch,
});

describe("local-first music library", () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  afterEach(() => vi.unstubAllGlobals());

  it("treats legacy tracks as saved and excludes explicit temporary tracks", () => {
    expect(isMusicTrackSaved(makeTrack("legacy"))).toBe(true);
    expect(isMusicTrackSaved(makeTrack("temporary", { libraryStatus: "temporary" }))).toBe(false);
  });

  it("deduplicates direct links and saves them to the library", async () => {
    const first = await importDirectMusicUrl("https://example.com/song.mp3", "第一首");
    const second = await importDirectMusicUrl("https://example.com/song.mp3", "重复名称");
    expect(second.id).toBe(first.id);
    expect(second.libraryStatus).toBe("saved");
    expect(await db.musicTracks.count()).toBe(1);
  });

  it("stores favorites and throttled play-history fields without a schema migration", async () => {
    await db.musicTracks.add(makeTrack("played", { libraryStatus: "temporary" }));
    await setMusicTrackFavorite("played", true);
    await recordMusicTrackPlayed("played", 2000);
    await recordMusicTrackPlayed("played", 3000);
    expect(await db.musicTracks.get("played")).toMatchObject({ favorite: true, libraryStatus: "saved", lastPlayedAt: 3000, playCount: 2 });
  });

  it("creates, renames, orders, adds to and removes from local playlists", async () => {
    await db.musicTracks.bulkAdd([makeTrack("a"), makeTrack("b"), makeTrack("c")]);
    const playlist = await createLocalMusicPlaylist("晚风", ["a"]);
    await addTracksToLocalPlaylist(playlist.id, ["b", "a"]);
    expect((await db.musicPlaylists.get(playlist.id))?.trackIds).toEqual(["a", "b"]);
    await updateLocalMusicPlaylistTracks(playlist.id, ["b", "a", "c"]);
    await removeTrackFromLocalPlaylist(playlist.id, "a");
    await renameLocalMusicPlaylist(playlist.id, "夜航");
    expect(await db.musicPlaylists.get(playlist.id)).toMatchObject({ name: "夜航", trackIds: ["b", "c"] });
    await deleteLocalMusicPlaylist(playlist.id);
    expect(await db.musicPlaylists.get(playlist.id)).toBeUndefined();
  });

  it("persists editable metadata and custom LRC/TXT lyrics, then restores official fallback", async () => {
    await db.musicTracks.add(makeTrack("editable"));
    await updateMusicTrackMetadata("editable", { title: "晴天", artists: ["周杰伦"], album: "叶惠美", coverUrl: "data:image/png;base64,AA==" });
    await setMusicTrackLyrics("editable", "[00:01.00]故事的小黄花", "lrc");
    expect(await db.musicTracks.get("editable")).toMatchObject({ title: "晴天", artists: ["周杰伦"], album: "叶惠美", lyricsKind: "lrc", customLyrics: "[00:01.00]故事的小黄花" });
    await setMusicTrackLyrics("editable", "第一行\n第二行", "plain");
    expect((await db.musicTracks.get("editable"))?.lyricsKind).toBe("plain");
    await clearMusicTrackLyrics("editable");
    const cleared = await db.musicTracks.get("editable");
    expect(cleared).not.toHaveProperty("customLyrics");
    expect(cleared).not.toHaveProperty("customTranslatedLyrics");
    expect(cleared).not.toHaveProperty("lyricsKind");
  });

  it("deletes a local Blob and cascades playlist and inactive-session references", async () => {
    const file: MusicFile = { id: "file", schemaVersion: 1, createdAt: 1, updatedAt: 1, name: "song.mp3", mimeType: "audio/mpeg", sizeBytes: 3, blob: new Blob(["abc"], { type: "audio/mpeg" }) };
    const track = makeTrack("local", { source: "local-file", directUrl: undefined, localFileId: file.id });
    const playlist = await createLocalMusicPlaylist("本地", [track.id]);
    const session: ListeningSession = { id: "session", schemaVersion: 1, createdAt: 1, updatedAt: 1, conversationId: "conversation", characterId: "character", state: "ended", invitedBy: "user", queue: [track.id], currentIndex: 0, playbackState: "paused", positionMs: 0, selectedBy: "user", startedAt: 1 };
    await db.musicFiles.add(file); await db.musicTracks.add(track); await db.listeningSessions.add(session);
    await deleteMusicTrack(track.id);
    expect(await db.musicTracks.get(track.id)).toBeUndefined();
    expect(await db.musicFiles.get(file.id)).toBeUndefined();
    expect((await db.musicPlaylists.get(playlist.id))?.trackIds).toEqual([]);
    expect((await db.listeningSessions.get(session.id))?.queue).toEqual([]);
  });

  it("requires the active together-listening track to be ended or changed before deletion", async () => {
    const track = makeTrack("active");
    await db.musicTracks.add(track);
    await db.listeningSessions.add({ id: "active-session", schemaVersion: 1, createdAt: 1, updatedAt: 1, conversationId: "conversation", characterId: "character", state: "active", invitedBy: "user", currentTrackId: track.id, queue: [track.id], currentIndex: 0, playbackState: "playing", positionMs: 0, selectedBy: "user", startedAt: 1 });
    await expect(deleteMusicTrack(track.id)).rejects.toThrow("正在一起听");
    expect(await db.musicTracks.get(track.id)).toBeDefined();
  });

  it("rejects playlist and album share links while keeping single-track imports", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "playlist", tracks: [], playlist: { id: "p" } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "track", tracks: [makeTrack("netease", { source: "netease", externalId: "123", directUrl: undefined })] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(importMusicLink("https://music.163.com/playlist?id=1")).rejects.toThrow("当前仅支持导入网易云单曲链接");
    const [imported] = await importMusicLink("https://music.163.com/song?id=123");
    expect(imported).toMatchObject({ source: "netease", externalId: "123", libraryStatus: "saved" });
  });

  it("backs up library metadata and playlists without including audio blobs", async () => {
    const track = makeTrack("backup", { favorite: true, playCount: 7, customLyrics: "两行歌词", lyricsKind: "plain", source: "local-file", directUrl: undefined, localFileId: "blob-file" });
    await db.musicTracks.add(track);
    await db.musicFiles.add({ id: "blob-file", schemaVersion: 1, createdAt: 1, updatedAt: 1, name: "backup.mp3", mimeType: "audio/mpeg", sizeBytes: 3, blob: new Blob(["abc"]) });
    await createLocalMusicPlaylist("备份歌单", [track.id]);
    const backup = await createBackup();
    expect(backup.data.musicTracks?.[0]).toMatchObject({ favorite: true, playCount: 7, customLyrics: "两行歌词", localFileId: undefined });
    expect(backup.data).not.toHaveProperty("musicFiles");
    await db.musicTracks.clear(); await db.musicPlaylists.clear(); await db.musicFiles.clear();
    await restoreBackup(backup);
    expect(await db.musicTracks.get(track.id)).toMatchObject({ favorite: true, customLyrics: "两行歌词", unavailableReason: "本地文件未包含在备份中" });
    expect((await db.musicPlaylists.toArray())[0]?.trackIds).toEqual([track.id]);
    expect(await db.musicFiles.count()).toBe(0);
  });

});
