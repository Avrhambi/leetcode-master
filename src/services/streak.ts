import { STREAK_GRACE_ACTIVE_DAYS_PER_GRANT, STREAK_GRACE_PER_WEEK, WEEKLY_GOAL_OPTIONS, WEEKLY_STREAK_MIN_ACTIVE_DAYS } from './constants';

// Streak with grace days: a returning user does not lose the whole streak on the
// first missed day. Pure — the caller reads/writes the grace state from Dexie.

export interface StreakGraceState {
  graceRemaining: number;
  graceRefreshedOn: string; // YYYY-MM-DD
}

export interface StreakResult {
  streak: number;
  // The grace allowance to persist. This is the refreshed allowance BEFORE the
  // walk consumes any of it — grace usage is re-derived from `activeDates` on
  // every call, so `currentStreak` is idempotent for a given
  // (activeDates, graceState, now). Persisting a decremented balance would
  // double-spend on the next render.
  graceState: StreakGraceState;
  // Grace days spent to bridge gaps in the current streak, for display only.
  graceDaysUsed: number;
}

function toKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// Consecutive active days ending on `endDate` (inclusive), with NO grace. Walks
// back one calendar day at a time until a gap. Unlike `currentStreak`, this is a
// pure function of `activeDates` + `endDate` — no persisted grace clock — so the
// XP award path and the `replayXp` fold agree by construction, keeping lifetime
// XP reconstructible from the `attempts` history alone.
//
// If `endDate` itself has no attempt the streak is 0 (the caller passes the
// attempt's own `attemptedOn`, which is always active by the time this is used).
export function streakEndingOn(activeDates: Set<string>, endDate: string): number {
  const parts = endDate.split('-').map(Number);
  const cursor = new Date(parts[0], parts[1] - 1, parts[2]);
  let streak = 0;
  while (activeDates.has(toKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Consecutive consistent calendar weeks (Monday start, at least
// WEEKLY_STREAK_MIN_ACTIVE_DAYS active days each) ending with the week that
// contains `endDate`. Like `streakEndingOn` it is grace-free and a pure function
// of `activeDates` + `endDate`, so the XP award and the `replayXp` fold agree.
// Only dates up to `endDate` count, and the week in progress never breaks the
// streak: it adds one once it has reached the minimum and is skipped until then.
export function weeklyStreakEndingOn(activeDates: Set<string>, endDate: string): number {
  const monday = mondayOf(endDate);
  let weeks = 0;
  let current = true;
  while (true) {
    if (activeDaysInWeekOf(activeDates, monday, endDate) >= WEEKLY_STREAK_MIN_ACTIVE_DAYS) weeks += 1;
    else if (!current) break;
    current = false;
    monday.setDate(monday.getDate() - 7);
  }
  return weeks;
}

function mondayOf(dateKey: string): Date {
  const parts = dateKey.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
}

// Active days in the Monday-start week beginning `monday`, counting only dates up to `endDate`.
function activeDaysInWeekOf(activeDates: Set<string>, monday: Date, endDate: string): number {
  let activeDays = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const key = toKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset));
    if (key <= endDate && activeDates.has(key)) activeDays += 1;
  }
  return activeDays;
}

// Active days so far in the calendar week (Monday start) that contains `endDate`:
// the number the weekly streak and the weekly goal both measure.
export function activeDaysThisWeek(activeDates: Set<string>, endDate: string): number {
  return activeDaysInWeekOf(activeDates, mondayOf(endDate), endDate);
}

// The stored `weeklyGoalDays` setting. Anything unknown (or no row) means no goal.
export function parseWeeklyGoal(value: string | undefined): number | null {
  return WEEKLY_GOAL_OPTIONS.find((option) => String(option) === value) ?? null;
}

// Refresh the grace allowance: grant STREAK_GRACE_PER_WEEK once every
// STREAK_GRACE_ACTIVE_DAYS_PER_GRANT active days. `activeDates` is the set of
// YYYY-MM-DD strings on which the user recorded at least one attempt.
export function refreshGrace(state: StreakGraceState, activeDates: Set<string>, today: string): StreakGraceState {
  const activeSince = [...activeDates].filter((date) => date > state.graceRefreshedOn && date <= today).length;
  if (activeSince < STREAK_GRACE_ACTIVE_DAYS_PER_GRANT) return state;
  const grants = Math.floor(activeSince / STREAK_GRACE_ACTIVE_DAYS_PER_GRANT);
  return {
    graceRemaining: Math.min(state.graceRemaining + grants * STREAK_GRACE_PER_WEEK, STREAK_GRACE_PER_WEEK),
    graceRefreshedOn: today
  };
}

// Current streak length. Walks back from today over active dates; the first
// missing day consumes a grace day and the walk continues, until grace runs out.
export function currentStreak(activeDates: Set<string>, graceState: StreakGraceState, now = new Date()): StreakResult {
  const today = toKey(now);
  const refreshed = refreshGrace(graceState, activeDates, today);

  let streak = 0;
  let graceLeft = refreshed.graceRemaining;
  let graceDaysUsed = 0;
  // Grace days spent walking a gap we have not yet bridged. Committed to
  // `graceDaysUsed` only when a later active day is reached; dropped if the walk
  // dead-ends (a gap before the user's first-ever attempt bridged nothing).
  let pendingGrace = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // If today has no attempt yet, don't break the streak — start counting from
  // yesterday (matches the old behaviour where the streak is "days in a row up
  // to and including the last active day").
  if (!activeDates.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  while (true) {
    const key = toKey(cursor);
    if (activeDates.has(key)) {
      streak += 1;
      graceDaysUsed += pendingGrace;
      pendingGrace = 0;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (graceLeft > 0 && streak > 0) {
      graceLeft -= 1;
      pendingGrace += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }

  return { streak, graceDaysUsed, graceState: refreshed };
}
