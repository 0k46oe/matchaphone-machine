import { db } from "./db";
import { visibleCharacterCount } from "./replyBubbles";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type Character,
  type ListeningSession,
  type Message,
  type MusicMoodImprint,
  type MusicMoodImprintQuote,
  type MusicMoodImprintTrack,
  type MusicTrack,
} from "./types";

export const MOOD_IMPRINT_RECALL_PROBABILITY = 0.3;
export const MOOD_IMPRINT_RECALL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const allowedMoodTags = new Set(["安心", "心动", "想念", "治愈", "平静", "开心", "温柔", "释然", "低落", "热烈"]);

function compactText(value: string, maximum = 80) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (visibleCharacterCount(normalized) <= maximum) return normalized;
  const Segmenter = (Intl as unknown as { Segmenter?: new(locale?: string, options?: { granularity: "grapheme" }) => { segment(value: string): Iterable<{ segment: string }> } }).Segmenter;
  const parts = Segmenter ? [...new Segmenter("zh-CN", { granularity: "grapheme" }).segment(normalized)].map((item) => item.segment) : Array.from(normalized);
  return `${parts.slice(0, maximum).join("")}…`;
}

function isEligibleDialogue(message: Message, characterId: string) {
  if (message.status !== "complete" || message.visibility === "private" || !message.content.trim()) return false;
  if (message.senderType === "user") return true;
  return message.senderType === "character" && message.senderId === characterId;
}

export function selectMoodImprintQuotes(messages: Message[], characterId: string): MusicMoodImprintQuote[] {
  const eligible = messages.filter((message) => isEligibleDialogue(message, characterId)).sort((a, b) => a.createdAt - b.createdAt);
  const hasUser = eligible.some((message) => message.senderType === "user"), hasCharacter = eligible.some((message) => message.senderType === "character");
  if (!hasUser || !hasCharacter) return [];
  let chosen = eligible.slice(-3);
  for (const senderType of ["user", "character"] as const) {
    if (chosen.some((message) => message.senderType === senderType)) continue;
    const replacement = [...eligible].reverse().find((message) => message.senderType === senderType);
    if (replacement) chosen = [replacement, ...chosen.slice(1)];
  }
  return chosen.sort((a, b) => a.createdAt - b.createdAt).map((message) => ({
    messageId: message.id,
    senderType: message.senderType as "user" | "character",
    textSnapshot: compactText(message.content),
    createdAt: message.createdAt,
  }));
}

function trackSnapshot(track: MusicTrack): MusicMoodImprintTrack {
  return { trackId: track.id, title: track.title, artists: [...track.artists], source: track.source, externalId: track.externalId };
}

function fallbackSummary(tracks: MusicMoodImprintTrack[], quotes: MusicMoodImprintQuote[]) {
  const title = tracks[0]?.title ? `《${tracks[0].title}》` : "这些歌";
  const userQuote = quotes.find((quote) => quote.senderType === "user")?.textSnapshot;
  return userQuote ? `一起听${title}时，你说过“${compactText(userQuote, 28)}”。` : `一起听${title}时，留下了一段真实对话。`;
}

