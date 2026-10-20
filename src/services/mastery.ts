import type { Attempt, CatalogProblem, ProblemList, ProblemProgress, Quality } from '../types/models';
import { PROFICIENT_STAGE } from './constants';
import { coreRank } from './coreRank';
import { topicMastery } from './dailyPlan';
import { effectiveStages } from './patternReview';

// "Is the practice actually helping?" signals, derived entirely from the recorded
// attempts and progress — no extra stored state.

const QUALITY_SCORE: Record<Quality, number> = { weak: 0, partial: 1, strong: 2 };

export type Trajectory = 'improving' | 'flat' | 'declining';

// Direction of the last `window` attempts in a topic, by comparing the mean
// quality of the older half against the newer half.
export function topicTrajectory(
  topic: string,
  attempts: Attempt[],
  problems: CatalogProblem[],
  window = 10
): Trajectory {
  const topicProblemIds = new Set(problems.filter((problem) => problem.primaryTopic === topic).map((problem) => problem.id));
  const recent = attempts
    .filter((attempt) => topicProblemIds.has(attempt.problemId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-window);
  if (recent.length < 4) return 'flat';

  const mid = Math.floor(recent.length / 2);
  const mean = (list: Attempt[]) => list.reduce((sum, a) => sum + QUALITY_SCORE[a.quality], 0) / list.length;
  const delta = mean(recent.slice(mid)) - mean(recent.slice(0, mid));

  if (delta > 0.3) return 'improving';
  if (delta < -0.3) return 'declining';
  return 'flat';
}

export interface TopicMasteryCell {
  topic: string;
  mastery: number;   // [0, 1] mean review-stage progress, struggling counted honestly
  total: number;     // problems in the topic
  attempted: number;
  mastered: number;
  // Every core problem in the topic is at review stage >= PROFICIENT_STAGE (see `proficientTopics`).
  proficient: boolean;
}

// The core problems of a set: the NeetCode 75 when the 75 is active, the
// NeetCode 150 otherwise (so the 250 asks for the 150, not the extra 100).
function coreCap(set: ProblemList): 0 | 1 {
  return set === 'nc75' ? 0 : 1;
}

// Progress with each pattern-covered problem standing at its anchor's stage (T22,
// see patternReview.ts). Without `today` the stored stages are used as they are.
function withEffectiveStages(problems: CatalogProblem[], progress: ProblemProgress[], today?: string): ProblemProgress[] {
  if (today === undefined) return progress;
  const stages = effectiveStages(problems, progress, today);
  return progress.map((row) => ({ ...row, reviewStage: stages.get(row.problemId) ?? row.reviewStage }));
}

// Topics where every core problem of the active set has reached
// PROFICIENT_STAGE. One definition for the map star and the topic badges, so the
// two can never disagree. A topic with no core problems never counts. With
// `today`, a due review covered by a fresher solve of the same pattern counts at
// its anchor's stage (pattern-level reviews never re-solve it, T22).
export function proficientTopics(problems: CatalogProblem[], progress: ProblemProgress[], set: ProblemList, today?: string): Set<string> {
  const stageById = new Map(withEffectiveStages(problems, progress, today).map((row) => [row.problemId, row.reviewStage]));
  const cap = coreCap(set);
  const byTopic = new Map<string, CatalogProblem[]>();
  for (const problem of problems) {
    if (coreRank(problem) > cap) continue;
    const list = byTopic.get(problem.primaryTopic) ?? [];
    list.push(problem);
    byTopic.set(problem.primaryTopic, list);
  }
  const proficient = new Set<string>();
  for (const [topic, list] of byTopic) {
    if (list.every((problem) => (stageById.get(problem.id) ?? 0) >= PROFICIENT_STAGE)) proficient.add(topic);
  }
  return proficient;
}

// Per-topic mastery for the constellation visual — the display view (forPriority
// false, so a struggling problem counts as its real low stage, not the 0.5 the
// queue uses to relieve pressure). Ordered by the catalog's topic order.
export function masteryByTopic(problems: CatalogProblem[], progress: ProblemProgress[], set: ProblemList = 'nc150', today?: string): TopicMasteryCell[] {
  const progressByProblem = new Map(withEffectiveStages(problems, progress, today).map((row) => [row.problemId, row]));
  const proficient = proficientTopics(problems, progress, set, today);
  const topics: string[] = [];
  for (const problem of problems) if (!topics.includes(problem.primaryTopic)) topics.push(problem.primaryTopic);

  return topics.map((topic) => {
    const topicProblems = problems.filter((problem) => problem.primaryTopic === topic);
    const cells = topicProblems.map((problem) => progressByProblem.get(problem.id)).filter((row): row is ProblemProgress => row !== undefined);
    return {
      topic,
      mastery: topicMastery(topic, problems, progressByProblem, false),
      total: topicProblems.length,
      attempted: cells.length,
      mastered: cells.filter((row) => row.status === 'mastered').length,
      proficient: proficient.has(topic)
    };
  });
}

export interface StrugglingProblem { problemId: string; consecutiveWeak: number; }

// Problems currently flagged `struggling`, weakest run first — the "needs a
// different approach" list.
export function strugglingProblems(progress: ProblemProgress[]): StrugglingProblem[] {
  return progress
    .filter((row) => row.struggling)
    .sort((a, b) => b.consecutiveWeak - a.consecutiveWeak)
    .map((row) => ({ problemId: row.problemId, consecutiveWeak: row.consecutiveWeak }));
}
