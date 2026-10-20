import { describe, expect, it } from 'vitest';
import { planReasoner, type PlanReasonInput } from './planReason';
import { selectDailyPlan, type DailyPlanItem } from './dailyPlan';
import { REVIEW_OVERLOAD_DUE } from './constants';
import type { Attempt, CatalogProblem, Difficulty, ProblemList, ProblemProgress, RecommendationEvent } from '../types/models';

const today = '2026-07-19';
const now = new Date(2026, 6, 19, 12);
let order = 0;
const problem = (id: string, difficulty: Difficulty, primaryTopic: string, lists: ProblemList[] = ['nc75', 'nc150', 'nc250']): CatalogProblem => {
  order += 1;
  return { id, title: `Title ${id}`, slug: id, leetcodeUrl: '', difficulty, topics: [primaryTopic], primaryTopic, neetcodeOrder: order, neetcodeUrl: '', lists };
};
const catalog = [
  problem('ah-1', 'easy', 'Arrays & Hashing'),
  problem('ah-2', 'medium', 'Arrays & Hashing'),
  problem('ah-3', 'easy', 'Arrays & Hashing', ['nc150', 'nc250']),
  problem('tp-1', 'easy', 'Two Pointers'),
  problem('tp-2', 'easy', 'Two Pointers', ['nc250']),
  problem('bit-1', 'easy', 'Bit Manipulation', ['nc250']),
  problem('trie-1', 'medium', 'Tries')
];
const byId = (id: string) => catalog.find((candidate) => candidate.id === id) as CatalogProblem;
const row = (problemId: string, changes: Partial<ProblemProgress> = {}): ProblemProgress => ({ problemId, status: 'attempted', reviewStage: 1, nextReviewDate: null, lastAttemptDate: null, lastQuality: null, strongAttemptCount: 0, consecutiveWeak: 0, struggling: false, updatedAt: '', ...changes });
const attempt = (problemId: string, attemptedOn: string, quality: Attempt['quality'] = 'strong'): Attempt => ({ id: `${problemId}-${attemptedOn}`, problemId, attemptedOn, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: '', quality, createdAt: `${attemptedOn}T10:00:00.000Z` });
const review = (id: string): DailyPlanItem => ({ problem: byId(id), kind: 'review' });
const fresh = (id: string): DailyPlanItem => ({ problem: byId(id), kind: 'new' });

function reasonFor(item: DailyPlanItem, changes: Partial<PlanReasonInput> = {}): string {
  const input: PlanReasonInput = { plan: [item], problems: catalog, allProblems: catalog, progress: [], attempts: [], profile: 'regular', reviewsUntilNew: 0, today, ...changes };
  return planReasoner(input)(item);
}

describe('planReason: reviews', () => {
  it('says how many days overdue a review is', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: '2026-07-14', lastQuality: 'strong' })] })).toBe('5 days overdue');
  });
  it('uses the singular for one day', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: '2026-07-18', lastQuality: 'strong' })] })).toBe('1 day overdue');
  });
  it('says due today for a review due today', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: today, lastQuality: 'strong' })] })).toBe('Due today');
  });
  it('says so when the last attempt was not solved', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: today, lastQuality: 'weak' })] })).toBe("Last attempt wasn't solved · due today");
  });
  it('says so when the last attempt needed a hint or felt hard, with the overdue days', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: '2026-07-17', lastQuality: 'partial' })] })).toBe('Last attempt needed a hint or felt hard · 2 days overdue');
  });
  it('does not mention quality when the last quality is unknown', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: today })] })).toBe('Due today');
  });
  it('falls back to the true general statement once the review has been logged (schedule moved on)', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: '2026-07-26', lastQuality: 'strong' })] })).toBe('Was due for today');
  });
  it('falls back the same way when the review has no next date or no progress row', () => {
    expect(reasonFor(review('ah-1'), { progress: [row('ah-1', { nextReviewDate: null })] })).toBe('Was due for today');
    expect(reasonFor(review('ah-1'))).toBe('Was due for today');
  });
  it('adds that new problems are paused when every item is a review and reviews are piling up', () => {
    const plan = [review('ah-1'), review('tp-1')];
    const reasonOf = planReasoner({ plan, problems: catalog, allProblems: catalog, progress: [row('ah-1', { nextReviewDate: '2026-07-14', lastQuality: 'strong' })], attempts: [], profile: 'regular', reviewsUntilNew: 3, today });
    expect(reasonOf(plan[0])).toBe('5 days overdue · reviews first');
  });
  it('does not say paused when the plan holds a new problem, or when nothing is piling up', () => {
    const progress = [row('ah-1', { nextReviewDate: '2026-07-14', lastQuality: 'strong' })];
    const mixed = [review('ah-1'), fresh('tp-1')];
    expect(planReasoner({ plan: mixed, problems: catalog, allProblems: catalog, progress, attempts: [], profile: 'regular', reviewsUntilNew: 3, today })(mixed[0])).toBe('5 days overdue');
    const reviewsOnly = [review('ah-1')];
    expect(planReasoner({ plan: reviewsOnly, problems: catalog, allProblems: catalog, progress, attempts: [], profile: 'regular', reviewsUntilNew: 0, today })(reviewsOnly[0])).toBe('5 days overdue');
  });
});

