import type { Attempt, CatalogProblem, ProblemProgress } from '../types/models';
import { TIER_LABELS, topicTier } from '../data/topicTiers';
import { coreRank } from './coreRank';
import { daysBetween, type CadenceProfile } from './cadence';
import type { DailyPlanItem } from './dailyPlan';
import { topicSkills, targetDifficulty } from './skill';
import { importedIds } from './importKnown';

// "Why this problem today?" One short line per plan item, read from what
// selection already looks at (progress, topic skill, cadence). Nothing is stored
// and nothing here feeds back into selection.
//
// Every line is a fact that holds for the item as stored, not a re-run of the
// selector: the plan is replayed from stored recommendations all day, so the
// state it was picked from is gone. Where the exact reason cannot be recovered
// it says the less specific true thing ("was due for today"), never a guess.
// The item's title already says New / Review / Warm-up, so the line doesn't repeat it.
// Skill and "has this topic been started" read attempts from *before today*, so
// logging the item does not rewrite its own line.

export interface PlanReasonInput {
  plan: DailyPlanItem[];
  // The in-set problems the plan was drawn from (topic totals), and the whole
  // catalog (so out-of-set history still counts toward skill and "started").
  problems: CatalogProblem[];
  allProblems: CatalogProblem[];
  progress: ProblemProgress[];
  attempts: Attempt[];
  profile: CadenceProfile;
  // Due reviews still to clear before new problems come back (0 = not paused).
  reviewsUntilNew: number;
  today: string;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The weakest-first review order is by last-attempt quality, so these say what
// the last attempt was. Partial covers a hinted solve and a solve that felt hard.
function qualityPhrase(quality: ProblemProgress['lastQuality']): string | undefined {
  if (quality === 'weak') return "Last attempt wasn't solved";
  if (quality === 'partial') return 'Last attempt needed a hint or felt hard';
  return undefined;
}

function reviewReason(progress: ProblemProgress | undefined, today: string, paused: boolean): string {
  const next = progress?.nextReviewDate ?? null;
  // Not due now: it was due when the plan was made and its schedule has moved on
  // since (it is logged). Its earlier overdue count is not recoverable.
  if (next === null || next > today) return 'Was due for today';
  const overdue = daysBetween(next, today);
  const parts: string[] = [];
  const quality = qualityPhrase(progress?.lastQuality ?? null);
  if (quality) parts.push(quality);
  parts.push(overdue > 0 ? `${plural(overdue, 'day')} overdue` : 'due today');
  if (paused) parts.push('reviews first');
  return capitalise(parts.join(' · '));
}

// Reasons for the plan as it stands. Returns a lookup so the per-render work
// (skill replay, topic counts) is done once per plan, not once per item.
export function planReasoner({ plan, problems, allProblems, progress, attempts, profile, reviewsUntilNew, today }: PlanReasonInput): (item: DailyPlanItem) => string {
  const progressByProblem = new Map(progress.map((row) => [row.problemId, row]));
  const before = attempts.filter((attempt) => attempt.attemptedOn < today);
  const skills = topicSkills(before, allProblems, importedIds(progress.map((row) => row.problemId), attempts.map((attempt) => attempt.problemId)));
  const topicOf = new Map(allProblems.map((problem) => [problem.id, problem.primaryTopic]));
  const triedIds = new Set(before.map((attempt) => attempt.problemId));
  const triedAnywhere = new Set<string>();
  for (const id of triedIds) {
    const topic = topicOf.get(id);
    if (topic) triedAnywhere.add(topic);
  }
  // Same condition as the "reviews are piling up" notice: every item is a review.
  const paused = reviewsUntilNew > 0 && plan.length > 0 && plan.every((item) => item.kind === 'review');

  const newReason = (problem: CatalogProblem): string => {
    const topic = problem.primaryTopic;
    const skill = skills.get(topic) ?? 0;
    // A returning user's new problem comes from a topic they have skill in.
    if (profile === 'returning' && skill > 0) return 'Easing back in: a topic you already have skill in';
    // An occasional user's new problems are strictly core-first across topics.
    if (profile === 'occasional') {
      const rank = coreRank(problem);
      if (rank === 0) return 'Core first: from the NeetCode 75';
      if (rank === 1) return 'Core first: from the NeetCode 150';
      return 'Core first: the NeetCode 150 has none left to offer';
    }
    if (!triedAnywhere.has(topic)) return `A topic you haven't started (${TIER_LABELS[topicTier(topic)]})`;
    const inTopic = problems.filter((candidate) => candidate.primaryTopic === topic);
    const tried = inTopic.filter((candidate) => triedIds.has(candidate.id)).length;
    const parts = [tried > 0 ? `${tried} of ${inTopic.length} tried in this topic` : "You've practised this topic before"];
    if (targetDifficulty(skill) === problem.difficulty) parts.push(`${capitalise(problem.difficulty)} fits your level here`);
    return parts.join(' · ');
  };

  return (item) => {
    if (item.reason === 'reinforce') return item.reinforces ? `Warm-up for ${item.reinforces.title}` : 'Warm-up for a problem you keep missing';
    if (item.kind === 'review') return reviewReason(progressByProblem.get(item.problem.id), today, paused);
    return newReason(item.problem);
  };
}
