import { describe, expect, it } from 'vitest';
import { selectDailyPlan } from './dailyPlan';
import { selectReinforcement } from './reinforcement';
import type { CatalogProblem, Difficulty, ProblemProgress, RecommendationEvent } from '../types/models';

let order = 0;
const problem = (id: string, difficulty: Difficulty, primaryTopic: string): CatalogProblem => {
  order += 1;
  return { id, title: id, slug: id, leetcodeUrl: '', difficulty, topics: [primaryTopic], primaryTopic, neetcodeOrder: order, neetcodeUrl: '', lists: ['nc250'] };
};
const problems = [
  problem('ah-easy', 'easy', 'Arrays & Hashing'),
  problem('tp-easy-1', 'easy', 'Two Pointers'),
  problem('tp-easy-2', 'easy', 'Two Pointers'),
  problem('tp-medium', 'medium', 'Two Pointers'),
  problem('st-easy', 'easy', 'Stack'),
  problem('st-medium', 'medium', 'Stack'),
  problem('bs-easy', 'easy', 'Binary Search')
];
const today = '2026-07-19';
const now = new Date(2026, 6, 19, 12);
const row = (problemId: string, changes: Partial<ProblemProgress>): ProblemProgress => ({ problemId, status: 'attempted', reviewStage: 0, nextReviewDate: null, lastAttemptDate: null, lastQuality: null, strongAttemptCount: 0, consecutiveWeak: 0, struggling: false, updatedAt: '', ...changes });
const failing = row('tp-medium', { consecutiveWeak: 3, struggling: true, lastQuality: 'weak', lastAttemptDate: today, nextReviewDate: '2026-07-21' });
const solved = (id: string, lastAttemptDate = '2026-07-01', reviewStage: ProblemProgress['reviewStage'] = 2) => row(id, { status: 'solved', reviewStage, lastQuality: 'strong', lastAttemptDate, nextReviewDate: '2026-08-30' });
const byId = (...rows: ProblemProgress[]) => new Map(rows.map((item) => [item.problemId, item]));

describe('selectReinforcement', () => {
  it('offers nothing while no problem is struggling', () => {
    expect(selectReinforcement(problems, byId(solved('tp-easy-1')), new Set(), today)).toBeUndefined();
  });

  it('triggers on two consecutive weak attempts, before the struggling flag', () => {
    const twice = row('tp-medium', { consecutiveWeak: 2, lastQuality: 'weak' });
    expect(selectReinforcement(problems, byId(twice, solved('tp-easy-1')), new Set(), today)?.problem.id).toBe('tp-easy-2');
    expect(selectReinforcement(problems, byId(row('tp-medium', { consecutiveWeak: 1 }), solved('tp-easy-1')), new Set(), today)).toBeUndefined();
  });

  it('prefers an unsolved problem one level easier from the same topic, as a new problem', () => {
    const pick = selectReinforcement(problems, byId(failing, solved('tp-easy-2'), solved('ah-easy')), new Set(), today);
    expect(pick).toMatchObject({ kind: 'new', target: { id: 'tp-medium' } });
    expect(pick?.problem.id).toBe('tp-easy-1');
  });

  it('with no unsolved stepping stone left, takes a solved easier problem from the same topic, as a review', () => {
    const pick = selectReinforcement(problems, byId(failing, solved('tp-easy-1', '2026-07-05'), solved('tp-easy-2'), solved('ah-easy')), new Set(), today);
    expect(pick).toMatchObject({ kind: 'review', target: { id: 'tp-medium' } });
    expect(pick?.problem.id).toBe('tp-easy-2');
  });

  it('never serves a well-retained problem (stage 3+) as a warm-up', () => {
    const pick = selectReinforcement(problems, byId(failing, solved('tp-easy-1', '2026-07-01', 3), solved('tp-easy-2', '2026-07-01', 5), solved('ah-easy')), new Set(), today);
    expect(pick?.problem.id).toBe('ah-easy');
  });

  it('falls back to a solved problem in a prerequisite topic', () => {
    const pick = selectReinforcement(problems, byId(failing, solved('tp-easy-1', '2026-07-01', 4), solved('tp-easy-2', '2026-07-01', 4), solved('ah-easy'), solved('st-easy')), new Set(), today);
    expect(pick).toMatchObject({ kind: 'review' });
    expect(pick?.problem.id).toBe('ah-easy');
  });

  it('falls back to an unsolved same-topic Easy, as a new problem', () => {
    const pick = selectReinforcement(problems, byId(failing), new Set(), today);
    expect(pick).toMatchObject({ kind: 'new' });
    expect(pick?.problem.id).toBe('tp-easy-1');
  });

  it('skips a candidate attempted yesterday, and skipped ids', () => {
    const progress = byId(failing, solved('tp-easy-1', '2026-07-18'), solved('tp-easy-2'), solved('ah-easy'));
    expect(selectReinforcement(problems, progress, new Set(), today)?.problem.id).toBe('tp-easy-2');
    expect(selectReinforcement(problems, progress, new Set(['tp-easy-2']), today)?.problem.id).toBe('ah-easy');
  });

  it('is undefined when nothing suitable is left', () => {
    const progress = byId(failing, solved('tp-easy-1'), solved('tp-easy-2'), solved('ah-easy'));
    const none = selectReinforcement(problems, progress, new Set(['tp-easy-1', 'tp-easy-2', 'ah-easy']), today);
    expect(none).toBeUndefined();
  });
});

