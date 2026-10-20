import type { Attempt, CatalogProblem, ProblemProgress, Quality, RecommendationEvent } from '../types/models';
import { tierWeight } from '../data/topicTiers';
import { coreRank } from './coreRank';
import { cadenceFor, daysBetween, type CadenceProfile } from './cadence';
import { FAILING_TOPIC_PRIORITY_PENALTY, OCCASIONAL_RECENT_TOPIC_PENALTY, PLAN_DEFAULT_MAX_ITEMS, READY_TOPIC_PRIORITY_FLOOR, RETURNING_MAX_REVIEW_SLOTS, EXPLORE_MAX_GAP_DAYS, REVIEW_HARD_BRAKE_FACTOR, REVIEW_OVERLOAD_DUE, REVIEW_OVERLOAD_SLOTS, SKILL_MEDIUM_THRESHOLD } from './constants';
import { targetDifficulty, topicSkills } from './skill';
import { importedIds } from './importKnown';
import { prerequisitePenalty } from './topicGraph';
import { selectReinforcement, warmUpTargetFor } from './reinforcement';
import { fitPlanToBudget, minutesEstimator, planMinutes, type MinutesEstimator } from './sessionTime';
import { anchorFirst, coveredReviews, isMaintenanceReview, isParked } from './patternReview';
import { readinessGain } from './readiness';
import { trainingStrategy, type TrainingStrategy } from './strategy';

export interface DailyPlanItem {
  problem: CatalogProblem;
  kind: 'new' | 'review';
  // In-memory only (never persisted; `kind` stays new/review so backups stay
  // compatible): `reinforce` marks the day's warm-up for the struggling problem
  // in `reinforces`. Recomputed from progress on every plan, including replays.
  reason?: 'reinforce';
  reinforces?: CatalogProblem;
}

interface DailyPlanInput {
  problems: CatalogProblem[];
  progress: ProblemProgress[];
  recommendationEvents: RecommendationEvent[];
  // Attempt history that topic skill is replayed from. `skillProblems` resolves
  // attempts to topics (defaults to `problems`; pass the unfiltered catalog so
  // out-of-set history still counts toward skill).
  attempts?: Attempt[];
  skillProblems?: CatalogProblem[];
  // Optional time budget in minutes (see sessionTime.ts). A fresh plan is trimmed
  // to it and same-day top-ups stop once it is spent; stored items are never
  // dropped, so a problem added with "One more problem" stays in the plan.
  sessionMinutes?: number | null;
  // ISO time the budget was last changed. Today's recommendations made before it
  // are left out of the same-day replay unless they were logged, so the rest of
  // the day is re-planned under the new budget.
  planResetAt?: string | null;
  // An interview deadline is set (T16): new-problem topics are weighted towards the
  // tier-1 foundations (see `tierWeight`). Nothing else about the plan changes.
  favourFoundations?: boolean;
  // Days until the interview (T23), or null with no date. Together with the budget
  // it picks the training strategy (see strategy.ts).
  interviewDaysLeft?: number | null;
  now?: Date;
}

const MAX_REVIEW_STAGE = 5;
const QUALITY_RANK: Record<Quality, number> = { weak: 0, partial: 1, strong: 2 };
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'] as const;

