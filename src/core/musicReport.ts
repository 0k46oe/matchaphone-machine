import { db, getSetting, setSetting } from "./db";
import { OpenAIProvider } from "./provider";
import type {
  Character,
  MusicListeningDailyAggregate,
  MusicListeningTrackAggregate,
  MusicReportCommentary,
  MusicReportPeriod,
  MusicReportPreferences,
  MusicSource,
  MusicTrack,
  ProviderSettings,
} from "./types";

const DAY_PREFIX = "music-listening-day:";
const COMMENT_PREFIX = "music-report-commentary:";
const PREFERENCES_KEY = "music-report-preferences";
const DAY_MS = 86_400_000;
let mutationQueue = Promise.resolve();

export interface ListeningSegmentInput {
  track: MusicTrack;
  listenedMs: number;
  startedAt: number;
  endedAt: number;
  characterId?: string;
}

export interface ListeningMilestoneInput {
  track: MusicTrack;
  at: number;
  kind: "start" | "complete" | "skip";
  characterId?: string;
  selectedBy?: "user" | "character";
}

export interface MusicReportTrackRow extends MusicListeningTrackAggregate {
  characterMs: Record<string, number>;
}
export interface MusicReportCharacterRow {
  characterId: string;
  listenedMs: number;
  selectedCount: number;
  trackIds: string[];
}
export interface MusicListeningReport {
  period: MusicReportPeriod;
  periodKey: string;
  startAt: number;
  endAt: number;
  startDate: string;
  endDate: string;
  label: string;
  isCurrent: boolean;
  totalListenedMs: number;
  activeDays: number;
  uniqueTracks: number;
  validPlays: number;
  completes: number;
  skips: number;
  daily: Array<{ date: string; listenedMs: number }>;
  monthly: Array<{ month: number; listenedMs: number }>;
  hourlyMs: number[];
  tracks: MusicReportTrackRow[];
  artists: Array<{ name: string; listenedMs: number }>;
  sources: Array<{ source: MusicSource; listenedMs: number }>;
  characters: MusicReportCharacterRow[];
  fingerprint: string;
}

function pad(value: number) { return String(value).padStart(2, "0"); }
export function localDateKey(value: number | Date) {
  const date = typeof value === "number" ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, Math.max(0, month - 1), day || 1);
}
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function sameLocalDay(a: number, b: number) { return localDateKey(a) === localDateKey(b); }

function emptyDay(date: string, stamp = Date.now()): MusicListeningDailyAggregate {
  return { date, totalListenedMs: 0, hourlyMs: Array(24).fill(0), tracks: {}, characterMs: {}, characterTrackMs: {}, characterSelectedCount: {}, createdAt: stamp, updatedAt: stamp };
}
function emptyTrack(track: MusicTrack): MusicListeningTrackAggregate {
  return { trackId: track.id, title: track.title, artists: [...track.artists], source: track.source, listenedMs: 0, starts: 0, completes: 0, skips: 0 };
}
function queueMutation<T>(work: () => Promise<T>) {
  const next = mutationQueue.then(work, work);
  mutationQueue = next.then(() => undefined, () => undefined);
  return next;
}
async function mutateDay(date: string, mutate: (day: MusicListeningDailyAggregate) => void) {
  const key = DAY_PREFIX + date, stamp = Date.now();
  const current = await getSetting<MusicListeningDailyAggregate | null>(key, null);
  const day = current ? { ...current, hourlyMs: [...current.hourlyMs], tracks: { ...current.tracks }, characterMs: { ...current.characterMs }, characterTrackMs: { ...current.characterTrackMs }, characterSelectedCount: { ...current.characterSelectedCount } } : emptyDay(date, stamp);
  mutate(day);
  day.updatedAt = stamp;
  await setSetting(key, day);
}

export async function ensureMusicReportPreferences() {
  const existing = await getSetting<MusicReportPreferences | null>(PREFERENCES_KEY, null);
  if (existing?.trackingStartedAt) return existing;
  const stamp = Date.now();
  const created: MusicReportPreferences = { trackingStartedAt: stamp, period: "week", anchorDate: localDateKey(stamp) };
  await setSetting(PREFERENCES_KEY, created);
  return created;
}
export async function getMusicReportPreferences() {
  return ensureMusicReportPreferences();
}
export async function saveMusicReportPreferences(patch: Partial<MusicReportPreferences>) {
  const current = await ensureMusicReportPreferences();
  const next = { ...current, ...patch };
  await setSetting(PREFERENCES_KEY, next);
  return next;
}

