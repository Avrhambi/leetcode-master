import { describe, expect, it } from 'vitest';
import { fitPlanToBudget, minutesEstimator, parseSessionBudget, planMinutes } from './sessionTime';
import { SESSION_DEFAULT_MINUTES } from './constants';
import type { DailyPlanItem } from './dailyPlan';
import type { Attempt, CatalogProblem, Difficulty } from '../types/models';

const problem = (id: string, difficulty: Difficulty): CatalogProblem => ({ id, title: id, slug: id, leetcodeUrl: '', difficulty, topics: ['Arrays'], primaryTopic: id, neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 1 });
const attempt = (problemId: string, attemptedOn: string, durationMinutes: number | null, createdAt = `${attemptedOn}T10:00:00.000Z`): Attempt => ({ id: `${problemId}-${createdAt}`, problemId, attemptedOn, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes, notes: '', quality: 'strong', createdAt });
const review = (p: CatalogProblem): DailyPlanItem => ({ problem: p, kind: 'review' });
const fresh = (p: CatalogProblem): DailyPlanItem => ({ problem: p, kind: 'new' });
const defaults = minutesEstimator([], [], '2026-07-20');

describe('session budget setting', () => {
  it('reads the offered budgets and treats anything else as no budget', () => {
    expect(parseSessionBudget('30')).toBe(30);
    expect(parseSessionBudget('60')).toBe(60);
    expect(parseSessionBudget(undefined)).toBeNull();
    expect(parseSessionBudget('25')).toBeNull();
    expect(parseSessionBudget('')).toBeNull();
  });
});

describe('minutes estimator', () => {
  it('uses the defaults until three durations are logged for a role and difficulty', () => {
    const problems = [problem('a', 'easy'), problem('b', 'easy')];
    const estimate = minutesEstimator([attempt('a', '2026-07-01', 5), attempt('b', '2026-07-02', 7)], problems, '2026-07-20');
    expect(estimate('new', 'easy')).toBe(SESSION_DEFAULT_MINUTES.new.easy);
    expect(estimate('review', 'hard')).toBe(SESSION_DEFAULT_MINUTES.review.hard);
  });
  it('switches to the median of the user’s own durations, split by first solve vs review', () => {
    const problems = ['a', 'b', 'c'].map((id) => problem(id, 'medium'));
    const attempts = [
      attempt('a', '2026-07-01', 40), attempt('b', '2026-07-02', 50), attempt('c', '2026-07-03', 90),
      attempt('a', '2026-07-05', 8), attempt('b', '2026-07-06', 12), attempt('c', '2026-07-07', 10), attempt('a', '2026-07-08', null)
    ];
    const estimate = minutesEstimator(attempts, problems, '2026-07-20');
    expect(estimate('new', 'medium')).toBe(50);
    expect(estimate('review', 'medium')).toBe(10);
    expect(estimate('new', 'easy')).toBe(SESSION_DEFAULT_MINUTES.new.easy);
  });
  it('ignores today’s attempts so the estimate is stable through the day', () => {
    const problems = ['a', 'b', 'c'].map((id) => problem(id, 'easy'));
    const attempts = [attempt('a', '2026-07-20', 5), attempt('b', '2026-07-20', 5), attempt('c', '2026-07-20', 5)];
    expect(minutesEstimator(attempts, problems, '2026-07-20')('new', 'easy')).toBe(SESSION_DEFAULT_MINUTES.new.easy);
    expect(minutesEstimator(attempts, problems, '2026-07-21')('new', 'easy')).toBe(5);
  });
});

describe('fit plan to budget', () => {
  const plan = [review(problem('r1', 'medium')), review(problem('r2', 'easy')), fresh(problem('n1', 'medium')), fresh(problem('n2', 'easy'))];
  it('returns the plan unchanged with no budget', () => {
    expect(fitPlanToBudget(plan, null, defaults)).toBe(plan);
  });
  it('keeps the first new problem and the top review first, then fills the room left', () => {
    // n1 35 + r1 20 = 55; r2 (10) still fits under 65, n2 (20) does not.
    expect(fitPlanToBudget(plan, 65, defaults).map((item) => item.problem.id)).toEqual(['r1', 'r2', 'n1']);
  });
  it('skips an item that does not fit and takes a smaller one further down', () => {
    // n1 35; r1 20 does not fit 45; r2 10 does; n2 20 does not.
    expect(fitPlanToBudget(plan, 45, defaults).map((item) => item.problem.id)).toEqual(['r2', 'n1']);
  });
  it('fills leftover minutes with spare due reviews, up to the item cap', () => {
    const spare = [review(problem('s1', 'easy')), review(problem('s2', 'easy'))];
    // n1 35 + r1 20 + r2 10 = 65; s1 10 = 75 fits 80; the cap of 4 stops s2.
    expect(fitPlanToBudget(plan, 80, defaults, spare, 4).map((item) => item.problem.id)).toEqual(['r1', 'r2', 's1', 'n1']);
  });
  it('never returns an empty plan, even when the first item alone is over budget', () => {
    const hard = [fresh(problem('h', 'hard'))];
    expect(fitPlanToBudget(hard, 30, defaults)).toEqual(hard);
  });
  it('stays within budget whenever more than one item is kept', () => {
    for (const budget of [30, 45, 60]) {
      const fitted = fitPlanToBudget(plan, budget, defaults);
      if (fitted.length > 1) expect(planMinutes(fitted, defaults)).toBeLessThanOrEqual(budget);
    }
  });
});