function localToday(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDay(iso: string): string {
  return localToday(new Date(iso));
}

// Deterministic per-day, per-topic jitter in [0, 0.05) so topic order is not a
// fixed march down NeetCode order, while staying stable within a single day
// (the same-day replay branch depends on the plan being reproducible).
function jitter(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 0.05;
}

// Number of review / new slots given how many uncovered reviews are due today:
// explore (new problems) vs consolidate (reviews), with neither allowed to crash
// the other (T23).
//   - Base mix by due count: total slots step 2 -> 3 -> 3 -> 4 -> 4 as the due
//     count rises, so the plan never *shrinks* as the backlog grows.
//   - `maxReviewShare` (by horizon, see strategy.ts) caps the reviews' share; the
//     slots it frees go to new problems.
//   - Past the overload line (REVIEW_OVERLOAD_DUE, scaled with the cap) the plan
//     is all reviews but one: the exploration floor keeps one new problem a day.
//   - Only at REVIEW_HARD_BRAKE_FACTOR x that line does the plan go all-review
//     until the backlog clears. Pattern-level reviews (patternReview.ts) make
//     that rare; a large backlog is also drained through the review-queue panel.
//
// A `returning` user (7+ days away) gets a re-entry plan: reviews fill every slot
// but one, so the backlog is eased into instead of dumped, and the single new
// problem keeps fresh material alive. The rest of the backlog stays in the
// review queue — the plan itself is never inflated.
//
// With a time budget the cap grows with the minutes (`maxItems`, see strategy.ts)
// and the thresholds with it; with none the cap is four.
function overloadDue(maxItems: number): number {
  return Math.round(REVIEW_OVERLOAD_DUE * Math.max(1, maxItems / PLAN_DEFAULT_MAX_ITEMS));
}

function hardBrakeDue(maxItems: number): number {
  return overloadDue(maxItems) * REVIEW_HARD_BRAKE_FACTOR;
}

function planSlots(dueCount: number, profile: CadenceProfile, maxItems = PLAN_DEFAULT_MAX_ITEMS, maxReviewShare = 0.75): { reviewSlots: number; newSlots: number } {
  const scale = Math.max(1, maxItems / PLAN_DEFAULT_MAX_ITEMS);
  if (profile === 'returning' && dueCount > 0) return { reviewSlots: Math.min(dueCount, Math.round(RETURNING_MAX_REVIEW_SLOTS * scale)), newSlots: 1 };
  if (dueCount >= hardBrakeDue(maxItems)) return { reviewSlots: Math.round(REVIEW_OVERLOAD_SLOTS * scale), newSlots: 0 };
  const shareCap = Math.max(1, Math.floor(maxItems * maxReviewShare));
  if (dueCount >= overloadDue(maxItems)) return { reviewSlots: maxItems - 1, newSlots: 1 };
  const slots = baseSlots(dueCount);
  const reviewSlots = Math.min(slots.reviewSlots, shareCap);
  return { reviewSlots, newSlots: slots.newSlots + (slots.reviewSlots - reviewSlots) };
}

function baseSlots(dueCount: number): { reviewSlots: number; newSlots: number } {
  if (dueCount === 0) return { reviewSlots: 0, newSlots: 2 };
  if (dueCount <= 2) return { reviewSlots: 1, newSlots: 2 };
  if (dueCount <= 5) return { reviewSlots: 2, newSlots: 1 };
  return { reviewSlots: 3, newSlots: 1 };
}

// Every problem due for review today: weakest last attempt first, then the
// review most overdue for its interval (see `overdueRatio`). Shared by
// the daily plan (which takes a handful off the top) and the review queue panel
// (which shows the whole list). `skipUntil` events are *not* filtered here — the
// queue is the "review everything" surface, so a problem skipped from the daily
// challenge still shows up as due. The daily plan applies its own skip filter.
export interface DueReview {
  problem: CatalogProblem;
  progress: ProblemProgress;
}

// How late a review is relative to the gap it was scheduled for: days overdue ÷
// the scheduled interval (`lastAttemptDate` → `nextReviewDate`, so it is right
// for the struggling backoff ladder too). A 7-day review 20 days late (ratio
// 2.9) is far likelier to have decayed than a 30-day review a day late (0.03),
// which matters most for occasional users who are always a little late.
function overdueRatio(progress: ProblemProgress, today: string): number {
  const next = progress.nextReviewDate;
  if (!next) return 0;
  const interval = progress.lastAttemptDate ? Math.max(1, daysBetween(progress.lastAttemptDate, next)) : 1;
  return Math.max(0, daysBetween(next, today)) / interval;
}

export function dueReviewQueue(problems: CatalogProblem[], progress: ProblemProgress[], now: Date = new Date()): DueReview[] {
  const today = localToday(now);
  const progressByProblem = new Map(progress.map((item) => [item.problemId, item]));
  return problems
    .map((problem) => ({ problem, progress: progressByProblem.get(problem.id) }))
    .filter((entry): entry is DueReview => {
      const next = entry.progress?.nextReviewDate;
      return next !== null && next !== undefined && next <= today;
    })
    .sort((left, right) =>
      QUALITY_RANK[left.progress.lastQuality ?? 'strong'] - QUALITY_RANK[right.progress.lastQuality ?? 'strong'] ||
      overdueRatio(right.progress, today) - overdueRatio(left.progress, today) ||
      (left.progress.nextReviewDate ?? '').localeCompare(right.progress.nextReviewDate ?? '') ||
      left.problem.neetcodeOrder - right.problem.neetcodeOrder
    );
}

function hiddenIds(recommendationEvents: RecommendationEvent[], now: Date): Set<string> {
  return new Set(recommendationEvents.filter((event) => event.skippedUntil !== null && new Date(event.skippedUntil) > now).map((event) => event.problemId));
}

// The due reviews the plan works from (T22): not skipped, not covered by a
// fresher strong solve of the same pattern, not parked above the learner's level
// (see patternReview.ts); essential gaps first, then one maintenance review per
// topic before a second one. `coverageProblems` is the unfiltered catalog, so
// out-of-set solves count as evidence.
function planDueReviews(problems: CatalogProblem[], progress: ProblemProgress[], recommendationEvents: RecommendationEvent[], coverageProblems: CatalogProblem[], skills: Map<string, number>, now: Date): DueReview[] {
  const hidden = hiddenIds(recommendationEvents, now);
  const covered = coveredReviews(coverageProblems, progress, localToday(now));
  return anchorFirst(dueReviewQueue(problems, progress, now).filter((entry) => !hidden.has(entry.problem.id) && !covered.has(entry.problem.id) && !isParked(entry.problem, entry.progress, skills)));
}

function skillsOf(progress: ProblemProgress[], attempts: Attempt[], skillProblems: CatalogProblem[]): Map<string, number> {
  return topicSkills(attempts, skillProblems, importedIds(progress.map((row) => row.problemId), attempts.map((attempt) => attempt.problemId)));
}

export function strategyOf(input: Pick<DailyPlanInput, 'interviewDaysLeft' | 'sessionMinutes'>): TrainingStrategy {
  return trainingStrategy({ daysLeft: input.interviewDaysLeft ?? null, budget: input.sessionMinutes ?? null });
}

// Reviews the plan counts as due: skipped ones and pattern-covered ones left out.
export function planDueCount({ problems, progress, recommendationEvents, attempts = [], skillProblems = problems, now = new Date() }: DailyPlanInput): number {
  return planDueReviews(problems, progress, recommendationEvents, skillProblems, skillsOf(progress, attempts, skillProblems), now).length;
}

// How many more due reviews have to be cleared before new problems come back
// under the review hard brake (0 when they are not paused). Counts what the plan
// counts: due reviews minus the ones skipped for today and the covered ones.
export function reviewsUntilNewProblems(input: DailyPlanInput): number {
  return Math.max(0, planDueCount(input) - hardBrakeDue(strategyOf(input).maxItems) + 1);
}

// Everything new-problem selection reads, gathered once per plan.
interface SelectionContext {
  problems: CatalogProblem[];
  progressByProblem: Map<string, ProblemProgress>;
  // Attempts per topic and in total, for the exploration bonus.
  topicAttempts: Map<string, number>;
  totalAttempts: number;
  events: RecommendationEvent[];
  hiddenProblemIds: Set<string>;
  problemById: Map<string, CatalogProblem>;
  skills: Map<string, number>;
  profile: CadenceProfile;
  now: Date;
  favourFoundations: boolean;
  strategy: TrainingStrategy;
}

function selectionContext({ problems, progress, recommendationEvents, attempts = [], skillProblems = problems, favourFoundations = false, now = new Date() }: DailyPlanInput, strategy: TrainingStrategy): SelectionContext {
  const topicOf = new Map(skillProblems.map((problem) => [problem.id, problem.primaryTopic]));
  const topicAttempts = new Map<string, number>();
  for (const attempt of attempts) {
    const topic = topicOf.get(attempt.problemId);
    if (topic !== undefined) topicAttempts.set(topic, (topicAttempts.get(topic) ?? 0) + 1);
  }
  return {
    problems,
    progressByProblem: new Map(progress.map((item) => [item.problemId, item])),
    topicAttempts,
    totalAttempts: attempts.length,
    events: recommendationEvents,
    hiddenProblemIds: hiddenIds(recommendationEvents, now),
    problemById: new Map(problems.map((problem) => [problem.id, problem])),
    skills: skillsOf(progress, attempts, skillProblems),
    profile: cadenceFor(attempts, localToday(now)).profile,
    now,
    favourFoundations,
    strategy
  };
}

export function selectDailyPlan(input: DailyPlanInput): DailyPlanItem[] {
  const { problems, progress, recommendationEvents, attempts = [], skillProblems = problems, sessionMinutes = null, planResetAt = null, now = new Date() } = input;
  const strategy = strategyOf(input);
  const context = selectionContext(input, strategy);
  const { progressByProblem, problemById, hiddenProblemIds, profile, skills } = context;
  const estimate = minutesEstimator(attempts, skillProblems, localToday(now));

  const allDue = planDueReviews(problems, progress, recommendationEvents, skillProblems, skills, now);
  // In a sprint, maintenance reviews (strong last attempt) only fill spare minutes.
  const dueReviews = strategy.maintenanceLast ? allDue.filter((entry) => !isMaintenanceReview(entry.progress)) : allDue;
  const maintenanceSpare = strategy.maintenanceLast ? allDue.filter((entry) => isMaintenanceReview(entry.progress)) : [];

  const { newSlots } = planSlots(dueReviews.length, profile, strategy.maxItems, strategy.maxReviewShare);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayRecommendations = recommendationEvents.filter((event) => new Date(event.recommendedAt) >= startOfToday && event.skippedUntil === null
    && (planResetAt === null || event.recommendedAt >= planResetAt || (event.completedAt !== null && event.completedAt !== undefined)));

  // Same-day replay: once any recommendation was persisted today, anchor the
  // plan on those stored items so it stays stable as progress changes, topping
  // up new problems if the stored set is short of the current new-slot target.
  if (todayRecommendations.length > 0) {
    const seen = new Set<string>();
    const plan: DailyPlanItem[] = todayRecommendations
      .filter((event) => !hiddenProblemIds.has(event.problemId) && !seen.has(event.problemId) && seen.add(event.problemId))
      .map((event) => ({ problem: problemById.get(event.problemId), kind: event.kind }))
      .filter((item): item is DailyPlanItem => item.problem !== undefined)
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.problem.neetcodeOrder - right.problem.neetcodeOrder);

    const dueIds = new Set(dueReviews.map((entry) => entry.problem.id));
    for (const item of plan) {
      const target = warmUpTargetFor(item.problem, item.kind, problems, progressByProblem, dueIds);
      if (target) {
        item.reason = 'reinforce';
        item.reinforces = target;
        break;
      }
    }

    // The warm-up already holds a new-problem slot (see the fresh-plan branch).
    const storedNew = plan.filter((item) => item.kind === 'new' || item.reason === 'reinforce').length;
    let target = plan.length + Math.max(0, newSlots - storedNew);
    if (target < 2) target = 2;
    if (target > strategy.maxItems) target = strategy.maxItems;
    fillNewProblems(plan, target, context, budgetFits(sessionMinutes, estimate));
    return plan;
  }

  // One warm-up for a struggling problem takes a slot of the plan: from the new
  // slots when there are two (one new problem always remains), otherwise on top
  // of the plan while it has room, otherwise in place of the last review.
  const warmUp = selectReinforcement(problems, progressByProblem, hiddenProblemIds, localToday(now));
  const queue = warmUp ? dueReviews.filter((entry) => entry.problem.id !== warmUp.problem.id) : dueReviews;
  const slots = planSlots(queue.length, profile, strategy.maxItems, strategy.maxReviewShare);
  let reviewCount = slots.reviewSlots;
  let newCount = slots.newSlots;
  // New material starved for EXPLORE_MAX_GAP_DAYS active days goes first (T23).
  const starved = activeDaysSinceNew(attempts, localToday(now)) >= EXPLORE_MAX_GAP_DAYS;
  if (warmUp) {
    if (newCount >= 2) newCount -= 1;
    // A small plan (one review + one new) keeps its review: the warm-up takes the new slot.
    else if (newCount === 1 && reviewCount === 1 && reviewCount + newCount >= strategy.maxItems && !starved) newCount -= 1;
    else if (reviewCount + newCount >= strategy.maxItems) reviewCount -= 1;
  }
  const plan: DailyPlanItem[] = queue.slice(0, reviewCount).map(({ problem }) => ({ problem, kind: 'review' as const }));
  if (warmUp) plan.push({ problem: warmUp.problem, kind: warmUp.kind, reason: 'reinforce', reinforces: warmUp.target });
  fillNewProblems(plan, plan.length + newCount, context);
  // Spare due reviews fill leftover minutes. With a budget that grows the plan past
  // four items, they take at most half of it, so new material keeps coming.
  const spare = [...queue.slice(reviewCount), ...maintenanceSpare.filter((entry) => entry.problem.id !== warmUp?.problem.id)];
  const spareLimit = strategy.maxItems > PLAN_DEFAULT_MAX_ITEMS ? Math.max(0, Math.floor(strategy.maxItems * strategy.maxReviewShare) - reviewCount) : spare.length;
  // Under overload a budget that fits one item consolidates first, unless new
  // material has been starved for EXPLORE_MAX_GAP_DAYS active days.
  const reviewFirst = queue.length >= overloadDue(strategy.maxItems) && !starved;
  const fitted = fitPlanToBudget(plan, sessionMinutes, estimate, spare.slice(0, spareLimit).map(({ problem }) => ({ problem, kind: 'review' as const })), strategy.maxItems, reviewFirst);
  // With a budget, new problems fill whatever minutes are left (not under overload).
  if (strategy.fillToBudget && slots.newSlots > 0) fillNewProblems(fitted, strategy.maxItems, context, budgetFits(sessionMinutes, estimate));
  return fitted;
}