export function recordMusicListeningSegment(input: ListeningSegmentInput) {
  const listenedMs = Math.max(0, Math.round(input.listenedMs));
  const wallMs = Math.max(1, input.endedAt - input.startedAt);
  if (!listenedMs || !input.track.id) return Promise.resolve();
  return queueMutation(async () => {
    await ensureMusicReportPreferences();
    let cursor = input.startedAt, remaining = listenedMs;
    while (cursor < input.endedAt && remaining > 0) {
      const current = new Date(cursor);
      const nextHour = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours() + 1).getTime();
      const boundary = Math.min(input.endedAt, nextHour);
      const chunkWall = Math.max(1, boundary - cursor);
      const chunk = boundary >= input.endedAt ? remaining : Math.min(remaining, Math.round(listenedMs * chunkWall / wallMs));
      const date = localDateKey(cursor), hour = new Date(cursor).getHours();
      await mutateDay(date, (day) => {
        day.totalListenedMs += chunk;
        day.hourlyMs[hour] = (day.hourlyMs[hour] ?? 0) + chunk;
        const previous = day.tracks[input.track.id] ?? emptyTrack(input.track);
        day.tracks[input.track.id] = { ...previous, title: input.track.title, artists: [...input.track.artists], source: input.track.source, listenedMs: previous.listenedMs + chunk };
        if (input.characterId) {
          day.characterMs[input.characterId] = (day.characterMs[input.characterId] ?? 0) + chunk;
          const tracks = { ...(day.characterTrackMs[input.characterId] ?? {}) };
          tracks[input.track.id] = (tracks[input.track.id] ?? 0) + chunk;
          day.characterTrackMs[input.characterId] = tracks;
        }
      });
      remaining -= chunk;
      cursor = boundary;
    }
  });
}

export function recordMusicListeningMilestone(input: ListeningMilestoneInput) {
  return queueMutation(async () => {
    await ensureMusicReportPreferences();
    await mutateDay(localDateKey(input.at), (day) => {
      const previous = day.tracks[input.track.id] ?? emptyTrack(input.track);
      day.tracks[input.track.id] = {
        ...previous,
        title: input.track.title,
        artists: [...input.track.artists],
        source: input.track.source,
        starts: previous.starts + (input.kind === "start" ? 1 : 0),
        completes: previous.completes + (input.kind === "complete" ? 1 : 0),
        skips: previous.skips + (input.kind === "skip" ? 1 : 0),
      };
      if (input.kind === "start" && input.characterId && input.selectedBy === "character") day.characterSelectedCount[input.characterId] = (day.characterSelectedCount[input.characterId] ?? 0) + 1;
    });
  });
}

