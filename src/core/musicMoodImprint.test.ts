import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  cleanupMoodImprintsForDeletedMessages,
  commitMoodImprintRecall,
  createMoodImprintForSession,
  listMoodImprintsForTrack,
  moodImprintMatchesTrack,
  selectMoodImprintForRecall,
  setMoodImprintRecallEnabled,
} from "./musicMoodImprint";
import { SCHEMA_VERSION, type Character, type Conversation, type ListeningSession, type Message, type MusicTrack } from "./types";

const stamp = 10_000;
const character = {
  id: "mood-character", schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp,
  name: "茶茶", avatar: "", bio: "", personality: "温柔", speakingStyle: "自然", background: "", language: "中文",
  chatSettings: { language: "中文", contextLimit: 30, stream: false, music: { canInviteToListen: true, canControlPlayback: true, commentaryLevel: "medium", moodImprintEnabled: true, moodRecallEnabled: true } },
  proactive: { messages: false, timeAware: false, frequency: "low", quietStart: "23:00", quietEnd: "08:00", catchupLimit: 1, dailyLimit: 1 },
  relationship: { intimacy: 20, trust: 20, mood: "平静", recentEvents: [] }, lastActiveAt: stamp,
} as Character;
const conversation = { id: "mood-conversation", schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, type: "private", title: "茶茶", memberIds: [character.id], lastActivityAt: stamp } as Conversation;
const track = (id: string, patch: Partial<MusicTrack> = {}) => ({ id, schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, importedAt: stamp, libraryStatus: "saved", source: "direct-url", title: id, artists: ["歌手"], directUrl: `https://example.com/${id}.mp3`, ...patch }) as MusicTrack;
const session = (id: string, state: ListeningSession["state"] = "ended") => ({ id, schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, conversationId: conversation.id, characterId: character.id, state, invitedBy: "user", currentTrackId: "track-a", queue: ["track-a", "track-b"], currentIndex: 0, playbackState: state === "active" ? "playing" : "paused", positionMs: 20_000, selectedBy: "user", startedAt: stamp + 100, endedAt: state === "ended" ? stamp + 10_000 : undefined, totalListenedMs: 120_000, djTurnCount: 0 }) as ListeningSession;
const message = (id: string, senderType: "user" | "character", content: string, createdAt: number): Message => ({ id, schemaVersion: SCHEMA_VERSION, createdAt, updatedAt: createdAt, conversationId: conversation.id, senderType, senderId: senderType === "character" ? character.id : undefined, content, kind: "text", status: "complete" });

async function addPlayedEvents(sessionId: string) {
  await db.musicEvents.bulkAdd([
    { id: `${sessionId}-play-a`, schemaVersion: SCHEMA_VERSION, createdAt: stamp + 200, updatedAt: stamp + 200, sessionId, conversationId: conversation.id, characterId: character.id, type: "play", actor: "user", trackId: "track-a" },
    { id: `${sessionId}-play-b`, schemaVersion: SCHEMA_VERSION, createdAt: stamp + 300, updatedAt: stamp + 300, sessionId, conversationId: conversation.id, characterId: character.id, type: "track-change", actor: "character", trackId: "track-b" },
  ]);
}

