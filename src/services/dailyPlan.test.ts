import { describe, expect, it } from 'vitest';
import { activeDaysSinceNew, dueReviewQueue, planDueCount, reviewsUntilNewProblems, selectDailyPlan } from './dailyPlan';
import { minutesEstimator, planMinutes } from './sessionTime';
import { catalog } from '../data/catalog';
import type { CatalogProblem, ProblemProgress, RecommendationEvent } from '../types/models';

const problems: CatalogProblem[] = [
  { id: 'a', title: 'A', slug: 'a', leetcodeUrl: 'https://leetcode.com/problems/a/', difficulty: 'easy', topics: ['Arrays'], primaryTopic: 'Arrays', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 1 },
  { id: 'b', title: 'B', slug: 'b', leetcodeUrl: 'https://leetcode.com/problems/b/', difficulty: 'medium', topics: ['Arrays'], primaryTopic: 'Arrays', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 2 },
  { id: 'c', title: 'C', slug: 'c', leetcodeUrl: 'https://leetcode.com/problems/c/', difficulty: 'hard', topics: ['Trees'], primaryTopic: 'Trees', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 3 },
  { id: 'd', title: 'D', slug: 'd', leetcodeUrl: 'https://leetcode.com/problems/d/', difficulty: 'easy', topics: ['Trees'], primaryTopic: 'Trees', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 4 }
];
const now = new Date(2026, 6, 19, 12);
const progress = (problemId: string, changes: Partial<ProblemProgress>): ProblemProgress => ({ problemId, status: 'attempted', reviewStage: 0, nextReviewDate: null, lastAttemptDate: null, lastQuality: null, strongAttemptCount: 0, consecutiveWeak: 0, struggling: false, updatedAt: '', ...changes });
const event = (problemId: string, kind: RecommendationEvent['kind'], recommendedAt: string, skippedUntil: string | null = null): RecommendationEvent => ({ id: `${problemId}-${recommendedAt}`, problemId, kind, recommendedAt, skippedUntil });

describe('due review queue', () => {
  it('returns every due problem, weakest last-quality then most overdue first', () => {
    const queue = dueReviewQueue(problems, [
      progress('a', { nextReviewDate: '2026-07-10', lastQuality: 'strong' }),
      progress('b', { nextReviewDate: '2026-07-18', lastQuality: 'weak' }),
      progress('c', { nextReviewDate: '2026-07-05', lastQuality: 'partial' }),
      progress('d', { nextReviewDate: '2026-08-01' })
    ], now);
    expect(queue.map((entry) => entry.problem.id)).toEqual(['b', 'c', 'a']);
  });
  it('serves the review most overdue for its own interval first, within a quality', () => {
    // a: 3-day interval, 9 days late (ratio 3). b: 30-day interval, 49 days late (ratio 1.6) — b was due first by date.
    const queue = dueReviewQueue(problems, [
      progress('a', { lastAttemptDate: '2026-07-07', nextReviewDate: '2026-07-10', lastQuality: 'weak' }),
      progress('b', { lastAttemptDate: '2026-05-01', nextReviewDate: '2026-05-31', lastQuality: 'weak' })
    ], now);
    expect(queue.map((entry) => entry.problem.id)).toEqual(['a', 'b']);
  });
  it('still serves a weak review before a strong one however late the strong one is', () => {
    const queue = dueReviewQueue(problems, [
      progress('a', { lastAttemptDate: '2026-06-01', nextReviewDate: '2026-06-02', lastQuality: 'strong' }),
      progress('b', { lastAttemptDate: '2026-07-18', nextReviewDate: '2026-07-19', lastQuality: 'weak' })
    ], now);
    expect(queue.map((entry) => entry.problem.id)).toEqual(['b', 'a']);
  });
  it('includes problems skipped from the daily challenge (queue is the review-everything surface)', () => {
    const queue = dueReviewQueue(problems, [progress('a', { nextReviewDate: '2026-07-01' })], now);
    expect(queue.map((entry) => entry.problem.id)).toEqual(['a']);
  });
  it('is empty when nothing is due', () => {
    expect(dueReviewQueue(problems, [progress('a', { nextReviewDate: '2026-08-15' })], now)).toEqual([]);
  });
});