export function periodBounds(period: MusicReportPeriod, anchorValue: string | Date | number) {
  const anchor = typeof anchorValue === "string" ? parseDateKey(anchorValue) : typeof anchorValue === "number" ? new Date(anchorValue) : new Date(anchorValue);
  let start: Date, end: Date;
  if (period === "week") {
    const day = anchor.getDay() || 7;
    start = addDays(startOfDay(anchor), 1 - day);
    end = addDays(start, 7);
  } else if (period === "month") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  } else {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear() + 1, 0, 1);
  }
  const startDate = localDateKey(start), endDate = localDateKey(addDays(end, -1));
  const label = period === "week" ? `${start.getMonth() + 1}月${start.getDate()}日 – ${addDays(end, -1).getMonth() + 1}月${addDays(end, -1).getDate()}日` : period === "month" ? `${start.getFullYear()}年${start.getMonth() + 1}月` : `${start.getFullYear()}年`;
  return { startAt: start.getTime(), endAt: end.getTime(), startDate, endDate, periodKey: startDate, label };
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
export async function buildMusicListeningReport(period: MusicReportPeriod, anchor: string | Date | number = Date.now()): Promise<MusicListeningReport> {
  const bounds = periodBounds(period, anchor);
  const rows = await db.settings.where("key").between(DAY_PREFIX + bounds.startDate, DAY_PREFIX + localDateKey(bounds.endAt), true, false).toArray();
  const days = rows.map((row) => row.value as MusicListeningDailyAggregate).filter((day) => day?.date).sort((a, b) => a.date.localeCompare(b.date));
  const dailyMap = new Map(days.map((day) => [day.date, day]));
  const daily: Array<{ date: string; listenedMs: number }> = [];
  for (let cursor = new Date(bounds.startAt); cursor.getTime() < bounds.endAt; cursor = addDays(cursor, 1)) { const key = localDateKey(cursor); daily.push({ date: key, listenedMs: dailyMap.get(key)?.totalListenedMs ?? 0 }); }
  const trackMap = new Map<string, MusicReportTrackRow>(), artistMap = new Map<string, number>(), sourceMap = new Map<MusicSource, number>(), characterMap = new Map<string, MusicReportCharacterRow>(), hourlyMs = Array(24).fill(0) as number[];
  let totalListenedMs = 0, validPlays = 0, completes = 0, skips = 0;
  for (const day of days) {
    totalListenedMs += day.totalListenedMs;
    day.hourlyMs.forEach((value, hour) => { hourlyMs[hour] += value ?? 0; });
    for (const track of Object.values(day.tracks)) {
      const previous = trackMap.get(track.trackId) ?? { ...track, listenedMs: 0, starts: 0, completes: 0, skips: 0, characterMs: {} };
      previous.title = track.title; previous.artists = [...track.artists]; previous.source = track.source;
      previous.listenedMs += track.listenedMs; previous.starts += track.starts; previous.completes += track.completes; previous.skips += track.skips;
      trackMap.set(track.trackId, previous);
      validPlays += track.starts; completes += track.completes; skips += track.skips;
      track.artists.forEach((artist) => artistMap.set(artist, (artistMap.get(artist) ?? 0) + track.listenedMs));
      sourceMap.set(track.source, (sourceMap.get(track.source) ?? 0) + track.listenedMs);
    }
    for (const [characterId, listenedMs] of Object.entries(day.characterMs)) {
      const previous = characterMap.get(characterId) ?? { characterId, listenedMs: 0, selectedCount: 0, trackIds: [] };
      previous.listenedMs += listenedMs;
      previous.selectedCount += day.characterSelectedCount[characterId] ?? 0;
      previous.trackIds = Array.from(new Set([...previous.trackIds, ...Object.keys(day.characterTrackMs[characterId] ?? {})]));
      characterMap.set(characterId, previous);
      for (const [trackId, value] of Object.entries(day.characterTrackMs[characterId] ?? {})) { const track = trackMap.get(trackId); if (track) track.characterMs[characterId] = (track.characterMs[characterId] ?? 0) + value; }
    }
  }
  const monthly = Array.from({ length: 12 }, (_, month) => ({ month, listenedMs: daily.filter((day) => Number(day.date.slice(5, 7)) === month + 1).reduce((sum, day) => sum + day.listenedMs, 0) }));
  const tracks = [...trackMap.values()].sort((a, b) => b.listenedMs - a.listenedMs || b.completes - a.completes);
  const characters = [...characterMap.values()].sort((a, b) => b.listenedMs - a.listenedMs);
  const fingerprint = hashText(JSON.stringify({ period, key: bounds.periodKey, totalListenedMs, daily: daily.map((item) => item.listenedMs), tracks: tracks.map((track) => [track.trackId, track.listenedMs, track.starts, track.completes, track.skips]), characters }));
  return { period, ...bounds, isCurrent: Date.now() >= bounds.startAt && Date.now() < bounds.endAt, totalListenedMs, activeDays: daily.filter((day) => day.listenedMs > 0).length, uniqueTracks: tracks.filter((track) => track.listenedMs > 0).length, validPlays, completes, skips, daily, monthly, hourlyMs, tracks, artists: [...artistMap].map(([name, listenedMs]) => ({ name, listenedMs })).sort((a, b) => b.listenedMs - a.listenedMs), sources: [...sourceMap].map(([source, listenedMs]) => ({ source, listenedMs })).sort((a, b) => b.listenedMs - a.listenedMs), characters, fingerprint };
}

function commentaryKey(period: MusicReportPeriod, periodKey: string, characterId: string) { return `${COMMENT_PREFIX}${period}:${periodKey}:${characterId}`; }
export async function getMusicReportCommentary(report: MusicListeningReport, characterId: string) {
  return getSetting<MusicReportCommentary | null>(commentaryKey(report.period, report.periodKey, characterId), null);
}
function reportFacts(report: MusicListeningReport, characterId: string) {
  const companion = report.characters.find((item) => item.characterId === characterId);
  return {
    period: report.label,
    totalMinutes: Math.round(report.totalListenedMs / 60000),
    activeDays: report.activeDays,
    uniqueTracks: report.uniqueTracks,
    validPlays: report.validPlays,
    completes: report.completes,
    skips: report.skips,
    topTracks: report.tracks.slice(0, 5).map((track) => ({ title: track.title, artists: track.artists, minutes: Math.round(track.listenedMs / 60000), togetherMinutes: Math.round((track.characterMs[characterId] ?? 0) / 60000) })),
    topArtists: report.artists.slice(0, 5).map((artist) => artist.name),
    togetherMinutes: Math.round((companion?.listenedMs ?? 0) / 60000),
    selectedCount: companion?.selectedCount ?? 0,
  };
}
export async function generateMusicReportCommentary(report: MusicListeningReport, character: Character, provider: ProviderSettings, manual = false) {
  const key = commentaryKey(report.period, report.periodKey, character.id), existing = await getSetting<MusicReportCommentary | null>(key, null), stamp = Date.now();
  if (!manual && existing) {
    if (existing.statsFingerprint === report.fingerprint || !report.isCurrent || sameLocalDay(existing.generatedAt, stamp)) return existing;
  }
  if (manual && existing?.lastManualAttemptAt && sameLocalDay(existing.lastManualAttemptAt, stamp)) throw new Error("今天已经重新生成过这期点评了");
  const facts = reportFacts(report, character.id);
  const raw = await new OpenAIProvider({ ...provider, stream: false }).chat([
    { role: "system", content: `你是${character.name}。性格：${character.personality}。说话风格：${character.speakingStyle}。请只根据用户提供的真实听歌统计写2到4句简短自然点评，每句语义完整，不编造约会、心情、歌词、关系进展或未提供的事件，不提及其他角色，只返回纯文本。` },
    { role: "user", content: JSON.stringify(facts) },
  ], { stream: false });
  const text = raw.trim().replace(/^```(?:text)?\s*|\s*```$/g, "").slice(0, 320);
  if (!text) throw new Error("角色暂时没有写下点评");
  const commentary: MusicReportCommentary = { period: report.period, periodKey: report.periodKey, characterId: character.id, statsFingerprint: report.fingerprint, text, generatedAt: stamp, lastManualAttemptAt: manual ? stamp : existing?.lastManualAttemptAt };
  await setSetting(key, commentary);
  return commentary;
}

