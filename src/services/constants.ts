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

// Reinforcement (warm-up) rules: a problem with this many consecutive weak
// attempts (or flagged `struggling`) gets one easier warm-up in the daily plan.
// A solved warm-up candidate must have rested this many days since its last
// attempt, so it is not served two days in a row.
export const REINFORCE_CONSECUTIVE_WEAK = 2;
export const REINFORCE_MIN_GAP_DAYS = 2;

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

// Why each reward exists (T6). The app's goals are (1) retain what you learned,
// (2) fix weak topics instead of avoiding them, (3) log honestly, (4) practise
// steadily, not necessarily daily. Every rule below pays for exactly one of them,
// and every one is additive or a max(), so a re-replay can only raise lifetime XP:
//   retention bonus    goal 1. A due review recalled at stage >= 1 proves the spacing worked.
//   comeback bonus     goal 2. Turning a struggling problem strong is the hardest, most valuable event.
//   weekly multiplier  goal 4. 3 active days a week is a fine schedule; it earns the same tiers a daily streak does.
//   weak attempts      goal 3. They keep their base XP, so honest logging is never punished.

// Bonus XP added to the base of a strong or partial first-of-day attempt on a review that is due,
// indexed by the review stage the problem was at BEFORE the attempt (stage 0 earns none).
export const XP_RETENTION_BONUS_BY_STAGE = [0, 2, 4, 6, 8, 10] as const;
// Bonus XP for the strong attempt that ends a run of STRUGGLE_THRESHOLD+ weak attempts on a problem.
export const XP_COMEBACK_BONUS = 25;

// Weekly streak: consecutive calendar weeks (Monday start) with at least
// WEEKLY_STREAK_MIN_ACTIVE_DAYS active days. Grace-free and replayable from the
// attempt dates, like the daily streak. The week in progress never breaks the
// streak: it counts once it reaches the minimum, and is skipped until then.
export const WEEKLY_STREAK_MIN_ACTIVE_DAYS = 3;
// `[minWeeks, multiplier]`, highest applicable wins; same ceiling as the daily tiers.
export const XP_WEEKLY_MULTIPLIER_TIERS = [
  [0, 1.0],
  [2, 1.1],
  [4, 1.25],
  [8, 1.5]
] as const;

export function xpWeeklyMultiplier(weeks: number): number {
  let multiplier = 1.0;
  for (const [min, value] of XP_WEEKLY_MULTIPLIER_TIERS) {
    if (weeks >= min) multiplier = value;
  }
  return multiplier;
}

// The consistency multiplier is the better of the two streaks, so a daily user
// loses nothing and a steady 3-days-a-week user can reach the same tiers.
export function xpConsistencyMultiplier(streakDays: number, streakWeeks: number): number {
  return Math.max(xpStreakMultiplier(streakDays), xpWeeklyMultiplier(streakWeeks));
}

// Level curve: gentle square-root growth. level = floor(sqrt(xp / XP_PER_LEVEL_UNIT)),
// so level 1 at 50 XP, level 2 at 200, level 3 at 450, level 4 at 800.
export const XP_PER_LEVEL_UNIT = 50;

