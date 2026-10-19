import type { Attempt, CatalogProblem, ProblemProgress, Quality, RecommendationEvent } from '../types/models';
import { tierWeight } from '../data/topicTiers';
import { coreRank } from './coreRank';
import { cadenceFor, daysBetween, type CadenceProfile } from './cadence';
import { FAILING_TOPIC_PRIORITY_PENALTY, OCCASIONAL_RECENT_TOPIC_PENALTY, RETURNING_MAX_REVIEW_SLOTS, SKILL_MEDIUM_THRESHOLD } from './constants';
import { targetDifficulty, topicSkills } from './skill';
import { prerequisitePenalty } from './topicGraph';

export interface DailyPlanItem {
  problem: CatalogProblem;
  kind: 'new' | 'review';
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

// Number of review / new slots given how many reviews are due today. Always at
// least one new problem so fresh material never disappears, and the plan never
// *shrinks* as the backlog grows — total slots step 2 → 3 → 3 → 4 as due count
// rises. A large backlog is drained through the review-queue panel, not by
// inflating the daily plan past four, so every user — brand new, caught up, or
// behind — gets a comparably sized, review-first plan.
//
// A `returning` user (7+ days away) gets a re-entry plan: reviews fill every slot
// but one, so the backlog is eased into instead of dumped, and the single new
// problem keeps fresh material alive. The rest of the backlog stays in the
// review queue — the plan itself is never inflated.
function planSlots(dueCount: number, profile: CadenceProfile): { reviewSlots: number; newSlots: number } {
  if (profile === 'returning' && dueCount > 0) return { reviewSlots: Math.min(dueCount, RETURNING_MAX_REVIEW_SLOTS), newSlots: 1 };
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

export function selectDailyPlan({ problems, progress, recommendationEvents, attempts = [], skillProblems = problems, now = new Date() }: DailyPlanInput): DailyPlanItem[] {
  const progressByProblem = new Map(progress.map((item) => [item.problemId, item]));
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const hiddenProblemIds = new Set(recommendationEvents.filter((event) => event.skippedUntil !== null && new Date(event.skippedUntil) > now).map((event) => event.problemId));

  const skills = topicSkills(attempts, skillProblems);
  const profile = cadenceFor(attempts, localToday(now)).profile;

  const dueReviews = dueReviewQueue(problems, progress, now).filter((entry) => !hiddenProblemIds.has(entry.problem.id));

  const { reviewSlots, newSlots } = planSlots(dueReviews.length, profile);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayRecommendations = recommendationEvents.filter((event) => new Date(event.recommendedAt) >= startOfToday && event.skippedUntil === null);

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

    const storedNew = plan.filter((item) => item.kind === 'new').length;
    let target = plan.length + Math.max(0, newSlots - storedNew);
    if (target < 2) target = 2;
    if (target > 4) target = 4;
    fillNewProblems(plan, target, problems, progressByProblem, recommendationEvents, hiddenProblemIds, problemById, skills, profile, now);
    return plan;
  }

  const plan: DailyPlanItem[] = dueReviews.slice(0, reviewSlots).map(({ problem }) => ({ problem, kind: 'review' as const }));
  fillNewProblems(plan, plan.length + newSlots, problems, progressByProblem, recommendationEvents, hiddenProblemIds, problemById, skills, profile, now);
  return plan;
}

// "One more problem": the next new problem the selector would serve, on top of
// today's plan (so on a topic other than today's, when one is available). The
// caller persists it as an ordinary `new` recommendation, which the same-day
// replay then keeps in the plan. This is an explicit user action, so it may take
// the plan past the automatic cap of four.
export function selectExtraProblem({ problems, progress, recommendationEvents, attempts = [], skillProblems = problems, now = new Date() }: DailyPlanInput, plan: DailyPlanItem[]): CatalogProblem | undefined {
  const progressByProblem = new Map(progress.map((item) => [item.problemId, item]));
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const hiddenProblemIds = new Set(recommendationEvents.filter((event) => event.skippedUntil !== null && new Date(event.skippedUntil) > now).map((event) => event.problemId));
  const skills = topicSkills(attempts, skillProblems);
  const profile = cadenceFor(attempts, localToday(now)).profile;
  return selectNewProblem(
    problems, progressByProblem, recommendationEvents, hiddenProblemIds,
    new Set(plan.map((item) => item.problem.id)), new Set(plan.map((item) => item.problem.primaryTopic)),
    problemById, skills, profile, now
  );
}

function fillNewProblems(plan: DailyPlanItem[], target: number, problems: CatalogProblem[], progressByProblem: Map<string, ProblemProgress>, events: RecommendationEvent[], hiddenProblemIds: Set<string>, problemById: Map<string, CatalogProblem>, skills: Map<string, number>, profile: CadenceProfile, now: Date): void {
  while (plan.length < target) {
    const usedProblemIds = new Set(plan.map((item) => item.problem.id));
    const usedTopics = new Set(plan.map((item) => item.problem.primaryTopic));
    const nextProblem = selectNewProblem(problems, progressByProblem, events, hiddenProblemIds, usedProblemIds, usedTopics, problemById, skills, profile, now);
    if (!nextProblem) break;
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

function selectNewProblem(problems: CatalogProblem[], progressByProblem: Map<string, ProblemProgress>, events: RecommendationEvent[], hiddenProblemIds: Set<string>, selectedProblemIds: Set<string>, selectedTopics: Set<string>, problemById: Map<string, CatalogProblem>, skills: Map<string, number>, profile: CadenceProfile, now: Date): CatalogProblem | undefined {
  let candidates = problems.filter((problem) => {
    const status = progressByProblem.get(problem.id)?.status;
    return !hiddenProblemIds.has(problem.id) && !selectedProblemIds.has(problem.id) && status !== 'solved' && status !== 'mastered';
  });
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
      const mastery = topicMastery(topic, problems, progressByProblem, true);
      const recencyPenalty = selectedTopics.has(topic) ? 0.35 : recentTopics.has(topic) ? (profile === 'occasional' ? OCCASIONAL_RECENT_TOPIC_PENALTY : 0.35) : 1;
      const failingPenalty = failedTopics.has(topic) && (skills.get(topic) ?? 0) < SKILL_MEDIUM_THRESHOLD ? FAILING_TOPIC_PRIORITY_PENALTY : 1;
      const priority = tierWeight(topic) * (1 - mastery) * recencyPenalty * failingPenalty * prerequisitePenalty(topic, skills, workingTopics) + jitter(today + topic);
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
