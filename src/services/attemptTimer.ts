import { ATTEMPT_DURATION_MAX_MINUTES, ATTEMPT_DURATION_MIN_MINUTES, ATTEMPT_TIMER_STALE_HOURS } from './constants';

// The built-in attempt timer. Pure: the start time and "now" are epoch
// milliseconds passed in, so nothing here reads a clock. The start time itself
// lives in localStorage on this device (see hooks/useAttemptTimer.ts); it is a
// convenience, not app data, so it never reaches Dexie or a backup.

const MINUTE_MS = 60_000;
const STALE_MS = ATTEMPT_TIMER_STALE_HOURS * 60 * MINUTE_MS;

export function timerStorageKey(problemId: string): string {
  return `leetcode-master.attemptTimer.${problemId}`;
}

// A stored start is usable only if it is a finite timestamp that is not in the
// future and not older than the stale limit. Anything else (junk, a clock that
// moved back, a timer left running overnight) means "no timer".
export function parseTimerStart(raw: string | null | undefined, now: number): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt) || startedAt > now || now - startedAt > STALE_MS) return null;
  return startedAt;
}

// Whole minutes between start and stop, rounded, then clamped into the form's
// allowed duration range (a few seconds logs as 1 minute, never 0).
export function elapsedMinutes(startedAt: number, now: number): number {
  const minutes = Math.round((now - startedAt) / MINUTE_MS);
  return Math.min(ATTEMPT_DURATION_MAX_MINUTES, Math.max(ATTEMPT_DURATION_MIN_MINUTES, minutes));
}