// Active days before `today` since the last first attempt on any problem (all of
// them when there has never been one): how long new material has been starved.
export function activeDaysSinceNew(attempts: Attempt[], today: string): number {
  const seen = new Set<string>();
  let lastNew = '';
  for (const attempt of [...attempts].sort((left, right) => left.attemptedOn.localeCompare(right.attemptedOn))) {
    if (attempt.attemptedOn >= today) break;
    if (!seen.has(attempt.problemId)) lastNew = attempt.attemptedOn;
    seen.add(attempt.problemId);
  }
  return new Set(attempts.filter((attempt) => attempt.attemptedOn > lastNew && attempt.attemptedOn < today).map((attempt) => attempt.attemptedOn)).size;
}

// Same-day top-up under a budget: a new problem joins only while it still fits.
function budgetFits(budget: number | null, estimate: MinutesEstimator): ((plan: DailyPlanItem[], problem: CatalogProblem) => boolean) | undefined {
  if (budget === null) return undefined;
  return (plan, problem) => planMinutes(plan, estimate) + estimate('new', problem.difficulty) <= budget;
}

// "One more problem": the next new problem the selector would serve, on top of
// today's plan (so on a topic other than today's, when one is available). The
// caller persists it as an ordinary `new` recommendation, which the same-day
// replay then keeps in the plan. This is an explicit user action, so it may take
// the plan past the automatic cap.
export function selectExtraProblem(input: DailyPlanInput, plan: DailyPlanItem[]): CatalogProblem | undefined {
  const context = selectionContext(input, strategyOf(input));
  return selectNewProblem(context, new Set(plan.map((item) => item.problem.id)), new Set(plan.map((item) => item.problem.primaryTopic)));
}

