import type { Attempt, CatalogProblem, ProblemList, ProblemProgress } from '../types/models';
import {
  BADGES, BADGE_ATTEMPTED_CENTURY, BADGE_LEVEL_HIGH, BADGE_LEVEL_MID, BADGE_RETAINED_COUNTS,
  BADGE_RETAINED_STAGE, BADGE_STREAK_CENTURY, BADGE_STREAK_DAYS, BADGE_STREAK_MONTH, BADGE_STREAK_WEEK,
  BADGE_TOPICS_CLEARED, BADGE_WEEKS, CADENCE_RETURNING_GAP_DAYS, PREREQ_SKILL_THRESHOLD, PROFICIENT_STAGE,
  STRUGGLE_THRESHOLD, type BadgeId
} from './constants';
import { daysBetween } from './cadence';
import { stagesBeforeEach } from './gamification';
import { proficientTopics } from './mastery';
import { PROBLEM_SET_LABELS } from './problemSet';
import { topicSkills } from './skill';
import { TOPIC_TIERS } from '../data/topicTiers';

// Pure milestone-badge predicates. Everything is derived from progress + attempts
// + catalog + the already-computed streak lengths — no stored badge state is read
// here. The caller unions the result into the persisted set so a badge, once
// earned, is never lost when a later weak attempt resets a review stage.

export interface BadgeInput {
  progress: ProblemProgress[];
  attempts: Attempt[];
  // The active set's problems (feeds proficiency, volume and "all mastered").
  problems: CatalogProblem[];
  // The whole catalog, for the "list complete" badges: finishing the 150 counts
  // even while the 75 is the active set.
  allProblems?: CatalogProblem[];
  problemSet?: ProblemList;
  currentStreakDays: number;
  weeklyStreakWeeks?: number;
  level: number;
}

// True when the attempt dates contain a break of CADENCE_RETURNING_GAP_DAYS or
// more between two active days — i.e. the user practised again after a gap,
// which is exactly when `cadenceFor` reads as `returning` on the day before.
function practisedAfterGap(attempts: Attempt[]): boolean {
  const dates = [...new Set(attempts.map((attempt) => attempt.attemptedOn))].sort();
  return dates.some((date, index) => index > 0 && daysBetween(dates[index - 1], date) >= CADENCE_RETURNING_GAP_DAYS);
}

// A strong attempt that ended a run of STRUGGLE_THRESHOLD+ weak ones on a problem.
function hasComeback(attempts: Attempt[]): boolean {
  const prior = stagesBeforeEach(attempts);
  return attempts.some((attempt) => attempt.quality === 'strong' && (prior.get(attempt.id)?.consecutiveWeak ?? 0) >= STRUGGLE_THRESHOLD);
}

// Every tier-1 topic present in the set has reached the prerequisite skill threshold.
function foundationsSolid(attempts: Attempt[], problems: CatalogProblem[]): boolean {
  const topics = [...new Set(problems.map((problem) => problem.primaryTopic))].filter((topic) => TOPIC_TIERS[topic] === 1);
  if (topics.length === 0) return false;
  const skills = topicSkills(attempts, problems);
  return topics.every((topic) => (skills.get(topic) ?? 0) >= PREREQ_SKILL_THRESHOLD);
}

// Attempted-problem counts that unlock `half-catalog` / `century` for a set of
// `setSize` problems: half the set, and BADGE_ATTEMPTED_CENTURY (or the whole set
// when it is smaller than that).
export function volumeTargets(setSize: number): { half: number; century: number } {
  return { half: Math.ceil(setSize / 2), century: Math.min(BADGE_ATTEMPTED_CENTURY, setSize) };
}

