import type { Attempt, CatalogProblem, Difficulty } from '../types/models';
import type { DailyPlanItem } from './dailyPlan';
import { SESSION_BUDGET_OPTIONS, SESSION_CALIBRATION_MIN_SAMPLES, SESSION_CALIBRATION_WINDOW, SESSION_DEFAULT_MINUTES } from './constants';

// How long a plan item is expected to take, in minutes. Starts from the defaults
// in constants.ts and, once the user has logged enough durations for a
// (new / review, difficulty) pair, switches to the median of their own recent
// ones. Only attempts before `today` count, so the estimate — and so the plan a
// budget trims — stays stable through the day as durations are logged.
export type ItemRole = 'new' | 'review';
export type MinutesEstimator = (role: ItemRole, difficulty: Difficulty) => number;

export type SessionBudget = (typeof SESSION_BUDGET_OPTIONS)[number];

// The stored `sessionMinutes` setting. Anything unknown (or no row) means no budget.
export function parseSessionBudget(value: string | undefined): SessionBudget | null {
  return SESSION_BUDGET_OPTIONS.find((option) => String(option) === value) ?? null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

// An attempt's role is read from the attempt sequence alone: the first attempt
// on a problem is `new`, every later one is a `review`.
export function minutesEstimator(attempts: Attempt[], problems: CatalogProblem[], today: string): MinutesEstimator {
  const difficultyById = new Map(problems.map((problem) => [problem.id, problem.difficulty]));
  const seen = new Set<string>();
  const samples = new Map<string, number[]>();
  const ordered = attempts
    .filter((attempt) => attempt.attemptedOn < today)
    .sort((left, right) => left.attemptedOn.localeCompare(right.attemptedOn) || left.createdAt.localeCompare(right.createdAt));
  for (const attempt of ordered) {
    const role: ItemRole = seen.has(attempt.problemId) ? 'review' : 'new';
    seen.add(attempt.problemId);
    const difficulty = difficultyById.get(attempt.problemId);
    if (!difficulty || attempt.durationMinutes === null || attempt.lightReview) continue;
    const key = `${role}|${difficulty}`;
    samples.set(key, [...(samples.get(key) ?? []), attempt.durationMinutes]);
  }
  return (role, difficulty) => {
    const recent = (samples.get(`${role}|${difficulty}`) ?? []).slice(-SESSION_CALIBRATION_WINDOW);
    return recent.length >= SESSION_CALIBRATION_MIN_SAMPLES ? median(recent) : SESSION_DEFAULT_MINUTES[role][difficulty];
  };
}

export function itemMinutes(item: DailyPlanItem, estimate: MinutesEstimator): number {
  return estimate(item.kind, item.problem.difficulty);
}

export function planMinutes(items: DailyPlanItem[], estimate: MinutesEstimator): number {
  return items.reduce((sum, item) => sum + itemMinutes(item, estimate), 0);
}

// Trims a fresh plan to a time budget. Items are offered in priority order —
// the first new problem (so the plan's "one new problem unless reviews are
// overloaded" rule survives a short session), the top review, the warm-up, then the remaining
// reviews and new problems, then `spareReviews` (due reviews the slot rules
// left out) — and each one is kept if it still fits and the plan is under
// `maxItems`, so a smaller item further down can use the room a big one left.
// Spare reviews only ever fill leftover minutes: they never add new problems,
// so they can only shrink the backlog. The first item is always kept, even
// alone over budget, so a plan is never empty. With no budget the plan is
// returned unchanged. The result lists reviews first, then the rest in plan order.
// `reviewFirst` (under review overload, T23) puts the top review ahead of the new
// problem, so a budget that fits one item consolidates before it explores.
export function fitPlanToBudget(plan: DailyPlanItem[], budget: number | null, estimate: MinutesEstimator, spareReviews: DailyPlanItem[] = [], maxItems = plan.length, reviewFirst = false): DailyPlanItem[] {
  if (budget === null || plan.length === 0) return plan;
  const reviews = plan.filter((item) => item.kind === 'review' && item.reason !== 'reinforce');
  const fresh = plan.filter((item) => item.kind === 'new' && item.reason !== 'reinforce');
  const warmUps = plan.filter((item) => item.reason === 'reinforce');
  const head = reviewFirst ? [...reviews.slice(0, 1), ...fresh.slice(0, 1)] : [...fresh.slice(0, 1), ...reviews.slice(0, 1)];
  const priority = [...head, ...warmUps, ...reviews.slice(1), ...fresh.slice(1), ...spareReviews];
  const kept = new Set<DailyPlanItem>();
  let spent = 0;
  for (const item of priority) {
    if (kept.size >= maxItems) break;
    const minutes = itemMinutes(item, estimate);
    if (kept.size === 0 || spent + minutes <= budget) {
      kept.add(item);
      spent += minutes;
    }
  }
  return [...reviews, ...spareReviews, ...plan.filter((item) => !reviews.includes(item))].filter((item) => kept.has(item));
}
