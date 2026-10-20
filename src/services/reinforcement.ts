import type { CatalogProblem, ProblemProgress } from '../types/models';
import { coreRank } from './coreRank';
import { daysBetween } from './cadence';
import { REINFORCE_CONSECUTIVE_WEAK, REINFORCE_MAX_SOLVED_STAGE, REINFORCE_MIN_GAP_DAYS } from './constants';
import { prerequisitesOf } from './topicGraph';

const LEVEL = { easy: 0, medium: 1, hard: 2 } as const;

export interface Reinforcement {
  problem: CatalogProblem;
  // A solved problem comes back as a review; an unsolved Easy is a new problem.
  // The "warm-up" reason itself is never stored: it is recomputed from progress.
  kind: 'new' | 'review';
  target: CatalogProblem;
}

const isSolved = (progress: ProblemProgress | undefined) => progress?.status === 'solved' || progress?.status === 'mastered';
const needsReinforcement = (progress: ProblemProgress | undefined) => progress !== undefined && (progress.struggling || progress.consecutiveWeak >= REINFORCE_CONSECUTIVE_WEAK);

// Problems the learner keeps failing: flagged `struggling` or with a run of weak
// attempts. Longest weak run first, then catalog order.
export function reinforcementTargets(problems: CatalogProblem[], progressByProblem: Map<string, ProblemProgress>): CatalogProblem[] {
  return problems
    .filter((problem) => needsReinforcement(progressByProblem.get(problem.id)) && progressByProblem.get(problem.id)?.status !== 'mastered')
    .sort((left, right) =>
      (progressByProblem.get(right.id)?.consecutiveWeak ?? 0) - (progressByProblem.get(left.id)?.consecutiveWeak ?? 0) ||
      left.neetcodeOrder - right.neetcodeOrder
    );
}

// Could `problem` serve as a warm-up for `target`? An easier problem from the
// same topic, a problem no harder than it from a prerequisite topic, or (when
// nothing is solved yet) any other Easy from the same topic.
function relates(problem: CatalogProblem, target: CatalogProblem): boolean {
  if (problem.id === target.id) return false;
  if (problem.primaryTopic === target.primaryTopic) return LEVEL[problem.difficulty] < LEVEL[target.difficulty] || problem.difficulty === 'easy';
  return prerequisitesOf(target.primaryTopic).includes(problem.primaryTopic) && LEVEL[problem.difficulty] <= LEVEL[target.difficulty];
}

// The one warm-up for the day, or undefined when nothing is struggling or no
// suitable problem exists. For the most-failed problem that has a candidate:
//   1. an unsolved problem one level easier from the same topic (core-first): a
//      new variant of the pattern is the stepping stone that teaches the most, else
//   2. an already-solved easier problem from the same topic (hardest first, so
//      it is the closest stepping stone), else
//   3. an already-solved problem from a prerequisite topic (nearest topic, then
//      hardest first), else
//   4. an unsolved Easy from the same topic, core-first.
// A solved candidate must not already be well retained (stage below
// REINFORCE_MAX_SOLVED_STAGE): re-solving a problem you know cold teaches nothing,
// and a struggling Hard would otherwise bring the same mastered Easy back for weeks.
// A solved problem attempted in the last REINFORCE_MIN_GAP_DAYS - 1 days is
// skipped so it is not served two days running. `excluded` holds skipped ids.
export function selectReinforcement(problems: CatalogProblem[], progressByProblem: Map<string, ProblemProgress>, excluded: Set<string>, today: string): Reinforcement | undefined {
  const usable = (problem: CatalogProblem) => !excluded.has(problem.id) && !needsReinforcement(progressByProblem.get(problem.id));
  const rested = (problem: CatalogProblem) => {
    const last = progressByProblem.get(problem.id)?.lastAttemptDate;
    return !last || daysBetween(last, today) >= REINFORCE_MIN_GAP_DAYS;
  };
  // Hardest first, then the longest-rested, then catalog order.
  const stepping = (left: CatalogProblem, right: CatalogProblem) =>
    LEVEL[right.difficulty] - LEVEL[left.difficulty] ||
    (progressByProblem.get(left.id)?.lastAttemptDate ?? '').localeCompare(progressByProblem.get(right.id)?.lastAttemptDate ?? '') ||
    left.neetcodeOrder - right.neetcodeOrder;

  const unsolved = (problem: CatalogProblem) => !isSolved(progressByProblem.get(problem.id)) && usable(problem);
  const coreFirst = (left: CatalogProblem, right: CatalogProblem) => coreRank(left) - coreRank(right) || left.neetcodeOrder - right.neetcodeOrder;
  for (const target of reinforcementTargets(problems, progressByProblem)) {
    const stepDown = problems
      .filter((problem) => problem.primaryTopic === target.primaryTopic && LEVEL[problem.difficulty] === LEVEL[target.difficulty] - 1 && unsolved(problem))
      .sort(coreFirst)[0];
    if (stepDown) return { problem: stepDown, kind: 'new', target };
    const solved = problems.filter((problem) => relates(problem, target) && isSolved(progressByProblem.get(problem.id)) && usable(problem) && rested(problem)
      && (progressByProblem.get(problem.id)?.reviewStage ?? 0) < REINFORCE_MAX_SOLVED_STAGE);
    const sameTopic = solved.filter((problem) => problem.primaryTopic === target.primaryTopic && LEVEL[problem.difficulty] < LEVEL[target.difficulty]).sort(stepping)[0];
    if (sameTopic) return { problem: sameTopic, kind: 'review', target };
    for (const prerequisite of prerequisitesOf(target.primaryTopic)) {
      const fromPrerequisite = solved.filter((problem) => problem.primaryTopic === prerequisite).sort(stepping)[0];
      if (fromPrerequisite) return { problem: fromPrerequisite, kind: 'review', target };
    }
    const unsolvedEasy = problems
      .filter((problem) => problem.primaryTopic === target.primaryTopic && problem.difficulty === 'easy' && problem.id !== target.id && unsolved(problem))
      .sort(coreFirst)[0];
    if (unsolvedEasy) return { problem: unsolvedEasy, kind: 'new', target };
  }
  return undefined;
}

// Recomputes the reason for an already-stored plan item (the reason is not
// persisted): the struggling problem `problem` would be a warm-up for, if any.
// A review that is still due is a real review, not a warm-up. Approximate by
// design: once logged, a real easier same-topic review is indistinguishable.
export function warmUpTargetFor(problem: CatalogProblem, kind: 'new' | 'review', problems: CatalogProblem[], progressByProblem: Map<string, ProblemProgress>, dueIds: Set<string>): CatalogProblem | undefined {
  if (kind === 'review' && dueIds.has(problem.id)) return undefined;
  if (needsReinforcement(progressByProblem.get(problem.id))) return undefined;
  if (kind === 'new' && isSolved(progressByProblem.get(problem.id))) return undefined;
  return reinforcementTargets(problems, progressByProblem).find((target) => relates(problem, target));
}