describe('daily plan selection', () => {
  it('leads with the two earliest due reviews and still adds a new problem', () => {
    const result = selectDailyPlan({ problems, progress: [progress('c', { nextReviewDate: '2026-07-19' }), progress('b', { nextReviewDate: '2026-07-18' }), progress('a', { nextReviewDate: '2026-07-17' })], recommendationEvents: [], now });
    expect(result.slice(0, 2).map((item) => `${item.kind}:${item.problem.id}`)).toEqual(['review:a', 'review:b']);
    expect(result).toHaveLength(3);
    expect(result[2]?.kind).toBe('new');
  });
  it('orders due reviews by weakest last quality before most overdue', () => {
    const result = selectDailyPlan({
      problems,
      progress: [progress('a', { nextReviewDate: '2026-07-10', lastQuality: 'strong' }), progress('b', { nextReviewDate: '2026-07-18', lastQuality: 'weak' })],
      recommendationEvents: [],
      now
    });
    expect(result[0]?.problem.id).toBe('b');
  });
  it('uses topic attempt counts, gates difficulty, and avoids the last two new topics', () => {
    const result = selectDailyPlan({ problems, progress: [progress('a', { strongAttemptCount: 2 })], recommendationEvents: [event('a', 'new', '2026-07-18T09:00:00.000Z')], now });
    expect(result[0]?.problem.id).toBe('d');
  });
  it('does not select items with an active skip', () => {
    const result = selectDailyPlan({ problems, progress: [], recommendationEvents: [event('a', 'new', '2026-07-19T10:00:00.000Z', '2026-07-20T10:00:00.000Z')], now });
    expect(result.at(-1)?.problem.id).not.toBe('a');
  });
  it('fills the daily challenge with two distinct problems when there are no due reviews', () => {
    const result = selectDailyPlan({ problems, progress: [], recommendationEvents: [], now });
    expect(result).toHaveLength(2);
    expect(new Set(result.map((item) => item.problem.id)).size).toBe(2);
  });
  it('keeps today’s recommended challenges after their progress changes', () => {
    const result = selectDailyPlan({
      problems,
      progress: [progress('a', { status: 'solved' }), progress('d', { status: 'solved' })],
      recommendationEvents: [event('a', 'new', '2026-07-19T10:00:00.000Z'), event('d', 'new', '2026-07-19T10:00:00.000Z')],
      now
    });
    expect(result.map((item) => item.problem.id)).toEqual(['a', 'd']);
  });
  it('fills an incomplete current-day plan without replacing its existing recommendation', () => {
    const result = selectDailyPlan({
      problems,
      progress: [],
      recommendationEvents: [event('a', 'new', '2026-07-19T10:00:00.000Z')],
      now
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.problem.id).toBe('a');
  });
  it('replays every distinct recommendation saved today, capped at four', () => {
    const result = selectDailyPlan({
      problems,
      progress: [],
      recommendationEvents: [event('a', 'new', '2026-07-19T10:00:00.000Z'), event('b', 'new', '2026-07-19T10:00:00.000Z'), event('c', 'new', '2026-07-19T10:00:00.000Z')],
      now
    });
    expect(result.map((item) => item.problem.id)).toEqual(['a', 'b', 'c']);
  });
  it('always includes at least one new problem when the plan has capacity', () => {
    const result = selectDailyPlan({
      problems,
      progress: [progress('a', { nextReviewDate: '2026-07-18' }), progress('b', { nextReviewDate: '2026-07-18' }), progress('c', { nextReviewDate: '2026-07-18' })],
      recommendationEvents: [],
      now
    });
    expect(result.some((item) => item.kind === 'new')).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(4);
  });
  it('never shrinks the plan as the review backlog grows', () => {
    // Over the real catalog so fillNewProblems always has candidates. Every user
    // — no backlog, small backlog, large backlog — gets a plan at least as big
    // as a user with a smaller backlog, and always review-first.
    const due = (count: number) => catalog.slice(0, count).map((problem) => progress(problem.id, { nextReviewDate: '2026-07-18', lastQuality: 'strong' }));
    const sizes = [0, 1, 2, 4, 8, 11, 12, 30].map((count) => selectDailyPlan({ problems: catalog, progress: due(count), recommendationEvents: [], now }).length);
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThanOrEqual(sizes[index - 1]);
    }
    expect(sizes).toEqual([2, 3, 3, 3, 4, 4, 4, 4]);
  });

  // Partial (hint-needed) reviews: real gaps, so each one is owed (strong ones of one
  // topic would be a single owed review since T22, see patternReview.ts).
  const owed = (count: number) => catalog.slice(0, count).map((problem) => progress(problem.id, { nextReviewDate: '2026-07-18', lastQuality: 'partial' }));
  it('past the overload line keeps one new problem (the exploration floor); at twice the line the plan is all reviews', () => {
    const calm = selectDailyPlan({ problems: catalog, progress: owed(11), recommendationEvents: [], now });
    const overloaded = selectDailyPlan({ problems: catalog, progress: owed(12), recommendationEvents: [], now });
    const braked = selectDailyPlan({ problems: catalog, progress: owed(24), recommendationEvents: [], now });
    expect(calm.some((item) => item.kind === 'new')).toBe(true);
    expect(overloaded).toHaveLength(4);
    expect(overloaded.filter((item) => item.kind === 'new')).toHaveLength(1);
    expect(braked).toHaveLength(4);
    expect(braked.every((item) => item.kind === 'review')).toBe(true);
  });
  it('owes one maintenance review per topic: strong due reviews of one topic count once', () => {
    const strong = catalog.filter((problem) => problem.primaryTopic === 'Arrays & Hashing').slice(0, 6)
      .map((problem) => progress(problem.id, { nextReviewDate: '2026-07-18', lastAttemptDate: '2026-07-11', lastQuality: 'strong', reviewStage: 2 }));
    expect(planDueCount({ problems: catalog, progress: strong, recommendationEvents: [], now })).toBe(1);
    const plan = selectDailyPlan({ problems: catalog, progress: strong, recommendationEvents: [], now });
    expect(plan.filter((item) => item.kind === 'review')).toHaveLength(1);
  });
  it('keeps an overloaded plan stable across the day as reviews are logged', () => {
    const due = owed;
    const plan = selectDailyPlan({ problems: catalog, progress: due(26), recommendationEvents: [], now });
    const stored = plan.map((item) => event(item.problem.id, item.kind, now.toISOString()));
    const later = selectDailyPlan({ problems: catalog, progress: due(10), recommendationEvents: stored, now });
    expect(later.map((item) => item.problem.id)).toEqual(plan.map((item) => item.problem.id));
  });
});

