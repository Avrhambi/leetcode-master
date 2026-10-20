import type { CatalogProblem, Difficulty, ProblemProgress } from '../types/models';
import { targetDifficulty } from './skill';
import { daysBetween } from './cadence';
import { MASTERED_ANCHOR_FRESH_DAYS } from './constants';

// Pattern-level reviews (T22). An interview asks for an *unseen* problem, so what
// has to stay fresh is the pattern, not each problem's answer. A due review is
// "covered" while a harder-or-equal problem of the same topic was solved strongly
// *after* it and is itself still inside its review interval: that later solve is
// fresher evidence for the same pattern than re-solving the older problem would
// be. Covered reviews leave the plan and the overload count; they stay in the
// review queue (marked optional) for anyone who wants to re-solve them anyway.
//
// Only reviews whose last attempt was strong or partial can be covered, and only
// a strong solve covers. A failed or struggling problem is never covered.
//
// Everything is derived from progress rows on every call: nothing is stored, the
// attempt rows and the review stage rules are unchanged, so XP and badges replay
// exactly as before.

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

// Which solves count as evidence for which reviews: an equal or harder problem,
// and a Medium for a Hard too (NeetCode's Hards mostly combine a topic's Medium
// patterns, so a fresh Medium solve keeps the pattern warm). An Easy never
// vouches for a Medium.
function coversDifficulty(anchor: Difficulty, review: Difficulty): boolean {
  return DIFFICULTY_RANK[anchor] >= DIFFICULTY_RANK[review] || (anchor === 'medium' && review === 'hard');
}

// A review that can be covered: last attempt strong (a maintenance review), or
// partial (solved with a hint): a later clean solve of the same pattern at that
// difficulty or above closes the gap the hint showed. A failed problem is never
// covered; it has to be solved itself.
function coverable(row: ProblemProgress | undefined): row is ProblemProgress {
  return row !== undefined && (row.lastQuality === 'strong' || row.lastQuality === 'partial') && !row.struggling && row.consecutiveWeak === 0 && row.lastAttemptDate !== null;
}

// An anchor must be a clean solve.
function anchorable(row: ProblemProgress): boolean {
  return row.lastQuality === 'strong';
}

// A strong solve that is still inside its own review interval. A mastered problem
// has no next review, so it vouches for its topic for MASTERED_ANCHOR_FRESH_DAYS
// after its last attempt; then the topic gets one refresh review again.
function fresh(row: ProblemProgress, today: string): boolean {
  if (row.nextReviewDate === null) return row.lastAttemptDate !== null && daysBetween(row.lastAttemptDate, today) < MASTERED_ANCHOR_FRESH_DAYS;
  return row.nextReviewDate > today;
}

// For each problem whose review is covered: the problem that covers it (the
// hardest, then most recent, fresh strong solve after it in the same topic).
// `problems` should be the unfiltered catalog, so evidence from outside the
// active set still counts.
export function coveredReviews(problems: CatalogProblem[], progress: ProblemProgress[], today: string): Map<string, CatalogProblem> {
  const progressById = new Map(progress.map((row) => [row.problemId, row]));
  const byTopic = new Map<string, { problem: CatalogProblem; row: ProblemProgress }[]>();
  for (const problem of problems) {
    const row = progressById.get(problem.id);
    if (!coverable(row)) continue;
    const list = byTopic.get(problem.primaryTopic) ?? [];
    list.push({ problem, row });
    byTopic.set(problem.primaryTopic, list);
  }
  const covered = new Map<string, CatalogProblem>();
  for (const entries of byTopic.values()) {
    const anchors = entries
      .filter((entry) => anchorable(entry.row) && fresh(entry.row, today))
      .sort((left, right) => DIFFICULTY_RANK[right.problem.difficulty] - DIFFICULTY_RANK[left.problem.difficulty] || (right.row.lastAttemptDate ?? '').localeCompare(left.row.lastAttemptDate ?? ''));
    // Only a due review can be covered, and only a fresh one covers, so two
    // problems never cover each other.
    for (const entry of entries) {
      if (fresh(entry.row, today)) continue;
      const anchor = anchors.find((candidate) => coversDifficulty(candidate.problem.difficulty, entry.problem.difficulty)
        && (candidate.row.lastAttemptDate ?? '') >= (entry.row.lastAttemptDate ?? '')
        // A hint gap is closed only by a solve on a later day.
        && (entry.row.lastQuality === 'strong' || (candidate.row.lastAttemptDate ?? '') > (entry.row.lastAttemptDate ?? '')));
      if (anchor) covered.set(entry.problem.id, anchor.problem);
    }
  }
  return covered;
}

// The review stage a problem effectively stands at once pattern coverage is
// counted: a covered problem stands at least where its anchor does. Used by
// the topic map, topic priority and proficiency, so a topic kept fresh through
// its harder problems shows as such. Stored rows are never changed.
export function effectiveStages(problems: CatalogProblem[], progress: ProblemProgress[], today: string): Map<string, ProblemProgress['reviewStage']> {
  const stages = new Map(progress.map((row) => [row.problemId, row.reviewStage]));
  const progressById = new Map(progress.map((row) => [row.problemId, row]));
  for (const [problemId, anchor] of coveredReviews(problems, progress, today)) {
    const anchorStage = progressById.get(anchor.id)?.reviewStage ?? 0;
    if (anchorStage > (stages.get(problemId) ?? 0)) stages.set(problemId, anchorStage);
  }
  return stages;
}

// True when a due review only re-checks a pattern (last attempt strong), as
// opposed to an essential review of a real gap (weak, partial, struggling).
export function isMaintenanceReview(row: ProblemProgress): boolean {
  return coverable(row) && row.lastQuality === 'strong';
}

// Orders due reviews for the plan: essential reviews keep their order and come
// first; then one maintenance review per topic, the hardest, because a strong
// result on it covers the rest of the topic. The topic's other maintenance
// reviews are left out (they wait in the review queue): counting them would make
// a topic's whole history fall due on the day its anchor does, and serving them
// would re-check a pattern the anchor is about to re-check anyway.
export function anchorFirst<T extends { problem: CatalogProblem; progress: ProblemProgress }>(queue: T[]): T[] {
  const essential = queue.filter((entry) => !isMaintenanceReview(entry.progress));
  const anchors = new Map<string, T>();
  for (const entry of queue) {
    if (!isMaintenanceReview(entry.progress)) continue;
    const current = anchors.get(entry.problem.primaryTopic);
    if (!current || DIFFICULTY_RANK[entry.problem.difficulty] > DIFFICULTY_RANK[current.problem.difficulty]) anchors.set(entry.problem.primaryTopic, entry);
  }
  const order = new Map(queue.map((entry, index) => [entry, index]));
  return [...essential, ...[...anchors.values()].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0))];
}

// A failed problem above the learner's current level in its topic (its difficulty
// is harder than the topic skill's target) is parked: retrying it tomorrow mostly
// fails again. It leaves the plan until the topic skill reaches its difficulty,
// built up by new problems at the right level and the T5 warm-ups; it stays in
// the review queue meanwhile.
export function isParked(problem: CatalogProblem, row: ProblemProgress, skills: Map<string, number>): boolean {
  return row.lastQuality === 'weak' && DIFFICULTY_RANK[problem.difficulty] > DIFFICULTY_RANK[targetDifficulty(skills.get(problem.primaryTopic) ?? 0)];
}
