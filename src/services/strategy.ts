import {
  EXPLORE_WEIGHT,
  MOCK_EVERY_DAYS,
  PLAN_DEFAULT_MAX_ITEMS,
  PLAN_MAX_ITEMS,
  PLAN_MINUTES_PER_ITEM,
  REVIEW_SHARE_MAX,
  STRATEGY_FOCUSED_DAYS,
  STRATEGY_SPRINT_DAYS,
  STRATEGY_TAPER_DAYS
} from './constants';

// The training strategy (T23): how the plan behaves for the time this user has.
// Derived on every plan from two plain settings (the interview date and the daily
// time budget), never stored, so it changes the moment either changes.
//
//   sprint   the interview is STRATEGY_SPRINT_DAYS or fewer days away. The most
//            exploration: every pattern should be met at least once, reviews take at
//            most half the plan, and maintenance reviews (strong last attempt) only
//            fill minutes nothing else needs.
//   focused  up to STRATEGY_FOCUSED_DAYS away. Topics chosen by readiness gain plus
//            a strong exploration bonus; reviews at most half the plan.
//   steady   a date further out. Readiness gain plus a mild exploration bonus.
//   open     no date. The long-term plan: work through the set, foundations first,
//            reviews up to three quarters of the plan.
// With a date, every topic pick is explore vs exploit: the expected readiness gain
// of one more problem (exploit) plus a bonus for little-practised topics (explore).
//
// In the last STRATEGY_TAPER_DAYS before the date (`taper`) no new Hard is served:
// the time goes to closing gaps (weak reviews) and to mock interviews.
export type Horizon = 'sprint' | 'focused' | 'steady' | 'open';

export interface TrainingStrategy {
  horizon: Horizon;
  // Days until the interview, or null with no date.
  daysLeft: number | null;
  // The automatic plan's item cap. With a time budget, new problems fill the
  // minutes the reviews leave, up to this many items.
  maxItems: number;
  fillToBudget: boolean;
  // Topic choice by the gap to interview readiness (skill on an unseen Medium)
  // instead of by how much of the set's topic is still unsolved.
  readinessPriority: boolean;
  // Weight of the topic-choice exploration bonus (UCB-style; 0 = none).
  exploreWeight: number;
  // Reviews take at most this share of the automatic plan; new problems the rest.
  maxReviewShare: number;
  // Maintenance reviews (strong last attempt) only fill minutes nothing else needs.
  maintenanceLast: boolean;
  taper: boolean;
  // A mock interview is suggested when the last one was at least this many days ago.
  mockEveryDays: number;
}

export interface StrategyInput {
  daysLeft: number | null;
  budget: number | null;
}

export function maxItemsFor(budget: number | null): number {
  if (budget === null) return PLAN_DEFAULT_MAX_ITEMS;
  return Math.max(2, Math.min(PLAN_MAX_ITEMS, Math.floor(budget / PLAN_MINUTES_PER_ITEM)));
}

export function horizonFor(daysLeft: number | null): Horizon {
  if (daysLeft === null) return 'open';
  if (daysLeft <= STRATEGY_SPRINT_DAYS) return 'sprint';
  if (daysLeft <= STRATEGY_FOCUSED_DAYS) return 'focused';
  return 'steady';
}

export function trainingStrategy({ daysLeft, budget }: StrategyInput): TrainingStrategy {
  const horizon = horizonFor(daysLeft);
  return {
    horizon,
    daysLeft,
    maxItems: maxItemsFor(budget),
    fillToBudget: budget !== null,
    readinessPriority: horizon !== 'open',
    exploreWeight: EXPLORE_WEIGHT[horizon],
    maxReviewShare: REVIEW_SHARE_MAX[horizon],
    maintenanceLast: horizon === 'sprint',
    taper: daysLeft !== null && daysLeft <= STRATEGY_TAPER_DAYS,
    mockEveryDays: MOCK_EVERY_DAYS[horizon]
  };
}

const HORIZON_LABELS: Record<Horizon, string> = {
  sprint: 'Sprint',
  focused: 'Focused',
  steady: 'Steady',
  open: 'Open-ended'
};

// One line for the plan header: what the engine is doing for this user, and why.
export function strategyLine(strategy: TrainingStrategy): string {
  const label = HORIZON_LABELS[strategy.horizon];
  if (strategy.taper) return `${label} · ${strategy.daysLeft === 1 ? 'interview tomorrow' : `${strategy.daysLeft} days left`}: no new Hards, close gaps and run mock interviews.`;
  if (strategy.horizon === 'sprint') return `${label} · ${strategy.daysLeft} days left: every pattern at least once, reviews only for real gaps.`;
  if (strategy.horizon === 'focused') return `${label} · ${strategy.daysLeft} days left: the patterns closest to ready first, with room to explore the rest.`;
  if (strategy.horizon === 'steady') return `${label} · ${strategy.daysLeft} days left: the patterns closest to ready first, foundations before the rest.`;
  return `${label} · no interview date: working through the set, foundations first.`;
}