describe('planReason: warm-ups', () => {
  it('names the problem the warm-up builds toward', () => {
    expect(reasonFor({ problem: byId('tp-1'), kind: 'review', reason: 'reinforce', reinforces: byId('ah-2') })).toBe('Warm-up for Title ah-2');
  });
  it('still gives a true line when the target is missing', () => {
    expect(reasonFor({ problem: byId('tp-1'), kind: 'new', reason: 'reinforce' })).toBe('Warm-up for a problem you keep missing');
  });
});

describe('planReason: new problems', () => {
  it('says a topic that has never been touched is new to the user, with its tier', () => {
    expect(reasonFor(fresh('ah-1'))).toBe("A topic you haven't started (Foundations)");
    expect(reasonFor(fresh('trie-1'))).toBe("A topic you haven't started (Advanced)");
  });
  it('counts the topic problems tried before today and says when the difficulty fits the skill', () => {
    // No skill yet in the topic beyond one strong easy: target stays Easy.
    expect(reasonFor(fresh('ah-3'), { attempts: [attempt('ah-1', '2026-07-10')] })).toBe('1 of 3 tried in this topic · Easy fits your level here');
  });
  it('leaves the difficulty clause out when the problem is not at the skill target', () => {
    expect(reasonFor(fresh('ah-2'), { attempts: [attempt('ah-1', '2026-07-10')] })).toBe('1 of 3 tried in this topic');
  });
  it('reads the skill-matched difficulty for a Medium once skill has risen', () => {
    const attempts = Array.from({ length: 12 }, (_, index) => attempt('ah-1', `2026-07-${String(index + 1).padStart(2, '0')}`));
    expect(reasonFor(fresh('ah-2'), { attempts })).toBe('1 of 3 tried in this topic · Medium fits your level here');
  });
  it('does not let logging the item itself rewrite its line (only attempts before today count)', () => {
    const before = reasonFor(fresh('ah-1'));
    const after = reasonFor(fresh('ah-1'), { attempts: [attempt('ah-1', today)] });
    expect(after).toBe(before);
  });
  it('handles a topic practised only on problems outside the set', () => {
    const inSet = catalog.filter((candidate) => candidate.id !== 'ah-1');
    expect(reasonFor(fresh('ah-3'), { problems: inSet, attempts: [attempt('ah-1', '2026-07-10')] })).toBe("You've practised this topic before · Easy fits your level here");
  });
  it('tells a returning user the new problem is from a topic they have skill in', () => {
    expect(reasonFor(fresh('ah-3'), { profile: 'returning', attempts: [attempt('ah-1', '2026-06-01')] })).toBe('Easing back in: a topic you already have skill in');
  });
  it('falls back to the general line for a returning user when the topic has no skill', () => {
    expect(reasonFor(fresh('bit-1'), { profile: 'returning', attempts: [attempt('ah-1', '2026-06-01')] })).toBe("A topic you haven't started (Advanced)");
  });
  it('says core-first for an occasional user, by list', () => {
    expect(reasonFor(fresh('ah-1'), { profile: 'occasional' })).toBe('Core first: from the NeetCode 75');
    expect(reasonFor(fresh('ah-3'), { profile: 'occasional' })).toBe('Core first: from the NeetCode 150');
    expect(reasonFor(fresh('bit-1'), { profile: 'occasional' })).toBe('Core first: the NeetCode 150 has none left to offer');
  });
  it('uses the general line for a brand-new user', () => {
    expect(reasonFor(fresh('tp-1'), { profile: 'new' })).toBe("A topic you haven't started (Foundations)");
  });
});