// Milestone badges — the named checkpoints across the progression axes
// (retention / consistency / mastery / volume, plus level). Every predicate is a
// pure, monotonic check of progress + attempts + catalog + streaks + level; the
// earned set is stored as a monotonic union so a later weak attempt (which resets
// a review stage) or a broken streak can never un-earn one. Ordered by axis, then
// ascending within an axis, so the shelf reads retention -> consistency ->
// mastery -> volume -> level. `hint` is the set-neutral text; `badgeHint` in
// badges.ts swaps in the active set's numbers where a badge depends on it.
export const BADGES = [
  // Retention — problems that survived their spaced reviews
  { id: 'retained-10', label: 'Retained 10', hint: 'Get 10 problems to review stage 3 or beyond.' },
  { id: 'retained-25', label: 'Retained 25', hint: 'Get 25 problems to review stage 3 or beyond.' },
  { id: 'retained-50', label: 'Retained 50', hint: 'Get 50 problems to review stage 3 or beyond.' },
  // Consistency — daily streaks, weekly streaks, and coming back
  { id: 'week-streak', label: 'Week streak', hint: 'Practise seven calendar days in a row.' },
  { id: 'ten-day-streak', label: 'Ten-day streak', hint: 'Practise ten calendar days in a row.' },
  { id: 'month-streak', label: 'Month streak', hint: 'Practise thirty calendar days in a row.' },
  { id: 'century-streak', label: 'Hundred-day streak', hint: 'Practise a hundred calendar days in a row.' },
  { id: 'weeks-4', label: '4 consistent weeks', hint: 'Practise on 3+ days a week, four weeks in a row.' },
  { id: 'weeks-12', label: '12 consistent weeks', hint: 'Practise on 3+ days a week, twelve weeks in a row.' },
  { id: 'weeks-26', label: '26 consistent weeks', hint: 'Practise on 3+ days a week, twenty-six weeks in a row.' },
  { id: 'welcome-back', label: 'Welcome back', hint: 'Practise again after a break of a week or more.' },
  // Mastery
  { id: 'first-mastered', label: 'First mastered', hint: 'Take a problem all the way to mastered.' },
  { id: 'foundations-solid', label: 'Foundations solid', hint: 'Reach solid skill in every foundations topic.' },
  { id: 'comeback', label: 'Comeback', hint: 'Solve a problem you were struggling with.' },
  { id: 'topic-cleared', label: 'Topic proficient', hint: 'Get every core problem in one topic to review stage 3.' },
  { id: 'five-topics-cleared', label: 'Five topics proficient', hint: 'Get every core problem in five topics to review stage 3.' },
  { id: 'all-mastered', label: 'All mastered', hint: 'Reach mastered on every problem in your set.' },
  // Volume
  { id: 'first-solve', label: 'First solve', hint: 'Solve any problem for the first time.' },
  { id: 'half-catalog', label: 'Halfway', hint: 'Attempt half the problems in your set.' },
  { id: 'century', label: 'Century', hint: 'Attempt up to 100 problems from your set.' },
  { id: 'list-75', label: 'NeetCode 75 complete', hint: 'Solve every problem in the NeetCode 75.' },
  { id: 'list-150', label: 'NeetCode 150 complete', hint: 'Solve every problem in the NeetCode 150.' },
  { id: 'list-250', label: 'NeetCode 250 complete', hint: 'Solve every problem in the NeetCode 250.' },
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
// Weekly-streak lengths (consecutive consistent weeks) for `weeks-4` / `weeks-12` / `weeks-26`.
export const BADGE_WEEKS = [4, 12, 26] as const;
// Retention badges count problems at or beyond this review stage ...
export const BADGE_RETAINED_STAGE = 3;
// ... and unlock at these counts: `retained-10` / `retained-25` / `retained-50`.
export const BADGE_RETAINED_COUNTS = [10, 25, 50] as const;
// A topic is "proficient" when every core problem in it is at least this review stage.
export const PROFICIENT_STAGE = 3;
// `century` asks for this many attempted problems, or the whole set when the set is smaller.
export const BADGE_ATTEMPTED_CENTURY = 100;
// Topics proficient for `five-topics-cleared`.
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
// Review overload: with this many reviews due, the plan pauses new problems and
// serves up to REVIEW_OVERLOAD_SLOTS reviews until the backlog is back under the
// threshold. Each new problem spawns ~5 reviews, so a plan capped at four items
// that keeps adding new problems cannot clear its own reviews: simulated over a
// year, a typical learner's due backlog grew to 100+ (daily) without this rule and
// stays at or under 25 with it, at every cadence.
export const REVIEW_OVERLOAD_DUE = 12;
export const REVIEW_OVERLOAD_SLOTS = 4;
// An occasional user stays in a topic longer: the "recently served topic"
// priority penalty is milder than the default 0.35, so scarce sessions go to
// finishing a topic's ceiling instead of hopping between topics.
export const OCCASIONAL_RECENT_TOPIC_PENALTY = 0.7;

// Session time (see sessionTime.ts). Expected minutes per plan item before the
// user has logged their own durations: a review re-solves a problem already
// seen, so it is quicker than a first solve. Once SESSION_CALIBRATION_MIN_SAMPLES
// durations are logged for a (new / review, difficulty) pair, the median of the
// last SESSION_CALIBRATION_WINDOW replaces the default.
export const SESSION_DEFAULT_MINUTES = {
  new: { easy: 20, medium: 35, hard: 50 },
  review: { easy: 10, medium: 20, hard: 30 }
} as const;
export const SESSION_CALIBRATION_MIN_SAMPLES = 3;
export const SESSION_CALIBRATION_WINDOW = 10;
// The time budgets on offer ("I have 30 / 45 / 60 minutes"). No budget is the default.
export const SESSION_BUDGET_OPTIONS = [30, 45, 60] as const;

// Days without a backup before the side panel quietly suggests one. With no
// backup on record the clock starts at the first attempt, so a new user is not
// nagged on day one.
export const BACKUP_REMINDER_DAYS = 14;