function fillNewProblems(plan: DailyPlanItem[], target: number, context: SelectionContext, fits?: (plan: DailyPlanItem[], problem: CatalogProblem) => boolean): void {
  while (plan.length < target) {
    const usedProblemIds = new Set(plan.map((item) => item.problem.id));
    const usedTopics = new Set(plan.map((item) => item.problem.primaryTopic));
    const nextProblem = selectNewProblem(context, usedProblemIds, usedTopics);
    if (!nextProblem || (fits && !fits(plan, nextProblem))) break;
    plan.push({ problem: nextProblem, kind: 'new' });
  }
}

// Mean mastery of a topic in [0, 1]: reviewStage/5 per problem, 0 for untouched.
//
// `struggling` problems get different treatment per call site (`forPriority`):
//   - priority (new-problem topic pick): a struggling problem contributes a
//     neutral 0.5 rather than its reset-to-0 stage, so a topic the user is stuck
//     on stops being pinned at maximum priority and flooding them with more
//     problems from it.
//   - difficulty ceiling: a struggling problem contributes its real (0) stage,
//     so the ceiling stays low — a topic the user is failing must not unlock
//     Medium/Hard just because its struggling problems were lifted to 0.5.
export function topicMastery(topic: string, problems: CatalogProblem[], progressByProblem: Map<string, ProblemProgress>, forPriority: boolean): number {
  const topicProblems = problems.filter((problem) => problem.primaryTopic === topic);
  if (topicProblems.length === 0) return 1;
  const total = topicProblems.reduce((sum, problem) => {
    const progress = progressByProblem.get(problem.id);
    if (forPriority && progress?.struggling) return sum + 0.5;
    return sum + (progress?.reviewStage ?? 0) / MAX_REVIEW_STAGE;
  }, 0);
  return total / topicProblems.length;
}