export async function createMoodImprintForSession(sessionId: string) {
  const session = await db.listeningSessions.get(sessionId);
  if (!session || session.state !== "ended" || session.moodImprint) return session?.moodImprint;
  const character = await db.characters.get(session.characterId);
  if (!character || character.chatSettings?.music?.moodImprintEnabled === false) return;
  const endedAt = session.endedAt ?? now();
  const [messages, events] = await Promise.all([
    db.messages.where("conversationId").equals(session.conversationId).filter((message) => message.createdAt >= session.startedAt && message.createdAt <= endedAt).toArray(),
    db.musicEvents.where("sessionId").equals(session.id).toArray(),
  ]);
  const quotes = selectMoodImprintQuotes(messages, session.characterId);
  if (!quotes.length) return;
  const trackIds: string[] = [];
  for (const event of events.sort((a, b) => a.createdAt - b.createdAt)) {
    if (event.trackId && ["play", "track-change"].includes(event.type) && !trackIds.includes(event.trackId)) trackIds.push(event.trackId);
  }
  if (!trackIds.length && session.currentTrackId) trackIds.push(session.currentTrackId);
  const tracks = (await db.musicTracks.bulkGet(trackIds)).filter((track): track is MusicTrack => Boolean(track)).map(trackSnapshot);
  if (!tracks.length) return;
  const stamp = now(), imprint: MusicMoodImprint = {
    id: `music-mood-imprint:${session.id}`,
    sessionId: session.id,
    characterId: session.characterId,
    conversationId: session.conversationId,
    tracks,
    representativeTrackId: tracks[0]?.trackId,
    summary: fallbackSummary(tracks, quotes),
    moodTags: ["平静"],
    quotes,
    recallEnabled: true,
    recallCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };
  let created = false;
  await db.transaction("rw", [db.listeningSessions, db.musicEvents], async () => {
    const fresh = await db.listeningSessions.get(session.id);
    if (!fresh || fresh.moodImprint) return;
    await db.listeningSessions.update(session.id, { moodImprint: imprint, updatedAt: stamp });
    await db.musicEvents.add({ id: uid(), schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, sessionId: session.id, conversationId: session.conversationId, characterId: session.characterId, type: "mood-imprint", actor: "system", trackId: imprint.representativeTrackId, detail: imprint.id });
    created = true;
  });
  return created ? imprint : (await db.listeningSessions.get(session.id))?.moodImprint;
}

export function normalizeMoodTags(value: unknown) {
  if (!Array.isArray(value)) return ["平静"];
  const tags = value.map((item) => String(item).trim()).filter((item) => allowedMoodTags.has(item)).slice(0, 3);
  return tags.length ? [...new Set(tags)] : ["平静"];
}

export async function enrichMoodImprint(sessionId: string, summary?: string, moodTags?: unknown) {
  const session = await db.listeningSessions.get(sessionId), imprint = session?.moodImprint;
  if (!session || !imprint) return;
  const cleanSummary = summary?.replace(/\s+/gu, " ").trim();
  const next = { ...imprint, summary: cleanSummary ? compactText(cleanSummary, 60) : imprint.summary, moodTags: normalizeMoodTags(moodTags), updatedAt: now() };
  await db.listeningSessions.update(session.id, { moodImprint: next, updatedAt: next.updatedAt });
  return next;
}

export function musicMoodTrackIdentity(track: Pick<MusicTrack, "id" | "source" | "externalId">) {
  return track.source === "netease" && track.externalId ? `netease:${track.externalId}` : `track:${track.id}`;
}

function recallEventMatchesIdentity(detail: string | undefined, trackId: string | undefined, identity: string, currentTrackId: string) {
  if (trackId === currentTrackId) return true;
  if (!detail) return false;
  try { return (JSON.parse(detail) as { trackIdentity?: string }).trackIdentity === identity; } catch { return false; }
}
export function moodImprintMatchesTrack(imprint: MusicMoodImprint, track: Pick<MusicTrack, "id" | "source" | "externalId">) {
  return imprint.tracks.some((item) => item.trackId === track.id || (track.source === "netease" && item.source === "netease" && Boolean(track.externalId) && item.externalId === track.externalId));
}

export async function listMoodImprintsForTrack(track: Pick<MusicTrack, "id" | "source" | "externalId">) {
  const sessions = await db.listeningSessions.toArray();
  return sessions.map((session) => session.moodImprint).filter((imprint): imprint is MusicMoodImprint => Boolean(imprint && moodImprintMatchesTrack(imprint, track))).sort((a, b) => b.createdAt - a.createdAt);
}

export async function setMoodImprintRecallEnabled(sessionId: string, enabled: boolean) {
  const session = await db.listeningSessions.get(sessionId), imprint = session?.moodImprint;
  if (!session || !imprint) return;
  const updatedAt = now();
  await db.listeningSessions.update(sessionId, { moodImprint: { ...imprint, recallEnabled: enabled, updatedAt }, updatedAt });
}