describe("music mood imprints", () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.characters.add(structuredClone(character));
    await db.conversations.add(structuredClone(conversation));
    await db.musicTracks.bulkAdd([track("track-a"), track("track-b"), track("netease-a", { source: "netease", externalId: "163-42", directUrl: undefined })]);
  });

  it("creates one session imprint from real two-way dialogue and links every played track", async () => {
    const ended = session("ended-one");
    await db.listeningSessions.add(ended); await addPlayedEvents(ended.id);
    await db.messages.bulkAdd([message("u1", "user", "今天终于轻松一点了。", stamp + 1_000), message("c1", "character", "那就慢慢听，我陪着你。", stamp + 1_100), message("u2", "user", "这首歌很适合现在。", stamp + 1_200)]);
    const first = await createMoodImprintForSession(ended.id), second = await createMoodImprintForSession(ended.id);
    expect(first?.id).toBe(`music-mood-imprint:${ended.id}`);
    expect(second?.id).toBe(first?.id);
    expect(first?.tracks.map((item) => item.trackId)).toEqual(["track-a", "track-b"]);
    expect(first?.quotes).toHaveLength(3);
    expect(await db.musicEvents.where("sessionId").equals(ended.id).filter((event) => event.type === "mood-imprint").count()).toBe(1);
  });

  it("does not create an imprint without genuine two-way chat", async () => {
    const ended = session("ended-empty");
    await db.listeningSessions.add(ended); await addPlayedEvents(ended.id);
    await db.messages.add(message("only-user", "user", "我在听歌。", stamp + 1_000));
    expect(await createMoodImprintForSession(ended.id)).toBeUndefined();
    expect((await db.listeningSessions.get(ended.id))?.moodImprint).toBeUndefined();
  });

  it("matches Netease songs by external id but avoids title-based guesses", async () => {
    const imprint = { ...(session("source") as ListeningSession), moodImprint: undefined };
    await db.listeningSessions.add(imprint);
    await db.messages.bulkAdd([message("u3", "user", "记住这首。", stamp + 1_000), message("c3", "character", "好。", stamp + 1_100)]);
    await db.musicEvents.add({ id: "netease-event", schemaVersion: SCHEMA_VERSION, createdAt: stamp + 300, updatedAt: stamp + 300, sessionId: imprint.id, conversationId: conversation.id, characterId: character.id, type: "play", actor: "user", trackId: "netease-a" });
    const created = (await createMoodImprintForSession(imprint.id))!;
    expect(moodImprintMatchesTrack(created, track("netease-copy", { source: "netease", externalId: "163-42" }))).toBe(true);
    expect(moodImprintMatchesTrack(created, track("other", { title: "netease-a" }))).toBe(false);
  });

  it("recalls only during the same character active session and enforces session/cooldown limits", async () => {
    const old = session("old-session");
    await db.listeningSessions.add(old); await addPlayedEvents(old.id);
    await db.messages.bulkAdd([message("u4", "user", "那天有点累。", stamp + 1_000), message("c4", "character", "我陪你休息。", stamp + 1_100)]);
    const imprint = (await createMoodImprintForSession(old.id))!;
    const active = session("active-session", "active"); active.queue = ["track-a"]; active.currentTrackId = "track-a";
    await db.listeningSessions.add(active);
    const selected = await selectMoodImprintForRecall(active, track("track-a"), () => 0);
    expect(selected?.id).toBe(imprint.id);
    await commitMoodImprintRecall(active, imprint, track("track-a"), "上次你说有点累。 ");
    expect(await selectMoodImprintForRecall(active, track("track-a"), () => 0)).toBeUndefined();
    expect((await db.listeningSessions.get(old.id))?.moodImprint?.recallCount).toBe(1);
  });

  it("supports listing, disabling, and privacy cleanup after source messages are deleted", async () => {
    const ended = session("managed-session");
    await db.listeningSessions.add(ended); await addPlayedEvents(ended.id);
    await db.messages.bulkAdd([message("u5", "user", "这是我们的歌。", stamp + 1_000), message("c5", "character", "我会记得。", stamp + 1_100)]);
    await createMoodImprintForSession(ended.id);
    expect(await listMoodImprintsForTrack(track("track-a"))).toHaveLength(1);
    await setMoodImprintRecallEnabled(ended.id, false);
    expect((await db.listeningSessions.get(ended.id))?.moodImprint?.recallEnabled).toBe(false);
    await cleanupMoodImprintsForDeletedMessages(["u5"]);
    expect((await db.listeningSessions.get(ended.id))?.moodImprint).toBeUndefined();
  });
});