describe('warm-up in the daily plan', () => {
  const input = (rows: ProblemProgress[], events: RecommendationEvent[] = []) => ({ problems, progress: rows, recommendationEvents: events, now });

  it('adds one warm-up, labelled with the problem it reinforces, within 2-4 items and with a new problem', () => {
    const plan = selectDailyPlan(input([failing, solved('tp-easy-1')]));
    const warmUps = plan.filter((item) => item.reason === 'reinforce');
    expect(warmUps).toHaveLength(1);
    expect(warmUps[0].problem.id).toBe('tp-easy-2');
    expect(warmUps[0].reinforces?.id).toBe('tp-medium');
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan.length).toBeLessThanOrEqual(4);
    expect(plan.some((item) => item.kind === 'new' && item.reason === undefined)).toBe(true);
  });

  it('has no warm-up once the problem is no longer struggling', () => {
    const recovered = row('tp-medium', { lastQuality: 'strong', lastAttemptDate: today, nextReviewDate: '2026-07-22' });
    expect(selectDailyPlan(input([recovered, solved('tp-easy-1')])).some((item) => item.reason)).toBe(false);
  });

  it('recomputes the reason when the stored plan is replayed, using only new/review kinds', () => {
    const rows = [failing, solved('tp-easy-1')];
    const first = selectDailyPlan(input(rows));
    const stored = first.map((item): RecommendationEvent => ({ id: item.problem.id, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null }));
    expect(stored.every((event) => event.kind === 'new' || event.kind === 'review')).toBe(true);
    const replay = selectDailyPlan(input(rows, stored));
    const summary = (plan: typeof first) => plan.map((item) => `${item.problem.id}|${item.kind}|${item.reason}`).sort();
    expect(summary(replay)).toEqual(summary(first));
  });

  it('drops the label from a replayed plan once the problem stops struggling', () => {
    const first = selectDailyPlan(input([failing, solved('tp-easy-1')]));
    const stored = first.map((item): RecommendationEvent => ({ id: item.problem.id, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null }));
    const recovered = row('tp-medium', { lastQuality: 'strong', lastAttemptDate: today, nextReviewDate: '2026-07-22' });
    const replay = selectDailyPlan(input([recovered, solved('tp-easy-1')], stored));
    // Every stored item stays; only the label goes.
    const ids = replay.map((item) => item.problem.id);
    expect(first.every((item) => ids.includes(item.problem.id))).toBe(true);
    expect(replay.some((item) => item.reason)).toBe(false);
  });

  it('does not count a still-due review as a warm-up', () => {
    const due = row('tp-easy-1', { status: 'solved', reviewStage: 1, lastQuality: 'strong', lastAttemptDate: '2026-07-10', nextReviewDate: '2026-07-13' });
    const rows = [failing, due];
    const stored: RecommendationEvent[] = [{ id: 'x', problemId: 'tp-easy-1', kind: 'review', recommendedAt: now.toISOString(), skippedUntil: null }];
    expect(selectDailyPlan(input(rows, stored)).find((item) => item.problem.id === 'tp-easy-1')?.reason).toBeUndefined();
  });
});