export async function clearMusicListeningReports() {
  await db.transaction("rw", db.settings, async () => {
    await db.settings.where("key").startsWith(DAY_PREFIX).delete();
    await db.settings.where("key").startsWith(COMMENT_PREFIX).delete();
    await db.settings.delete(PREFERENCES_KEY);
  });
  return ensureMusicReportPreferences();
}

export async function removeCharacterFromMusicReports(characterId: string) {
  await queueMutation(async () => {
    const stats = await db.settings.where("key").startsWith(DAY_PREFIX).toArray();
    for (const row of stats) {
      const day = row.value as MusicListeningDailyAggregate;
      if (!day?.characterMs?.[characterId] && !day?.characterTrackMs?.[characterId] && !day?.characterSelectedCount?.[characterId]) continue;
      const next: MusicListeningDailyAggregate = { ...day, characterMs: { ...day.characterMs }, characterTrackMs: { ...day.characterTrackMs }, characterSelectedCount: { ...day.characterSelectedCount }, updatedAt: Date.now() };
      delete next.characterMs[characterId]; delete next.characterTrackMs[characterId]; delete next.characterSelectedCount[characterId];
      await db.settings.put({ key: row.key, value: next });
    }
    const comments = await db.settings.where("key").startsWith(COMMENT_PREFIX).filter((row) => row.key.endsWith(`:${characterId}`)).primaryKeys();
    if (comments.length) await db.settings.bulkDelete(comments as string[]);
    const preferences = await getSetting<MusicReportPreferences | null>(PREFERENCES_KEY, null);
    if (preferences?.selectedCharacterId === characterId) await setSetting(PREFERENCES_KEY, { ...preferences, selectedCharacterId: undefined });
  });
}

export async function exportMusicReportSettings() {
  const rows = await db.settings.where("key").startsWith(DAY_PREFIX).toArray();
  const comments = await db.settings.where("key").startsWith(COMMENT_PREFIX).toArray();
  const preferences = await getSetting<MusicReportPreferences | null>(PREFERENCES_KEY, null);
  return { stats: rows.map((row) => row.value), comments: comments.map((row) => row.value), preferences };
}
export async function restoreMusicReportSettings(stats: unknown[] = [], comments: unknown[] = [], preferences?: unknown) {
  await db.settings.where("key").startsWith(DAY_PREFIX).delete();
  await db.settings.where("key").startsWith(COMMENT_PREFIX).delete();
  await db.settings.delete(PREFERENCES_KEY);
  const records = [
    ...stats.filter(Boolean).map((value) => ({ key: DAY_PREFIX + (value as MusicListeningDailyAggregate).date, value })),
    ...comments.filter(Boolean).map((value) => { const item = value as MusicReportCommentary; return { key: commentaryKey(item.period, item.periodKey, item.characterId), value }; }),
  ];
  if (preferences) records.push({ key: PREFERENCES_KEY, value: preferences });
  if (records.length) await db.settings.bulkPut(records);
}

export function shiftMusicReportAnchor(period: MusicReportPeriod, anchorDate: string, direction: -1 | 1) {
  const anchor = parseDateKey(anchorDate);
  if (period === "week") anchor.setDate(anchor.getDate() + direction * 7);
  else if (period === "month") anchor.setMonth(anchor.getMonth() + direction);
  else anchor.setFullYear(anchor.getFullYear() + direction);
  return localDateKey(anchor);
}
export function formatListeningDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}
export const musicReportTrackingDayPrefix = DAY_PREFIX;
export const musicReportCommentaryPrefix = COMMENT_PREFIX;