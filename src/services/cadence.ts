import {
  CADENCE_NEW_HISTORY_DAYS,
  CADENCE_REGULAR_DAYS_PER_WEEK,
  CADENCE_RETURNING_GAP_DAYS,
  CADENCE_WINDOW_DAYS
} from './constants';
import type { Attempt } from '../types/models';

// How often the user practises, derived purely from the attempt dates. The
// recommendation rules branch on it; nothing here is stored, so it cannot drift.
export type CadenceProfile = 'new' | 'returning' | 'regular' | 'occasional';

export interface Cadence {
  profile: CadenceProfile;
  activeDaysLast28: number;
  // Whole days from the last active day before `today` to `today`; null with no history.
  daysSinceLastActive: number | null;
}

// Whole calendar days from `from` to `to` (both YYYY-MM-DD). DST-proof: both ends
// are read as UTC midnights.
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// Only days strictly *before* `today` count, so the profile — and therefore the
// day's plan shape — is the same before and after the user logs today's first
// attempt (the same-day replay depends on that stability). A user returning from
// a gap stays `returning` until tomorrow; the profile clears itself once they
// have practised.
export function cadenceFor(attempts: Pick<Attempt, 'attemptedOn'>[], today: string): Cadence {
  const past = [...new Set(attempts.map((attempt) => attempt.attemptedOn).filter((date) => date < today))].sort();
  if (past.length === 0) return { profile: 'new', activeDaysLast28: 0, daysSinceLastActive: null };

  const daysSinceLastActive = daysBetween(past[past.length - 1], today);
  const activeDaysLast28 = past.filter((date) => daysBetween(date, today) <= CADENCE_WINDOW_DAYS).length;
  const historyDays = daysBetween(past[0], today);
  // 4+ days a week, measured over the window — or over the whole history while it
  // is shorter than the window (28 days → 16 active days).
  const requiredActiveDays = Math.floor((Math.min(historyDays, CADENCE_WINDOW_DAYS) * CADENCE_REGULAR_DAYS_PER_WEEK) / 7);

  const profile: CadenceProfile =
    daysSinceLastActive >= CADENCE_RETURNING_GAP_DAYS ? 'returning'
      : historyDays < CADENCE_NEW_HISTORY_DAYS ? 'new'
        : activeDaysLast28 >= requiredActiveDays ? 'regular'
          : 'occasional';
  return { profile, activeDaysLast28, daysSinceLastActive };
}
