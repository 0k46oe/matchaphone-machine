import type { MusicSleepTimer } from "./types";
import type { ParsedLyricLine } from "./music";

export const MUSIC_SLEEP_FADE_MS = 10_000;

export function activeLyricIndex(lines: ParsedLyricLine[], positionMs: number) {
  if (!lines.length) return -1;
  let active = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].timeMs <= positionMs) active = index;
    else break;
  }
  return active;
}

export function sleepTimerRemainingMs(
  timer: MusicSleepTimer | undefined,
  nowMs: number,
  currentTrackId?: string,
  positionMs = 0,
  durationMs = 0,
) {
  if (!timer) return undefined;
  if (timer.mode === "duration") return Math.max(0, timer.endsAt - nowMs);
  if (!currentTrackId || timer.trackId !== currentTrackId || durationMs <= 0) return undefined;
  return Math.max(0, durationMs - positionMs);
}

export function sleepFadeVolume(baseVolume: number, remainingMs: number | undefined) {
  const volume = Math.max(0, Math.min(1, baseVolume));
  if (remainingMs === undefined || remainingMs >= MUSIC_SLEEP_FADE_MS) return volume;
  return volume * Math.max(0, remainingMs / MUSIC_SLEEP_FADE_MS);
}

export function formatSleepTimerRemaining(timer: MusicSleepTimer | undefined, remainingMs?: number) {
  if (!timer) return "";
  if (timer.mode === "track-end") return "本曲播完";
  const totalSeconds = Math.max(0, Math.ceil((remainingMs ?? 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isInteractiveSwipeTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, input, textarea, select, a, [role='button'], [data-no-player-swipe]"));
}