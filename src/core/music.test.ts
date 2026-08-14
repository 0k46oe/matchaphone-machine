import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  buildListeningContext,
  createMusicInvitationMessage,
  executeCharacterMusicAction,
  lyricWindow,
  musicSettingsOf,
  parseLrc,
  respondMusicInvitation,
} from "./music";
import type { Character, Conversation, MusicTrack } from "./types";

const t = 1000;
const character = {
  id: "character", schemaVersion: 1, createdAt: t, updatedAt: t, name: "茶茶", avatar: "", bio: "", personality: "温柔", speakingStyle: "自然", background: "", language: "中文",
  proactive: { messages: false, timeAware: false, frequency: "low", quietStart: "23:00", quietEnd: "08:00", catchupLimit: 1, dailyLimit: 1 },
  relationship: { intimacy: 10, trust: 10, mood: "平静", recentEvents: [] }, lastActiveAt: t,
} as Character;
const conversation = { id: "conversation", schemaVersion: 1, createdAt: t, updatedAt: t, type: "private", title: "茶茶", memberIds: [character.id], lastActivityAt: t } as Conversation;
const track = { id: "track", schemaVersion: 1, createdAt: t, updatedAt: t, importedAt: t, source: "direct-url", title: "夏夜", artists: ["茶茶"], directUrl: "https://example.com/song.mp3" } as MusicTrack;

describe("music continuity and invitations", () => {
  beforeEach(async () => { await db.delete(); await db.open(); await db.characters.add(structuredClone(character)); await db.conversations.add(structuredClone(conversation)); await db.musicTracks.add(structuredClone(track)); });
  it("parses translated LRC and returns a bounded lyric window", () => {
    const lines = parseLrc("[00:01.00]第一句\n[00:02.50]第二句\n[00:04.00]第三句", "[00:02.50]Second");
    expect(lines[1]).toMatchObject({ timeMs: 2500, text: "第二句", translation: "Second" });
    expect(lyricWindow(lines, 2600, 1)).toEqual(["第一句", "第二句", "Second", "第三句"]);
  });
  it("gives old characters safe music defaults", () => {
    expect(musicSettingsOf(character)).toMatchObject({ canInviteToListen: true, canControlPlayback: true, commentaryLevel: "medium" });
  });
  it("keeps only one invited or active listening session", async () => {
    const first = await createMusicInvitationMessage({ conversationId: conversation.id, characterId: character.id, invitedBy: "user", trackId: track.id });
    const second = await createMusicInvitationMessage({ conversationId: conversation.id, characterId: character.id, invitedBy: "character", trackId: track.id });
    expect((await db.listeningSessions.get(first.session.id))?.state).toBe("ended");
    expect((await db.listeningSessions.get(second.session.id))?.state).toBe("invited");
    expect(await db.musicEvents.where("type").equals("invite").count()).toBe(2);
  });
  it("accepts a character invitation and exposes it to the next chat turn", async () => {
    const { message, session } = await createMusicInvitationMessage({ conversationId: conversation.id, characterId: character.id, invitedBy: "character", trackId: track.id });
    await respondMusicInvitation(message.id, true, "user");
    expect((await db.listeningSessions.get(session.id))?.state).toBe("active");
    expect((await buildListeningContext(conversation.id))?.track?.title).toBe("夏夜");
  });
  it("validates character playback actions against the local library", async () => {
    const { message } = await createMusicInvitationMessage({ conversationId: conversation.id, characterId: character.id, invitedBy: "user", trackId: track.id });
    expect((await executeCharacterMusicAction({ conversationId: conversation.id, characterId: character.id, action: { type: "accept-invite" } })).executed).toBe(true);
    expect((await db.messages.get(message.id))?.attachments?.[0]).toMatchObject({ type: "music-invitation", state: "accepted" });
    expect((await executeCharacterMusicAction({ conversationId: conversation.id, characterId: character.id, action: { type: "play", trackId: "missing" } })).executed).toBe(false);
  });
});