export async function deleteMoodImprint(sessionId: string) {
  const session = await db.listeningSessions.get(sessionId);
  if (!session?.moodImprint) return;
  await db.listeningSessions.update(sessionId, { moodImprint: undefined, updatedAt: now() });
}

export async function cleanupMoodImprintsForDeletedMessages(messageIds: string[]) {
  if (!messageIds.length) return;
  const removed = new Set(messageIds), sessions = await db.listeningSessions.toArray();
  for (const session of sessions) {
    const imprint = session.moodImprint;
    if (!imprint || !imprint.quotes.some((quote) => removed.has(quote.messageId))) continue;
    const quotes = imprint.quotes.filter((quote) => !removed.has(quote.messageId));
    const hasUser = quotes.some((quote) => quote.senderType === "user"), hasCharacter = quotes.some((quote) => quote.senderType === "character");
    await db.listeningSessions.update(session.id, { moodImprint: hasUser && hasCharacter ? { ...imprint, quotes, updatedAt: now() } : undefined, updatedAt: now() });
  }
}

export async function removeMoodImprintsForCharacter(characterId: string) {
  const sessions = await db.listeningSessions.toArray();
  for (const session of sessions) if (session.characterId === characterId && session.moodImprint) await db.listeningSessions.update(session.id, { moodImprint: undefined, updatedAt: now() });
}

export async function selectMoodImprintForRecall(session: ListeningSession, track: MusicTrack, random = Math.random) {
  if (session.state !== "active" || session.playbackState !== "playing") return;
  const character = await db.characters.get(session.characterId);
  if (!character || character.chatSettings?.music?.moodRecallEnabled === false) return;
  const events = await db.musicEvents.toArray();
  if (events.some((event) => event.sessionId === session.id && event.type === "mood-recall")) return;
  const cutoff = now() - MOOD_IMPRINT_RECALL_COOLDOWN_MS, identity = musicMoodTrackIdentity(track);
  if (events.some((event) => event.characterId === session.characterId && event.type === "mood-recall" && event.createdAt >= cutoff && recallEventMatchesIdentity(event.detail, event.trackId, identity, track.id))) return;
  if (random() >= MOOD_IMPRINT_RECALL_PROBABILITY) return;
  const sessions = await db.listeningSessions.toArray();
  return sessions.filter((item) => item.id !== session.id && item.characterId === session.characterId && item.moodImprint?.recallEnabled && moodImprintMatchesTrack(item.moodImprint, track)).map((item) => item.moodImprint!).sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function commitMoodImprintRecall(session: ListeningSession, imprint: MusicMoodImprint, track: Pick<MusicTrack, "id" | "source" | "externalId">, detail: string) {
  const stamp = now();
  await db.transaction("rw", [db.listeningSessions, db.musicEvents], async () => {
    const currentEvents = await db.musicEvents.where("sessionId").equals(session.id).toArray();
    if (currentEvents.some((event) => event.type === "mood-recall")) return;
    const source = await db.listeningSessions.get(imprint.sessionId), fresh = source?.moodImprint;
    if (!source || !fresh || !fresh.recallEnabled) return;
    await db.listeningSessions.update(source.id, { moodImprint: { ...fresh, recallCount: (fresh.recallCount ?? 0) + 1, lastRecalledAt: stamp, updatedAt: stamp }, updatedAt: stamp });
    await db.musicEvents.add({ id: uid(), schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, sessionId: session.id, conversationId: session.conversationId, characterId: session.characterId, type: "mood-recall", actor: "character", trackId: track.id, detail: JSON.stringify({ imprintId: imprint.id, trackIdentity: musicMoodTrackIdentity(track), text: compactText(detail, 160) }) });
  });
}

export function moodImprintContext(imprint: MusicMoodImprint, character: Character) {
  const date = new Date(imprint.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const quotes = imprint.quotes.map((quote) => `${quote.senderType === "user" ? "用户" : character.name}：${quote.textSnapshot}`).join("\n");
  return `上次一起听日期：${date}\n心情：${imprint.moodTags.join("、")}\n真实摘要：${imprint.summary}\n真实聊天片段：\n${quotes}`;
}