// The badge ids currently satisfied by this state, in BADGES order.
export function badgesEarned(input: BadgeInput): BadgeId[] {
  const { progress, attempts, problems, currentStreakDays, level } = input;
  const allProblems = input.allProblems ?? problems;
  const problemSet = input.problemSet ?? 'nc150';
  const weeks = input.weeklyStreakWeeks ?? 0;
  const solvedIds = new Set(progress.filter((row) => row.status === 'solved' || row.status === 'mastered').map((row) => row.problemId));
  const masteredIds = new Set(progress.filter((row) => row.status === 'mastered').map((row) => row.problemId));
  const retained = progress.filter((row) => row.reviewStage >= BADGE_RETAINED_STAGE).length;
  const inSetIds = new Set(problems.map((problem) => problem.id));
  const attemptedInSet = new Set(attempts.map((attempt) => attempt.problemId).filter((id) => inSetIds.has(id))).size;
  const proficient = proficientTopics(problems, progress, problemSet).size;
  const volume = volumeTargets(problems.length);

  const earned = new Set<BadgeId>();
  const earn = (id: BadgeId, condition: boolean) => { if (condition) earned.add(id); };

  earn('first-solve', solvedIds.size >= 1);
  earn('first-mastered', masteredIds.size >= 1);

  earn('retained-10', retained >= BADGE_RETAINED_COUNTS[0]);
  earn('retained-25', retained >= BADGE_RETAINED_COUNTS[1]);
  earn('retained-50', retained >= BADGE_RETAINED_COUNTS[2]);

  earn('week-streak', currentStreakDays >= BADGE_STREAK_WEEK);
  earn('ten-day-streak', currentStreakDays >= BADGE_STREAK_DAYS);
  earn('month-streak', currentStreakDays >= BADGE_STREAK_MONTH);
  earn('century-streak', currentStreakDays >= BADGE_STREAK_CENTURY);
  earn('weeks-4', weeks >= BADGE_WEEKS[0]);
  earn('weeks-12', weeks >= BADGE_WEEKS[1]);
  earn('weeks-26', weeks >= BADGE_WEEKS[2]);
  earn('welcome-back', practisedAfterGap(attempts));

  earn('comeback', hasComeback(attempts));
  earn('foundations-solid', foundationsSolid(attempts, problems));
  earn('topic-cleared', proficient >= 1);
  earn('five-topics-cleared', proficient >= BADGE_TOPICS_CLEARED);
  earn('all-mastered', problems.length > 0 && problems.every((problem) => masteredIds.has(problem.id)));

  earn('half-catalog', problems.length > 0 && attemptedInSet >= volume.half);
  earn('century', problems.length > 0 && attemptedInSet >= volume.century);
  for (const [id, list] of [['list-75', 'nc75'], ['list-150', 'nc150'], ['list-250', 'nc250']] as const) {
    const members = allProblems.filter((problem) => problem.lists.includes(list));
    earn(id, members.length > 0 && members.every((problem) => solvedIds.has(problem.id)));
  }

  earn('level-5', level >= BADGE_LEVEL_MID);
  earn('level-10', level >= BADGE_LEVEL_HIGH);
  return BADGES.filter((badge) => earned.has(badge.id)).map((badge) => badge.id);
}

// The hint for a badge, with the active set's numbers where the badge depends on
// it. Everything else uses the set-neutral hint from `BADGES`.
export function badgeHint(id: BadgeId, problemSet: ProblemList, setSize: number): string {
  const setLabel = PROBLEM_SET_LABELS[problemSet];
  const volume = volumeTargets(setSize);
  const core = problemSet === 'nc75' ? 'NeetCode 75' : 'NeetCode 150';
  switch (id) {
    case 'half-catalog': return `Attempt ${volume.half} problems from the ${setLabel}.`;
    case 'century': return `Attempt ${volume.century} problems from the ${setLabel}.`;
    case 'topic-cleared': return `Get every ${core} problem in one topic to review stage ${PROFICIENT_STAGE}.`;
    case 'five-topics-cleared': return `Get every ${core} problem in ${BADGE_TOPICS_CLEARED} topics to review stage ${PROFICIENT_STAGE}.`;
    case 'all-mastered': return `Reach mastered on every problem in the ${setLabel}.`;
    default: return BADGES.find((badge) => badge.id === id)?.hint ?? '';
  }
}

// Merge freshly-earned badges into the stored set without losing any, ordered by
// BADGES so the shelf is stable. Unknown ids in `stored` (e.g. a badge removed in
// a later release) are dropped rather than shown as blanks.
export function mergeBadges(stored: string[], earned: BadgeId[]): string[] {
  const has = new Set<string>([...stored, ...earned]);
  return BADGES.filter((badge) => has.has(badge.id)).map((badge) => badge.id);
}
