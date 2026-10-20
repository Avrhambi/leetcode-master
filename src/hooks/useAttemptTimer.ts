import { useCallback, useEffect, useState } from 'react';
import { elapsedMinutes, parseTimerStart, timerStorageKey } from '../services/attemptTimer';

// Per-device attempt timer for one problem. The start time is kept in
// localStorage so it survives a reload and a trip to another tab; storage can be
// missing or throw (private windows, blocked site data), in which case the timer
// still runs for as long as this page stays open.
const TICK_MS = 15_000;

function readStart(problemId: string): number | null {
  try {
    const key = timerStorageKey(problemId);
    const raw = window.localStorage.getItem(key);
    const startedAt = parseTimerStart(raw, Date.now());
    if (raw !== null && startedAt === null) window.localStorage.removeItem(key);
    return startedAt;
  } catch {
    return null;
  }
}

function writeStart(problemId: string, startedAt: number | null) {
  try {
    const key = timerStorageKey(problemId);
    if (startedAt === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(startedAt));
  } catch {
    // Storage unavailable: the timer lives in memory only.
  }
}

export interface AttemptTimer {
  running: boolean;
  // Rounded elapsed minutes (at least 1) while running, otherwise null.
  minutes: number | null;
  start: () => void;
  clear: () => void;
}

export function useAttemptTimer(problemId: string): AttemptTimer {
  const [state, setState] = useState(() => ({ problemId, startedAt: readStart(problemId) }));
  const [now, setNow] = useState(() => Date.now());
  // The component instance is reused when chaining through the review queue.
  if (state.problemId !== problemId) setState({ problemId, startedAt: readStart(problemId) });
  const startedAt = state.problemId === problemId ? state.startedAt : null;

  useEffect(() => {
    if (startedAt === null) return undefined;
    const refresh = () => {
      const current = Date.now();
      setNow(current);
      // A timer left running past the stale limit is dropped, as on load.
      if (parseTimerStart(String(startedAt), current) === null) {
        writeStart(problemId, null);
        setState({ problemId, startedAt: null });
      }
    };
    refresh();
    const id = window.setInterval(refresh, TICK_MS);
    // Browsers throttle background timers; catch up as soon as the tab is back.
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [problemId, startedAt]);

  const start = useCallback(() => {
    const current = Date.now();
    writeStart(problemId, current);
    setNow(current);
    setState({ problemId, startedAt: current });
  }, [problemId]);

  const clear = useCallback(() => {
    writeStart(problemId, null);
    setState({ problemId, startedAt: null });
  }, [problemId]);

  return { running: startedAt !== null, minutes: startedAt === null ? null : elapsedMinutes(startedAt, now), start, clear };
}
