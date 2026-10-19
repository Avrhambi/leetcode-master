// Tunable thresholds for the coaching rules. Kept in one place so they are
// visible and adjustable without hunting through the algorithm modules.

// Consecutive weak attempts on one problem before it is flagged `struggling`:
// its reviews de-escalate and it stops pulling its topic up the new-problem queue.
export const STRUGGLE_THRESHOLD = 3;

// Days until the next review for a struggling problem, indexed by
// `min(consecutiveWeak - STRUGGLE_THRESHOLD, STRUGGLE_BACKOFF_DAYS.length - 1)`.
// Replaces the flat "review tomorrow" so a blind-spot problem does not return
// every single day forever.
export const STRUGGLE_BACKOFF_DAYS = [2, 4, 7] as const;

// Streak grace: a returning user does not lose the streak on the first missed
// day. One grace day is granted per rolling 7 active days.
export const STREAK_GRACE_PER_WEEK = 1;
export const STREAK_GRACE_ACTIVE_DAYS_PER_GRANT = 7;

// XP awarded per attempt, keyed by the derived `quality`. Both inputs to the XP
// calculation — `quality` and "first attempt of the day" — are reconstructible
// from a stored `Attempt` row alone, so the Dexie v3 replay produces the same
// lifetime total the live award path did. A new-vs-review multiplier is
// deliberately omitted: `kind` lives on `RecommendationEvent`, not `Attempt`,
// and an attempt logged from the catalog with no open recommendation has none —
// the replay could not reproduce it.
export const XP_BY_QUALITY = { strong: 20, partial: 12, weak: 5 } as const;

// A second (or later) attempt for the same problem on the same calendar day is
// reinforcement, not fresh progress — it earns a token fraction of the XP.
export const XP_REPEAT_SAME_DAY_MULTIPLIER = 0.25;

// Consistency multiplier: the current streak length (consecutive active days
// ending on the attempt's date — grace-free, so it is reconstructible from the
// `attempts` history alone and the v4 replay agrees with the live award) scales
// the XP for that attempt. Breaking a streak visibly slows leveling.
//
// Tiers keyed by `[minStreakDays, multiplier]`, highest applicable wins. The last
// entry is the hard ceiling — a longer streak never multiplies by more than 1.5.
export const XP_STREAK_MULTIPLIER_TIERS = [
  [0, 1.0],
  [3, 1.1],
  [7, 1.25],
  [14, 1.5]
] as const;

// Multiplier for a streak of `streakDays` consecutive active days.
export function xpStreakMultiplier(streakDays: number): number {
  let multiplier = 1.0;
  for (const [min, value] of XP_STREAK_MULTIPLIER_TIERS) {
    if (streakDays >= min) multiplier = value;
  }
  return multiplier;
}

// Level curve: gentle square-root growth. level = floor(sqrt(xp / XP_PER_LEVEL_UNIT)),
// so level 1 at 50 XP, level 2 at 200, level 3 at 450, level 4 at 800.
export const XP_PER_LEVEL_UNIT = 50;

// Milestone badges — the named checkpoints across all three progression axes
// (consistency / mastery / volume, plus level). Every predicate is a pure,
// monotonic check of progress + attempts + catalog + streak + level; the earned
// set is stored as a monotonic union so a later weak attempt (which resets a
// review stage) or a broken streak can never un-earn one. Ordered by axis, then
// ascending within an axis, so the shelf reads as a progression.
export const BADGES = [
  // Volume / mastery — first steps
  { id: 'first-solve', label: 'First solve', hint: 'Solve any problem for the first time.' },
  { id: 'first-mastered', label: 'First mastered', hint: 'Take a problem all the way to mastered.' },
  // Consistency
  { id: 'week-streak', label: 'Week streak', hint: 'Practise seven calendar days in a row.' },
  { id: 'ten-day-streak', label: 'Ten-day streak', hint: 'Practise ten calendar days in a row.' },
  { id: 'month-streak', label: 'Month streak', hint: 'Practise thirty calendar days in a row.' },
  { id: 'century-streak', label: 'Hundred-day streak', hint: 'Practise a hundred calendar days in a row.' },
  // Mastery
  { id: 'topic-cleared', label: 'Topic cleared', hint: 'Reach mastered on every problem in one topic.' },
  { id: 'five-topics-cleared', label: 'Five topics cleared', hint: 'Reach mastered on every problem in five topics.' },
  { id: 'all-mastered', label: 'All mastered', hint: 'Reach mastered on every problem in the catalog.' },
  // Volume
  { id: 'half-catalog', label: 'Halfway', hint: 'Attempt 75 problems from the catalog.' },
  { id: 'century', label: 'Century', hint: 'Attempt 100 problems from the catalog.' },
  // Level
  { id: 'level-5', label: 'Level 5', hint: 'Reach level 5.' },
  { id: 'level-10', label: 'Level 10', hint: 'Reach level 10.' }
] as const;

export type BadgeId = (typeof BADGES)[number]['id'];

// Streak lengths (calendar days in a row) that unlock the consistency badges.
export const BADGE_STREAK_WEEK = 7;
export const BADGE_STREAK_DAYS = 10;
export const BADGE_STREAK_MONTH = 30;
export const BADGE_STREAK_CENTURY = 100;
// Attempted-problem counts that unlock `half-catalog` / `century`.
export const BADGE_ATTEMPTED_HALF = 75;
export const BADGE_ATTEMPTED_CENTURY = 100;
// Topics cleared for `five-topics-cleared`.
export const BADGE_TOPICS_CLEARED = 5;
// Levels that unlock the level badges.
export const BADGE_LEVEL_MID = 5;
export const BADGE_LEVEL_HIGH = 10;