describe('planReason with the real selector', () => {
  const event = (problemId: string, kind: RecommendationEvent['kind']): RecommendationEvent => ({ id: problemId, problemId, kind, recommendedAt: '2026-07-19T08:00:00.000Z', skippedUntil: null });

  it('explains a fresh plan and gives the same lines when it is replayed from stored items', () => {
    const progress = [
      row('ah-1', { status: 'solved', nextReviewDate: '2026-07-16', lastAttemptDate: '2026-07-15', lastQuality: 'weak' }),
      row('tp-1', { status: 'solved', nextReviewDate: '2026-07-14', lastAttemptDate: '2026-07-07', lastQuality: 'strong' })
    ];
    const attempts = [attempt('ah-1', '2026-07-15', 'weak'), attempt('tp-1', '2026-07-07')];
    const planned = selectDailyPlan({ problems: catalog, progress, recommendationEvents: [], attempts, now });
    const lines = (plan: DailyPlanItem[]) => {
      const reasonOf = planReasoner({ plan, problems: catalog, allProblems: catalog, progress, attempts, profile: 'regular', reviewsUntilNew: 0, today });
      return Object.fromEntries(plan.map((item) => [item.problem.id, reasonOf(item)]));
    };
    const fresh = lines(planned);
    expect(fresh['ah-1']).toBe("Last attempt wasn't solved · 3 days overdue");
    // One review slot at two due: the weaker last attempt wins, the other stays queued.
    expect(fresh['tp-1']).toBeUndefined();
    const newItems = planned.filter((item) => item.kind === 'new');
    expect(newItems.length).toBeGreaterThan(0);
    for (const item of newItems) expect(fresh[item.problem.id]).toMatch(/^(A topic you haven't started|\d+ of \d+ tried|You've practised|Core first|Easing back in)/);

    const replayed = selectDailyPlan({ problems: catalog, progress, recommendationEvents: planned.map((item) => event(item.problem.id, item.kind)), attempts, now });
    expect(lines(replayed)).toEqual(fresh);
  });

  it('explains a review-only day under overload', () => {
    const many: CatalogProblem[] = Array.from({ length: REVIEW_OVERLOAD_DUE + 2 }, (_, index) => problem(`o-${index}`, 'easy', 'Arrays & Hashing'));
    const progress = many.map((item) => row(item.id, { status: 'solved', nextReviewDate: '2026-07-18', lastAttemptDate: '2026-07-11', lastQuality: 'strong' }));
    const planned = selectDailyPlan({ problems: many, progress, recommendationEvents: [], now });
    expect(planned.every((item) => item.kind === 'review')).toBe(true);
    const reasonOf = planReasoner({ plan: planned, problems: many, allProblems: many, progress, attempts: [], profile: 'regular', reviewsUntilNew: 3, today });
    expect(planned.map(reasonOf)).toEqual(planned.map(() => '1 day overdue · reviews first'));
  });

  it('names the warm-up target on a real plan and leaves selection alone', () => {
    const progress = [
      row('ah-2', { consecutiveWeak: 3, struggling: true, lastQuality: 'weak', lastAttemptDate: today, nextReviewDate: '2026-07-21' }),
      row('ah-1', { status: 'solved', reviewStage: 3, lastQuality: 'strong', lastAttemptDate: '2026-07-01', nextReviewDate: '2026-08-30' })
    ];
    const planned = selectDailyPlan({ problems: catalog, progress, recommendationEvents: [], now });
    const before = JSON.stringify(planned.map((item) => [item.problem.id, item.kind, item.reason]));
    const reasonOf = planReasoner({ plan: planned, problems: catalog, allProblems: catalog, progress, attempts: [], profile: 'regular', reviewsUntilNew: 0, today });
    const warmUp = planned.find((item) => item.reason === 'reinforce');
    expect(warmUp && reasonOf(warmUp)).toBe('Warm-up for Title ah-2');
    expect(JSON.stringify(planned.map((item) => [item.problem.id, item.kind, item.reason]))).toBe(before);
  });
});
