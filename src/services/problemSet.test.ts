import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import { dueReviewQueue, selectDailyPlan } from './dailyPlan';
import { masteryByTopic } from './mastery';
import { DEFAULT_PROBLEM_SET, parseProblemSet, problemsInSet } from './problemSet';
import type { ProblemProgress } from '../types/models';

const now = new Date(2026, 6, 19, 12);
const dueProgress = (problemId: string): ProblemProgress => ({ problemId, status: 'solved', reviewStage: 2, nextReviewDate: '2026-07-10', lastAttemptDate: '2026-07-03', lastQuality: 'strong', strongAttemptCount: 2, consecutiveWeak: 0, struggling: false, updatedAt: '' });

describe('parseProblemSet', () => {
  it('defaults to the 150 when the setting is missing or unknown', () => {
    expect(DEFAULT_PROBLEM_SET).toBe('nc150');
    expect(parseProblemSet(undefined)).toBe('nc150');
    expect(parseProblemSet('nc1000')).toBe('nc150');
    expect(parseProblemSet('')).toBe('nc150');
  });
  it('accepts each known set', () => {
    expect(parseProblemSet('nc75')).toBe('nc75');
    expect(parseProblemSet('nc150')).toBe('nc150');
    expect(parseProblemSet('nc250')).toBe('nc250');
  });
});

describe('problemsInSet', () => {
  it('filters the catalog to 75 / 150 / 250 and the sets nest', () => {
    const [s75, s150, s250] = (['nc75', 'nc150', 'nc250'] as const).map((set) => problemsInSet(catalog, set));
    expect([s75.length, s150.length, s250.length]).toEqual([75, 150, 250]);
    const ids150 = new Set(s150.map((p) => p.id));
    expect(s75.every((p) => ids150.has(p.id))).toBe(true);
  });
  it('skipEasies drops every Easy from the view and nothing else, for every set', () => {
    for (const set of ['nc75', 'nc150', 'nc250'] as const) {
      const all = problemsInSet(catalog, set);
      const skipped = problemsInSet(catalog, set, true);
      expect(skipped.some((p) => p.difficulty === 'easy')).toBe(false);
      expect(skipped).toEqual(all.filter((p) => p.difficulty !== 'easy'));
      expect(skipped.length).toBeLessThan(all.length);
      expect(problemsInSet(catalog, set, false)).toEqual(all);
    }
  });
  it('leaves catalog order intact', () => {
    const orders = problemsInSet(catalog, 'nc75').map((p) => p.neetcodeOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
  it('keeps the per-topic totals the map shows in step with the set', () => {
    const total = (set: 'nc75' | 'nc150' | 'nc250') => masteryByTopic(problemsInSet(catalog, set), []).reduce((sum, cell) => sum + cell.total, 0);
    expect([total('nc75'), total('nc150'), total('nc250')]).toEqual([75, 150, 250]);
  });
});

describe('out-of-set problems', () => {
  const outOfSet = catalog.find((p) => !p.lists.includes('nc75'))!;
  const active = problemsInSet(catalog, 'nc75');

  it('still come due in the review queue, which is fed the whole catalog', () => {
    const queue = dueReviewQueue(catalog, [dueProgress(outOfSet.id)], now);
    expect(queue.map((entry) => entry.problem.id)).toEqual([outOfSet.id]);
  });
  it('are never recommended as new problems when the set is narrower', () => {
    const plan = selectDailyPlan({ problems: active, progress: [], recommendationEvents: [], now });
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((item) => item.problem.lists.includes('nc75'))).toBe(true);
  });
  it('leave the daily plan alone but are not lost: progress rows are untouched by filtering', () => {
    const rows = [dueProgress(outOfSet.id)];
    const plan = selectDailyPlan({ problems: active, progress: rows, recommendationEvents: [], now });
    expect(plan.some((item) => item.problem.id === outOfSet.id)).toBe(false);
    expect(rows).toHaveLength(1);
  });
});
