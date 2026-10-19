import { describe, expect, it } from 'vitest';
import { selectDailyPlan } from './dailyPlan';
import { progressAfterAttempt, localDate } from './reviews';
import { catalog } from '../data/catalog';
import { TOPIC_TIERS } from '../data/topicTiers';
import type { ProblemProgress, RecommendationEvent } from '../types/models';

// Replays N simulated days over the real catalog, always solving each item
// strongly so review stages (and topic mastery) advance the way they would for
// a diligent user. Asserts the qualities the adaptive plan is meant to have.
function simulate(days: number) {
  const progress = new Map<string, ProblemProgress>();
  const events: RecommendationEvent[] = [];
  const perDay: { kind: string; topic: string }[][] = [];
  for (let day = 0; day < days; day += 1) {
    const now = new Date(2026, 6, 1 + day, 12);
    const plan = selectDailyPlan({ problems: catalog, progress: [...progress.values()], recommendationEvents: events, now });
    perDay.push(plan.map((item) => ({ kind: item.kind, topic: item.problem.primaryTopic })));
    for (const item of plan) {
      events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
      const next = progressAfterAttempt(progress.get(item.problem.id), 'strong', localDate(0, now), now.toISOString(), false, now);
      progress.set(item.problem.id, { ...next, problemId: item.problem.id });
    }
  }
  return { perDay, progress };
}

describe('daily plan simulation over the real catalog', () => {
  it('keeps every day sized 2-4 with at least one new problem', () => {
    const { perDay } = simulate(30);
    for (const plan of perDay) {
      expect(plan.length).toBeGreaterThanOrEqual(2);
      expect(plan.length).toBeLessThanOrEqual(4);
      expect(plan.some((item) => item.kind === 'new')).toBe(true);
    }
  });

  it('never serves two new problems from the same topic on one day', () => {
    const { perDay } = simulate(30);
    for (const plan of perDay) {
      const newTopics = plan.filter((item) => item.kind === 'new').map((item) => item.topic);
      expect(new Set(newTopics).size).toBe(newTopics.length);
    }
  });

  it('rotates across every foundational topic within a month', () => {
    const { perDay } = simulate(30);
    const topics = new Set(perDay.flat().filter((item) => item.kind === 'new').map((item) => item.topic));
    // All seven tier-1 topics, versus the old engine's 5 topics in 14 days that
    // just ping-ponged between Arrays and Two Pointers.
    expect(topics.size).toBeGreaterThanOrEqual(7);
  });

  it('keeps new problems inside tier-1 foundations over the first two weeks', () => {
    const { perDay } = simulate(14);
    const newTopics = perDay.flat().filter((item) => item.kind === 'new').map((item) => item.topic);
    expect(newTopics.every((topic) => TOPIC_TIERS[topic] === 1)).toBe(true);
  });

  it('progresses to tier-2 and tier-3 topics once foundations are worked through', () => {
    // 150 days: the 250 catalog has ~100 more tier-1 problems than the old 150, so tier 3 arrives later.
    const { perDay } = simulate(150);
    const tiers = new Set(perDay.flat().filter((item) => item.kind === 'new').map((item) => TOPIC_TIERS[item.topic]));
    expect(tiers.has(2)).toBe(true);
    expect(tiers.has(3)).toBe(true);
  });

  it('a blind-spot topic the user keeps failing does not crowd out the rest of the plan', () => {
    // A user who solves everything strongly EXCEPT "Two Pointers", which they fail
    // every time. Before the struggling fix, a weak attempt resets reviewStage to
    // 0, so the topic stayed pinned at maximum priority and its problems returned
    // for review every single day while new slots kept pulling more from it.
    const target = 'Two Pointers';
    const progress = new Map<string, ProblemProgress>();
    const events: RecommendationEvent[] = [];
    const newTopics: string[] = [];
    const targetNewDifficulties: string[] = [];
    const targetReviewDays: number[] = [];
    for (let day = 0; day < 40; day += 1) {
      const now = new Date(2026, 6, 1 + day, 12);
      const plan = selectDailyPlan({ problems: catalog, progress: [...progress.values()], recommendationEvents: events, now });
      let targetReviewsToday = 0;
      for (const item of plan) {
        if (item.kind === 'new') newTopics.push(item.problem.primaryTopic);
        if (item.kind === 'new' && item.problem.primaryTopic === target) targetNewDifficulties.push(item.problem.difficulty);
        if (item.kind === 'review' && item.problem.primaryTopic === target) targetReviewsToday += 1;
        events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
        const quality = item.problem.primaryTopic === target ? 'weak' : 'strong';
        const next = progressAfterAttempt(progress.get(item.problem.id), quality, localDate(0, now), now.toISOString(), false, now);
        progress.set(item.problem.id, { ...next, problemId: item.problem.id });
      }
      targetReviewDays.push(targetReviewsToday);
    }

    const targetShare = newTopics.filter((topic) => topic === target).length / newTopics.length;
    // Two Pointers has 5 problems out of 150 (~3%); struggling keeps it from
    // ballooning past a reasonable slice of new work.
    expect(targetShare).toBeLessThan(0.25);
    // Breadth preserved: most tier-1 topics still get new problems.
    const tier1 = new Set(newTopics.filter((topic) => TOPIC_TIERS[topic] === 1));
    expect(tier1.size).toBeGreaterThanOrEqual(6);
    // Every attempted Two Pointers problem ends up flagged struggling.
    const targetProgress = [...progress.values()].filter((p) => catalog.find((c) => c.id === p.problemId)?.primaryTopic === target);
    expect(targetProgress.length).toBeGreaterThan(0);
    expect(targetProgress.every((p) => p.struggling)).toBe(true);
    // The difficulty ceiling must NOT rise as the user fails. Struggling problems
    // count as 0 mastery for the ceiling calc (only the priority calc lifts them
    // to 0.5), so failing this topic never unlocks its Medium/Hard problems as a
    // *ceiling-gated* pick. The one allowed exception is the documented fallback:
    // once the single Easy problem is exhausted and the topic is still chosen,
    // `selectNewProblem` serves the easiest remaining unsolved problem regardless
    // of ceiling. So at most one non-Easy new problem may appear (the fallback
    // pick right after the Easy one is used up), never a run of them.
    expect(targetNewDifficulties.length).toBeGreaterThan(0);
    expect(targetNewDifficulties.filter((d) => d !== 'easy').length).toBeLessThanOrEqual(1);
    // The de-escalation actually thins the review load: at least some days after
    // the backoff kicks in carry no Two Pointers review at all.
    expect(targetReviewDays.slice(15).some((count) => count === 0)).toBe(true);
  });

  it('stops recommending a topic once it is fully mastered', () => {
    const target = 'Two Pointers';
    const progress = new Map<string, ProblemProgress>();
    // Drive every Two Pointers problem to mastered (reviewStage 5).
    for (const problem of catalog.filter((item) => item.primaryTopic === target)) {
      progress.set(problem.id, { problemId: problem.id, status: 'mastered', reviewStage: 5, nextReviewDate: null, lastAttemptDate: null, lastQuality: 'strong', strongAttemptCount: 5, consecutiveWeak: 0, struggling: false, updatedAt: '' });
    }
    const plan = selectDailyPlan({ problems: catalog, progress: [...progress.values()], recommendationEvents: [], now: new Date(2026, 6, 1, 12) });
    expect(plan.every((item) => item.problem.primaryTopic !== target || item.kind === 'review')).toBe(true);
  });
});