function selectNewProblem({ problems, progressByProblem, topicAttempts, totalAttempts, events, hiddenProblemIds, problemById, skills, profile, now, favourFoundations, strategy }: SelectionContext, selectedProblemIds: Set<string>, selectedTopics: Set<string>): CatalogProblem | undefined {
  let candidates = problems.filter((problem) => {
    const status = progressByProblem.get(problem.id)?.status;
    return !hiddenProblemIds.has(problem.id) && !selectedProblemIds.has(problem.id) && status !== 'solved' && status !== 'mastered';
  });
  // The last days before an interview are for closing gaps, not for a first Hard.
  if (strategy.taper && candidates.some((problem) => problem.difficulty !== 'hard')) candidates = candidates.filter((problem) => problem.difficulty !== 'hard');
  // Occasional users have few sessions, so they spend them strictly core-first
  // across topics: no problem outside the best remaining list (NeetCode 75, then
  // the rest of the 150, then the extra 100) is offered while a better one is left.
  if (profile === 'occasional' && candidates.length > 0) {
    const bestRank = Math.min(...candidates.map(coreRank));
    candidates = candidates.filter((problem) => coreRank(problem) === bestRank);
  }
  // A returning user's one new problem comes from a topic they already have skill
  // in (when there is one), so re-entry is not a cold start in a fresh topic.
  if (profile === 'returning') {
    const known = candidates.filter((problem) => (skills.get(problem.primaryTopic) ?? 0) > 0);
    if (known.length > 0) candidates = known;
  }
  const eligibleTopics = [...new Set(candidates.map((problem) => problem.primaryTopic))];
  if (eligibleTopics.length === 0) return undefined;

  // A prerequisite only counts as unmet while it still has unsolved problems and
  // the learner hasn't already tried and failed it: a topic with a weak last
  // attempt is backed off from, so it must not also pull its dependents'
  // priority down and keep flooding the plan with the topic being failed.
  const failedTopics = new Set(problems.filter((problem) => progressByProblem.get(problem.id)?.lastQuality === 'weak').map((problem) => problem.primaryTopic));
  const workingTopics = new Set(eligibleTopics.filter((topic) => !failedTopics.has(topic)));
  const today = localToday(now);
  const recentTopics = new Set(
    events
      .filter((event) => event.kind === 'new' && localDay(event.recommendedAt) < today)
      .sort((left, right) => right.recommendedAt.localeCompare(left.recommendedAt))
      .map((event) => ({ topic: problemById.get(event.problemId)?.primaryTopic, day: localDay(event.recommendedAt) }))
      .filter((entry): entry is { topic: string; day: string } => entry.topic !== undefined)
      .reduce<{ days: Set<string>; topics: string[] }>((accumulator, entry) => {
        if (accumulator.days.size < 2 || accumulator.days.has(entry.day)) {
          accumulator.days.add(entry.day);
          accumulator.topics.push(entry.topic);
        }
        return accumulator;
      }, { days: new Set(), topics: [] }).topics
  );

  const chosenTopic = eligibleTopics
    .map((topic) => {
      // With a deadline (T23) a topic is worth what one more problem adds to the
      // chance of solving an unseen Medium in it; without one, what is left of the
      // set's topic.
      const gap = strategy.readinessPriority
        ? Math.max(READY_TOPIC_PRIORITY_FLOOR, readinessGain(skills.get(topic) ?? 0))
        : 1 - topicMastery(topic, problems, progressByProblem, true);
      // Explore: a little-practised topic gets a UCB-style bonus (0 with no date).
      const explore = strategy.exploreWeight * Math.sqrt(Math.log(1 + totalAttempts) / (1 + (topicAttempts.get(topic) ?? 0)));
      const recencyPenalty = selectedTopics.has(topic) ? 0.35 : recentTopics.has(topic) ? (profile === 'occasional' ? OCCASIONAL_RECENT_TOPIC_PENALTY : 0.35) : 1;
      const failingPenalty = failedTopics.has(topic) && (skills.get(topic) ?? 0) < SKILL_MEDIUM_THRESHOLD ? FAILING_TOPIC_PRIORITY_PENALTY : 1;
      const priority = tierWeight(topic, favourFoundations) * (gap + explore) * recencyPenalty * failingPenalty * prerequisitePenalty(topic, skills, workingTopics) + jitter(today + topic);
      return { topic, priority };
    })
    .sort((left, right) => right.priority - left.priority)[0]?.topic;
  if (!chosenTopic) return undefined;

  // Aim at the difficulty the topic's skill supports, falling back to easier
  // problems only when none are left at the target, and to harder ones only when
  // nothing easier remains. Within a difficulty: NeetCode 75 first, then the
  // rest of the 150, then the extra 100, in catalog order.
  const target = DIFFICULTY_ORDER.indexOf(targetDifficulty(skills.get(chosenTopic) ?? 0));
  const distance = (problem: CatalogProblem) => {
    const level = DIFFICULTY_ORDER.indexOf(problem.difficulty);
    return level <= target ? target - level : DIFFICULTY_ORDER.length + level - target;
  };
  return candidates
    .filter((problem) => problem.primaryTopic === chosenTopic)
    .sort((left, right) => distance(left) - distance(right) || coreRank(left) - coreRank(right) || left.neetcodeOrder - right.neetcodeOrder)[0];
}
