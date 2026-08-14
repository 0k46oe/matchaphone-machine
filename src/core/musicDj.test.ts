import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { createMusicInvitationMessage, executeCharacterMusicAction, respondMusicInvitation } from "./music";
import {
  buildMusicDjCandidates,
  createListeningSummary,
  createMusicControlProposal,
  normalizeListeningQueueEntries,
  queueListeningTrack,
  respondMusicControlProposal,
  selectMusicSearchCandidate,
} from "./musicDj";
import { SCHEMA_VERSION, type Character, type Conversation, type ListeningSession, type Message, type MusicTrack } from "./types";

const stamp = 1_000;
const character = {
  id: "dj-character", schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp,
  name: "茶茶", avatar: "", bio: "", personality: "温柔", speakingStyle: "自然", background: "", language: "中文",
  proactive: { messages: false, timeAware: false, frequency: "low", quietStart: "23:00", quietEnd: "08:00", catchupLimit: 1, dailyLimit: 1 },
  relationship: { intimacy: 20, trust: 20, mood: "平静", recentEvents: [] }, lastActiveAt: stamp,
} as Character;
const conversation = { id: "dj-conversation", schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, type: "private", title: "茶茶", memberIds: [character.id], lastActivityAt: stamp } as Conversation;
const makeTrack = (id: string, patch: Partial<MusicTrack> = {}) => ({ id, schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, importedAt: stamp, libraryStatus: "saved", source: "direct-url", title: id, artists: ["歌手"], directUrl: `https://example.com/${id}.mp3`, ...patch }) as MusicTrack;

async function activeSession(trackId = "current") {
  const { message, session } = await createMusicInvitationMessage({ conversationId: conversation.id, characterId: character.id, invitedBy: "user", trackId });
  await respondMusicInvitation(message.id, true, "character");
  return (await db.listeningSessions.get(session.id))!;
}

describe("character DJ 2.0", () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.characters.add(structuredClone(character));
    await db.conversations.add(structuredClone(conversation));
    await db.musicTracks.bulkAdd([makeTrack("current"), makeTrack("picked"), makeTrack("favorite", { favorite: true }), makeTrack("recent", { lastPlayedAt: 9_000 })]);
  });

  it("keeps old queues compatible and ranks character picks before favorites", async () => {
    const legacy = { queue: ["current", "favorite"], selectedBy: "user", startedAt: stamp } as ListeningSession;
    expect(normalizeListeningQueueEntries(legacy).map((entry) => entry.selectedBy)).toEqual(["user", "user"]);
    const session = await activeSession();
    await db.musicEvents.add({ id: "pick-event", schemaVersion: SCHEMA_VERSION, createdAt: 10_000, updatedAt: 10_000, sessionId: session.id, conversationId: conversation.id, characterId: character.id, type: "queue-add", actor: "character", trackId: "picked" });
    expect((await buildMusicDjCandidates(character.id, 3)).map((track) => track.id)).toEqual(["picked", "favorite", "recent"]);
  });

  it("attributes character queue additions and dispatches them to the player", async () => {
    const session = await activeSession(), listener = vi.fn();
    window.addEventListener("mira:music-action", listener);
    const result = await queueListeningTrack(session.id, "picked", "next", "character");
    const stored = await db.listeningSessions.get(session.id);
    expect(result.executed).toBe(true);
    expect(stored?.queue).toEqual(["current", "picked"]);
    expect(stored?.queueEntries?.[1]).toMatchObject({ trackId: "picked", selectedBy: "character" });
    expect(listener).toHaveBeenCalled();
    window.removeEventListener("mira:music-action", listener);
  });

  it("uses a confirmation card for balanced pause control and handles it once", async () => {
    const session = await activeSession();
    await executeCharacterMusicAction({ conversationId: conversation.id, characterId: character.id, action: { type: "pause" } });
    const proposal = (await db.messages.toArray()).find((message) => message.kind === "music-control-proposal")!;
    expect(proposal.attachments?.[0]).toMatchObject({ type: "music-control-proposal", state: "pending", control: "pause" });
    expect((await respondMusicControlProposal(proposal.id, true)).executed).toBe(true);
    expect((await respondMusicControlProposal(proposal.id, true)).executed).toBe(false);
    expect((await db.listeningSessions.get(session.id))?.playbackState).toBe("paused");
  });

  it("lets the user choose one real ambiguous search candidate", async () => {
    const session = await activeSession(), candidates = [makeTrack("candidate-a", { libraryStatus: "temporary" }), makeTrack("candidate-b", { libraryStatus: "temporary" })];
    await db.musicTracks.bulkAdd(candidates);
    const message: Message = { id: "candidate-message", schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, conversationId: conversation.id, senderType: "character", senderId: character.id, content: "请选择", kind: "music-search-candidates", status: "complete", attachments: [{ type: "music-search-candidates", sessionId: session.id, characterId: character.id, query: "候选", trackIds: candidates.map((track) => track.id), placement: "end", state: "pending" }] };
    await db.messages.add(message);
    expect((await selectMusicSearchCandidate(message.id, "candidate-b")).executed).toBe(true);
    expect((await selectMusicSearchCandidate(message.id, "candidate-a")).executed).toBe(false);
    expect((await db.messages.get(message.id))?.attachments?.[0]).toMatchObject({ state: "selected", selectedTrackId: "candidate-b" });
  });

  it("creates one deterministic summary card and queues the closing note task", async () => {
    const session = await activeSession();
    await db.listeningSessions.update(session.id, { state: "ended", endedAt: 700_000, totalListenedMs: 620_000, queue: ["current", "picked"], queueEntries: [{ trackId: "current", selectedBy: "user", addedAt: stamp }, { trackId: "picked", selectedBy: "character", addedAt: stamp + 1 }] });
    await db.musicEvents.add({ id: "played-picked", schemaVersion: SCHEMA_VERSION, createdAt: 3_000, updatedAt: 3_000, sessionId: session.id, conversationId: conversation.id, characterId: character.id, type: "track-change", actor: "character", trackId: "picked" });
    const first = await createListeningSummary(session.id), second = await createListeningSummary(session.id);
    expect(first?.id).toBe(second?.id);
    expect(first?.attachments?.[0]).toMatchObject({ type: "music-session-summary", listenedMs: 620_000 });
    expect(await db.messages.where("conversationId").equals(conversation.id).filter((message) => message.kind === "music-session-summary").count()).toBe(1);
    expect(await db.backgroundTasks.where("eventId").equals(`music-summary:${session.id}`).count()).toBe(1);
  });
});