describe('time budget', () => {
  const minutes = minutesEstimator([], catalog, '2026-07-19');
  const due = (count: number) => catalog.slice(0, count).map((problem) => progress(problem.id, { nextReviewDate: '2026-07-18', lastQuality: 'strong' }));

  it('trims a fresh plan to the budget, keeping its new problem', () => {
    const open = selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: [], now });
    const budgeted = selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: [], sessionMinutes: 30, now });
    expect(planMinutes(open, minutes)).toBeGreaterThan(30);
    expect(planMinutes(budgeted, minutes)).toBeLessThanOrEqual(30);
    expect(budgeted.some((item) => item.kind === 'new')).toBe(true);
    expect(budgeted.filter((item) => item.kind === 'new').every((item) => open.some((other) => other.problem.id === item.problem.id))).toBe(true);
  });
  it('is the same plan as before when no budget is set', () => {
    const input = { problems: catalog, progress: due(4), recommendationEvents: [], now };
    expect(selectDailyPlan({ ...input, sessionMinutes: null })).toEqual(selectDailyPlan(input));
  });
  it('does not top a stored plan up past the budget, and never drops a stored item', () => {
    const plan = selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: [], sessionMinutes: 30, now });
    const stored = plan.map((item) => event(item.problem.id, item.kind, now.toISOString()));
    const ids = (items: { problem: { id: string } }[]) => items.map((item) => item.problem.id).sort();
    expect(ids(selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: stored, sessionMinutes: 30, now }))).toEqual(ids(plan));
    // A stored "one more problem" stays even though it takes the plan over budget.
    const extra = catalog.find((problem) => problem.difficulty === 'hard' && !plan.some((item) => item.problem.id === problem.id))!;
    const withExtra = selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: [...stored, event(extra.id, 'new', now.toISOString())], sessionMinutes: 30, now });
    expect(withExtra.map((item) => item.problem.id)).toContain(extra.id);
  });
  it('counts the reviews left to clear before new problems come back', () => {
    // New problems pause only at the hard brake (24 owed reviews with no budget, T23).
    const owed = (count: number) => catalog.slice(0, count).map((problem) => progress(problem.id, { nextReviewDate: '2026-07-18', lastQuality: 'partial' }));
    expect(reviewsUntilNewProblems({ problems: catalog, progress: owed(23), recommendationEvents: [], now })).toBe(0);
    expect(reviewsUntilNewProblems({ problems: catalog, progress: owed(24), recommendationEvents: [], now })).toBe(1);
    expect(reviewsUntilNewProblems({ problems: catalog, progress: owed(27), recommendationEvents: [], now })).toBe(4);
    const skipped = event(catalog[0].id, 'review', now.toISOString(), new Date(2026, 6, 20, 12).toISOString());
    expect(reviewsUntilNewProblems({ problems: catalog, progress: owed(27), recommendationEvents: [skipped], now })).toBe(3);
  });
  it('re-plans the rest of the day after the budget changes, keeping what was logged', () => {
    const before = selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: [], now });
    const morning = new Date(2026, 6, 19, 9).toISOString();
    const stored = before.map((item, index) => ({ ...event(item.problem.id, item.kind, morning), completedAt: index === 0 ? morning : null }));
    const resetAt = new Date(2026, 6, 19, 11).toISOString();
    const after = selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: stored, sessionMinutes: 30, planResetAt: resetAt, now });
    expect(after.map((item) => item.problem.id)).toContain(before[0].problem.id);
    expect(after.length).toBeLessThan(before.length);
    // Without a reset the stored plan is replayed as before.
    expect(selectDailyPlan({ problems: catalog, progress: due(4), recommendationEvents: stored, sessionMinutes: 30, now })).toHaveLength(before.length);
  });
});

describe('activeDaysSinceNew', () => {
  const attempt = (problemId: string, attemptedOn: string) => ({ id: `${problemId}-${attemptedOn}`, problemId, attemptedOn, outcome: 'solved_independently' as const, perceivedDifficulty: 'manageable' as const, helpType: null, durationMinutes: null, notes: '', quality: 'strong' as const, createdAt: `${attemptedOn}T12:00:00.000Z` });
  it('counts the active days before today since the last first attempt on any problem', () => {
    const attempts = [attempt('a', '2026-07-10'), attempt('b', '2026-07-12'), attempt('a', '2026-07-14'), attempt('b', '2026-07-16'), attempt('a', '2026-07-18')];
    expect(activeDaysSinceNew(attempts, '2026-07-19')).toBe(3);
    expect(activeDaysSinceNew([...attempts, attempt('c', '2026-07-18')], '2026-07-19')).toBe(0);
    // Today's attempts do not count yet, so the plan's shape holds through the day.
    expect(activeDaysSinceNew([...attempts, attempt('c', '2026-07-19')], '2026-07-19')).toBe(3);
    expect(activeDaysSinceNew([], '2026-07-19')).toBe(0);
  });
});
