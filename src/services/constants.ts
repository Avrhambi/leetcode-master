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

// Review stage rules (see progressAfterAttempt). A strong recall at least
// LATE_RECALL_GAP_RATIO x later than scheduled advances LATE_RECALL_STAGE_JUMP
// stages. A first-ever independent solve that felt easy starts at
// CONFIDENT_FIRST_SOLVE_STAGE (review in 7 days instead of 3).
export const LATE_RECALL_GAP_RATIO = 2;
export const LATE_RECALL_STAGE_JUMP = 2;
export const CONFIDENT_FIRST_SOLVE_STAGE = 2;

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

// Topic skill (see skill.ts): an Elo-style rating in [0, 1] replayed from the
// `attempts` history. Each attempt's quality is the "result" and the problem's
// difficulty is the "opponent rating". Nothing here is stored.
export const SKILL_DIFFICULTY_RATING = { easy: 0.15, medium: 0.45, hard: 0.75 } as const;
export const SKILL_QUALITY_RESULT = { strong: 1, partial: 0.5, weak: 0 } as const;
// Step size of one attempt, and the width of the logistic expected-result curve.
export const SKILL_K = 0.25;
export const SKILL_SCALE = 0.15;
// A repeat of the same problem on the same calendar day moves skill by this fraction (mirrors XP).
export const SKILL_REPEAT_SAME_DAY_MULTIPLIER = 0.25;
// Skill at which a topic's new problems target Medium / Hard. Two strong Easy
// solves clear the first from a standing start; two or three strong Mediums
// clear the second.
export const SKILL_MEDIUM_THRESHOLD = 0.25;
export const SKILL_HARD_THRESHOLD = 0.6;

// A topic whose prerequisites sit below this skill has its new-problem priority
// multiplied by PREREQ_PRIORITY_PENALTY. A penalty, never a lock.
export const PREREQ_SKILL_THRESHOLD = SKILL_MEDIUM_THRESHOLD;
export const PREREQ_PRIORITY_PENALTY = 0.5;
// New-problem priority multiplier for a topic the learner last failed while its
// skill is still below the Medium threshold: back off instead of flooding it.
export const FAILING_TOPIC_PRIORITY_PENALTY = 0.6;

// Practice cadence (see cadence.ts): how often the user practises, derived from
// the active dates in the `attempts` history. Never stored.
//   new         under CADENCE_NEW_HISTORY_DAYS days since the first attempt (or none yet)
//   returning   last active CADENCE_RETURNING_GAP_DAYS+ days ago
//   regular     4+ active days a week on average over the last CADENCE_WINDOW_DAYS (or over the
//               whole history while it is shorter, so a daily newcomer is regular within a week)
//   occasional  everyone else
export const CADENCE_WINDOW_DAYS = 28;
export const CADENCE_REGULAR_DAYS_PER_WEEK = 4;
export const CADENCE_RETURNING_GAP_DAYS = 7;
export const CADENCE_NEW_HISTORY_DAYS = 7;
// Review slots in a returning user's re-entry plan. The plan keeps exactly one
// new-problem slot and the rest of the backlog stays in the review queue.
export const RETURNING_MAX_REVIEW_SLOTS = 3;
// An occasional user stays in a topic longer: the "recently served topic"
// priority penalty is milder than the default 0.35, so scarce sessions go to
// finishing a topic's ceiling instead of hopping between topics.
export const OCCASIONAL_RECENT_TOPIC_PENALTY = 0.7;
