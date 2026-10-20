import { describe, expect, it } from 'vitest';
import { dueReviewQueue, planDueCount, selectDailyPlan, selectExtraProblem, type DailyPlanItem } from './dailyPlan';
import { cadenceFor } from './cadence';
import { REVIEW_HARD_BRAKE_FACTOR, REVIEW_OVERLOAD_DUE } from './constants';

// T23: past the overload line the plan keeps one new problem (the exploration
// floor); only at the hard brake is it all reviews.
const HARD_BRAKE_DUE = REVIEW_OVERLOAD_DUE * REVIEW_HARD_BRAKE_FACTOR;
import { coreRank } from './coreRank';
import { lightReviewEligible, progressAfterAttempt, localDate } from './reviews';
import { catalog } from '../data/catalog';
import { TOPIC_TIERS } from '../data/topicTiers';
import { problemsInSet } from './problemSet';
import { minutesEstimator, planMinutes } from './sessionTime';
import type { Attempt, CatalogProblem, PerceivedDifficulty, ProblemList, ProblemProgress, Quality, RecommendationEvent } from '../types/models';

function attemptRow(problem: CatalogProblem, quality: Quality, now: Date, day: number): Attempt {
  return { id: `${problem.id}-${day}`, problemId: problem.id, attemptedOn: localDate(0, now), outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: '', quality, createdAt: now.toISOString() };
}

// Generic runner for the T3 targets: one persona, one problem set, daily cadence.
function run(days: number, set: ProblemList, qualityOf: (problem: CatalogProblem, day: number) => Quality) {
  const problems = problemsInSet(catalog, set);
  const progress = new Map<string, ProblemProgress>();
  const events: RecommendationEvent[] = [];
  const attempts: Attempt[] = [];
  const newByTopic = new Map<string, { day: number; problem: CatalogProblem }[]>();
  const qualitiesByTopic = new Map<string, { day: number; problem: CatalogProblem; quality: Quality }[]>();
  for (let day = 0; day < days; day += 1) {
    const now = new Date(2026, 6, 1 + day, 12);
    const plan = selectDailyPlan({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, now });
    for (const item of plan) {
      const topic = item.problem.primaryTopic;
      if (item.kind === 'new') newByTopic.set(topic, [...(newByTopic.get(topic) ?? []), { day, problem: item.problem }]);
      const quality = qualityOf(item.problem, day);
      qualitiesByTopic.set(topic, [...(qualitiesByTopic.get(topic) ?? []), { day, problem: item.problem, quality }]);
      events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
      attempts.push(attemptRow(item.problem, quality, now, day));
      const next = progressAfterAttempt(progress.get(item.problem.id), quality, localDate(0, now), now.toISOString(), false, now);
      progress.set(item.problem.id, { ...next, problemId: item.problem.id });
    }
  }
  return { problems, newByTopic, qualitiesByTopic };
}


// Replays N simulated days over the real catalog, always solving each item
// strongly so review stages (and topic mastery) advance the way they would for
// a diligent user. Asserts the qualities the adaptive plan is meant to have.
function simulate(days: number) {
  const progress = new Map<string, ProblemProgress>();
  const events: RecommendationEvent[] = [];
  const attempts: Attempt[] = [];
  const perDay: { kind: string; topic: string }[][] = [];
  for (let day = 0; day < days; day += 1) {
    const now = new Date(2026, 6, 1 + day, 12);
    const plan = selectDailyPlan({ problems: catalog, progress: [...progress.values()], recommendationEvents: events, attempts, now });
    perDay.push(plan.map((item) => ({ kind: item.kind, topic: item.problem.primaryTopic })));
    for (const item of plan) {
      events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
      attempts.push(attemptRow(item.problem, 'strong', now, day));
      const next = progressAfterAttempt(progress.get(item.problem.id), 'strong', localDate(0, now), now.toISOString(), false, now);
      progress.set(item.problem.id, { ...next, problemId: item.problem.id });
    }
  }
  return { perDay, progress };
}

describe('daily plan simulation over the real catalog', () => {
  it('keeps every day sized 2-4 with at least one new problem, except an all-review overload day', () => {
    const { perDay } = simulate(30);
    for (const plan of perDay) {
      expect(plan.length).toBeGreaterThanOrEqual(2);
      expect(plan.length).toBeLessThanOrEqual(4);
      expect(plan.some((item) => item.kind === 'new') || plan.every((item) => item.kind === 'review')).toBe(true);
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
    // T22 changed this from "every new problem is tier 1": a review slot freed by
    // pattern coverage on day 3 lets one Greedy Easy (tier 2, its only prerequisite
    // Arrays & Hashing already met) in on day 4. Tier 3 still never appears.
    const { perDay } = simulate(14);
    const newTopics = perDay.flat().filter((item) => item.kind === 'new').map((item) => item.topic);
    expect(newTopics.filter((topic) => TOPIC_TIERS[topic] === 1).length / newTopics.length).toBeGreaterThanOrEqual(0.9);
    expect(newTopics.some((topic) => TOPIC_TIERS[topic] === 3)).toBe(false);
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
    const attempts: Attempt[] = [];
    const newTopics: string[] = [];
    const targetNewDifficulties: string[] = [];
    const targetReviewDays: number[] = [];
    for (let day = 0; day < 40; day += 1) {
      const now = new Date(2026, 6, 1 + day, 12);
      const plan = selectDailyPlan({ problems: catalog, progress: [...progress.values()], recommendationEvents: events, attempts, now });
      let targetReviewsToday = 0;
      for (const item of plan) {
        if (item.kind === 'new') newTopics.push(item.problem.primaryTopic);
        if (item.kind === 'new' && item.problem.primaryTopic === target) targetNewDifficulties.push(item.problem.difficulty);
        if (item.kind === 'review' && item.problem.primaryTopic === target) targetReviewsToday += 1;
        events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
        const quality = item.problem.primaryTopic === target ? 'weak' : 'strong';
        attempts.push(attemptRow(item.problem, quality, now, day));
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

describe('T3 difficulty targets (skill-driven, every problem set)', () => {
  const sets: ProblemList[] = ['nc75', 'nc150', 'nc250'];

  for (const set of sets) {
    it(`${set}: offers Medium after at most 2 strong Easies and Hard after at most 3 strong Mediums, then stays at Medium+`, () => {
      const { newByTopic, qualitiesByTopic, problems } = run(120, set, () => 'strong');
      let sawMedium = 0;
      let sawHard = 0;
      for (const [topic, news] of newByTopic) {
        const history = qualitiesByTopic.get(topic) ?? [];
        const solved = (day: number, difficulty: string) => new Set(history.filter((h) => h.day < day && h.problem.difficulty === difficulty).map((h) => h.problem.id)).size;
        const mediumsLeft = (day: number) => problems.filter((p) => p.primaryTopic === topic && p.difficulty === 'medium' && !news.some((n) => n.problem.id === p.id && n.day < day)).length;
        for (const entry of news) {
          const easies = solved(entry.day, 'easy');
          const mediums = solved(entry.day, 'medium');
          if (entry.problem.difficulty === 'easy' && easies >= 2) expect(mediumsLeft(entry.day), `${topic}: Easy offered after ${easies} strong Easies`).toBe(0);
          if (entry.problem.difficulty === 'medium') sawMedium += 1;
          if (entry.problem.difficulty === 'hard') {
            sawHard += 1;
            // Either Medium was unlocked first, or nothing easier was left to offer.
            const easierLeft = problems.some((p) => p.primaryTopic === topic && p.difficulty !== 'hard' && !news.some((n) => n.problem.id === p.id && n.day < entry.day));
            if (mediums === 0) expect(easierLeft, `${topic}: Hard offered with easier problems left`).toBe(false);
          }
        }
        // Hard is offered only once Medium was unlocked, and not later than 3 strong Mediums after that.
        const firstHard = news.find((n) => n.problem.difficulty === 'hard');
        if (firstHard && problems.some((p) => p.primaryTopic === topic && p.difficulty === 'medium')) expect(solved(firstHard.day, 'medium')).toBeLessThanOrEqual(3);
      }
      expect(sawMedium).toBeGreaterThan(0);
      expect(sawHard).toBeGreaterThan(0);
    });
  }

  it('offers a first Medium after exactly two strong Easy solves in a topic with many Easies', () => {
    const { newByTopic } = run(60, 'nc250', () => 'strong');
    const trees = newByTopic.get('Arrays & Hashing') ?? [];
    const firstMedium = trees.findIndex((entry) => entry.problem.difficulty === 'medium');
    expect(firstMedium).toBeGreaterThan(-1);
    expect(firstMedium).toBeLessThanOrEqual(2);
  });

  it('a struggling learner is never pushed into a Hard while failing Mediums', () => {
    const { newByTopic } = run(80, 'nc250', (problem) => (problem.difficulty === 'easy' ? 'strong' : 'weak'));
    for (const news of newByTopic.values()) expect(news.some((entry) => entry.problem.difficulty === 'hard')).toBe(false);
  });

  it('walks the prerequisite graph in order: Two Pointers is not started before Arrays & Hashing has momentum', () => {
    const { newByTopic } = run(10, 'nc250', () => 'strong');
    const first = (topic: string) => newByTopic.get(topic)?.[0]?.day ?? Infinity;
    expect(first('Arrays & Hashing')).toBeLessThanOrEqual(first('Two Pointers'));
    expect(first('Arrays & Hashing')).toBeLessThanOrEqual(first('Sliding Window'));
  });
});

// ---- T4: cadence personas ---------------------------------------------------

// Deterministic "typical learner": mostly strong, some partial, some weak, and
// harder problems go worse.
function typicalQuality(problem: CatalogProblem, day: number): Quality {
  let hash = 7;
  for (const char of `${problem.id}|${day}`) hash = (hash * 31 + char.charCodeAt(0)) % 1009;
  const roll = hash % 10;
  const weakCutoff = problem.difficulty === 'hard' ? 3 : problem.difficulty === 'medium' ? 1 : 0;
  if (roll < weakCutoff) return 'weak';
  return roll < weakCutoff + 2 ? 'partial' : 'strong';
}

const CADENCES: Record<string, (day: number) => boolean> = {
  daily: () => true,
  fourDaysAWeek: (day) => [0, 1, 3, 4].includes(day % 7),
  // Two days a week, a different pair each week (irregular).
  twoDaysAWeek: (day) => { const week = Math.floor(day / 7); const first = (week * 3) % 7; return day % 7 === first || day % 7 === (first + 3) % 7; },
  // Three weeks daily, a 14-day gap, then daily again.
  gapThenResume: (day) => day < 21 || day >= 35
};

// `dueBefore` is what the plan owes (T22): due reviews that are not covered by a
// fresher solve of the same pattern and not parked above the learner's level.
// `rawDueBefore` is every due row, covered or not.
interface DayRecord { day: number; now: Date; plan: DailyPlanItem[]; dueBefore: number; rawDueBefore: number; unstartedBefore: number }

// Strong solves of an Easy feel easy; everything else feels manageable.
const perceivedFor = (problem: CatalogProblem, quality: Quality): PerceivedDifficulty => (quality === 'strong' && problem.difficulty === 'easy' ? 'easy' : 'manageable');

function runPersona(active: (day: number) => boolean, qualityOf: (problem: CatalogProblem, day: number) => Quality, days = 84, sessionMinutes: number | null = null, goal: { set?: ProblemList; skipEasies?: boolean; favourFoundations?: boolean } = {}) {
  const problems = problemsInSet(catalog, goal.set ?? 'nc250', goal.skipEasies ?? false);
  const progress = new Map<string, ProblemProgress>();
  const events: RecommendationEvent[] = [];
  const attempts: Attempt[] = [];
  const records: DayRecord[] = [];
  const backlog: number[] = [];
  const rawBacklog: number[] = [];
  for (let day = 0; day < days; day += 1) {
    const now = new Date(2026, 6, 1 + day, 12);
    backlog.push(planDueCount({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, skillProblems: catalog, now }));
    rawBacklog.push(dueReviewQueue(problems, [...progress.values()], now).length);
    if (!active(day)) continue;
    const plan = selectDailyPlan({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, skillProblems: catalog, sessionMinutes, favourFoundations: goal.favourFoundations, now });
    records.push({ day, now, plan, dueBefore: backlog[day], rawDueBefore: rawBacklog[day], unstartedBefore: problems.filter((problem) => !progress.has(problem.id)).length });
    for (const item of plan) {
      const quality = qualityOf(item.problem, day);
      events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
      attempts.push(attemptRow(item.problem, quality, now, day));
      const next = progressAfterAttempt(progress.get(item.problem.id), quality, localDate(0, now), now.toISOString(), false, now, perceivedFor(item.problem, quality));
      progress.set(item.problem.id, { ...next, problemId: item.problem.id });
    }
  }
  return { records, attempts, backlog, rawBacklog, progress, events, problems };
}

describe('T4 cadence personas (12 simulated weeks)', () => {
  for (const [cadenceName, active] of Object.entries(CADENCES)) {
    for (const [personaName, qualityOf] of [['fast', () => 'strong' as Quality], ['typical', typicalQuality]] as const) {
      it(`${personaName} / ${cadenceName}: a new problem on every active day unless the review hard brake is on, never more than four items`, () => {
        const { records, attempts } = runPersona(active, qualityOf);
        expect(records.length).toBeGreaterThan(0);
        for (const { day, now, plan, dueBefore } of records) {
          expect(plan.length, `day ${day}`).toBeLessThanOrEqual(4);
          expect(plan.length, `day ${day}`).toBeGreaterThanOrEqual(2);
          if (dueBefore < HARD_BRAKE_DUE) expect(plan.some((item) => item.kind === 'new'), `day ${day}`).toBe(true);
          else if (cadenceFor(attempts, localDate(0, now)).profile === 'returning') expect(plan.filter((item) => item.kind === 'new'), `day ${day} (returning)`).toHaveLength(1);
          else expect(plan.every((item) => item.kind === 'review'), `day ${day} (hard brake)`).toBe(true);
          // Past the overload line, the exploration floor: all reviews but exactly one new problem.
          if (dueBefore >= REVIEW_OVERLOAD_DUE && dueBefore < HARD_BRAKE_DUE && plan.some((item) => item.kind === 'new' && item.reason !== 'reinforce')) expect(plan.filter((item) => item.kind === 'new').length, `day ${day} (overloaded)`).toBeLessThanOrEqual(2);
        }
      });
    }
  }

  it('a returning user gets a review-heavy re-entry plan, with one new problem in a topic they know', () => {
    const { records, attempts } = runPersona(CADENCES.gapThenResume, () => 'strong');
    const comeback = records.find((record) => record.day === 35);
    expect(comeback).toBeDefined();
    const plan = comeback!.plan;
    expect(cadenceFor(attempts.filter((a) => a.attemptedOn < localDate(0, comeback!.now)), localDate(0, comeback!.now)).profile).toBe('returning');
    expect(comeback!.dueBefore).toBeGreaterThan(3);
    const reviews = plan.filter((item) => item.kind === 'review');
    const news = plan.filter((item) => item.kind === 'new');
    expect(news).toHaveLength(1);
    expect(reviews.length).toBe(3);
    expect(plan.length).toBeLessThanOrEqual(4);
    const knownTopics = new Set(attempts.map((attempt) => catalog.find((c) => c.id === attempt.problemId)?.primaryTopic));
    expect(knownTopics.has(news[0].problem.primaryTopic)).toBe(true);
    // The profile clears itself: the next active day is a normal plan — still review-heavy while the backlog is
    // overloaded (new problems pause), otherwise with a new problem.
    const next = records.find((record) => record.day === 36)!;
    if (next.dueBefore >= HARD_BRAKE_DUE) expect(next.plan.every((item) => item.kind === 'review')).toBe(true);
    else expect(next.plan.filter((item) => item.kind === 'new').length).toBeGreaterThanOrEqual(1);
  });

  it('an occasional user (two days a week) gets NeetCode 75 problems first, across topics', () => {
    const { records, attempts } = runPersona(CADENCES.twoDaysAWeek, () => 'strong');
    let checked = 0;
    for (const { now, plan } of records) {
      const today = localDate(0, now);
      if (cadenceFor(attempts, today).profile !== 'occasional') continue;
      for (const item of plan) if (item.kind === 'new') { checked += 1; expect(coreRank(item.problem), `${item.problem.id} on ${today}`).toBe(0); }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('a regular user (daily) is never put into the occasional or returning rules', () => {
    const { records, attempts } = runPersona(CADENCES.daily, () => 'strong', 40);
    const profiles = new Set(records.map(({ now }) => cadenceFor(attempts, localDate(0, now)).profile));
    expect(profiles.has('regular')).toBe(true);
    expect(profiles.has('occasional')).toBe(false);
    expect(profiles.has('returning')).toBe(false);
  });

  it('one more problem: a fresh new problem on another topic, kept by the same-day replay', () => {
    const { progress, events, attempts, problems } = runPersona(CADENCES.daily, () => 'strong', 20);
    const now = new Date(2026, 6, 21, 12);
    const input = { problems, progress: [...progress.values()], recommendationEvents: events, attempts, now };
    const plan = selectDailyPlan(input);
    const extra = selectExtraProblem(input, plan);
    expect(extra).toBeDefined();
    expect(plan.some((item) => item.problem.id === extra!.id)).toBe(false);
    expect(plan.some((item) => item.problem.primaryTopic === extra!.primaryTopic)).toBe(false);
    const stored = [...plan, { problem: extra!, kind: 'new' as const }].map((item) => ({ id: `s-${item.problem.id}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null }));
    const replay = selectDailyPlan({ ...input, recommendationEvents: [...events, ...stored] });
    expect(replay.map((item) => item.problem.id).sort()).toEqual([...plan.map((item) => item.problem.id), extra!.id].sort());
  });
});

// ---- T11: review load -------------------------------------------------------

// Persona qualities: `fast` is always strong, `typical` is the deterministic mixed learner.
const PERSONAS: [string, (problem: CatalogProblem, day: number) => Quality][] = [['fast', () => 'strong'], ['typical', typicalQuality]];

function meanAttemptsToMastery(attempts: Attempt[], progress: Map<string, ProblemProgress>): { mean: number; mastered: number } {
  const counts = [...progress.values()].filter((p) => p.reviewStage === 5).map((p) => attempts.filter((a) => a.problemId === p.problemId).length);
  return { mean: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0, mastered: counts.length };
}

describe('T11 review load (12 simulated weeks)', () => {
  it('a strong-every-time learner masters a problem in at most 5 attempts at every cadence', () => {
    for (const [name, active] of Object.entries(CADENCES)) {
      const { attempts, progress } = runPersona(active, () => 'strong');
      const perProblem = new Map<string, number>();
      for (const attempt of attempts) perProblem.set(attempt.problemId, (perProblem.get(attempt.problemId) ?? 0) + 1);
      for (const p of progress.values()) if (p.reviewStage === 5) expect(perProblem.get(p.problemId), `${name}: ${p.problemId}`).toBeLessThanOrEqual(5);
      expect(meanAttemptsToMastery(attempts, progress).mastered, name).toBeGreaterThan(0);
    }
  });

  it('being late on reviews but recalling strongly needs fewer attempts than on time, never more', () => {
    const daily = runPersona(CADENCES.daily, () => 'strong');
    const twice = runPersona(CADENCES.twoDaysAWeek, () => 'strong');
    expect(meanAttemptsToMastery(twice.attempts, twice.progress).mean).toBeLessThanOrEqual(meanAttemptsToMastery(daily.attempts, daily.progress).mean);
  });

  it('the same problem is not in the plan on two consecutive calendar days unless its last attempt was weak', () => {
    for (const [name, active] of Object.entries(CADENCES)) {
      for (const [personaName, qualityOf] of PERSONAS) {
        const { records } = runPersona(active, qualityOf);
        for (let i = 1; i < records.length; i += 1) {
          // Back-to-back days only: a 3-day review of a partial attempt may fall on the next active day of a 4-days-a-week user.
          if (records[i].day - records[i - 1].day !== 1) continue;
          const yesterday = new Map(records[i - 1].plan.map((item) => [item.problem.id, qualityOf(item.problem, records[i - 1].day)]));
          for (const item of records[i].plan) {
            const previous = yesterday.get(item.problem.id);
            if (previous !== undefined) expect(previous, `${personaName}/${name} day ${records[i].day}: ${item.problem.id}`).toBe('weak');
          }
        }
      }
    }
  });

  it('a weak problem returns at most 3 sessions in a row before backing off', () => {
    const struggling = (problem: CatalogProblem): Quality => (problem.primaryTopic === 'Two Pointers' ? 'weak' : 'strong');
    for (const active of [CADENCES.daily, CADENCES.fourDaysAWeek]) {
      const { records } = runPersona(active, struggling);
      const run = new Map<string, number>();
      let longest = 0;
      for (const { plan } of records) {
        const inPlan = new Set(plan.map((item) => item.problem.id));
        for (const id of [...run.keys()]) if (!inPlan.has(id)) run.delete(id);
        for (const id of inPlan) {
          if (catalog.find((c) => c.id === id)?.primaryTopic !== 'Two Pointers') continue;
          run.set(id, (run.get(id) ?? 0) + 1);
          longest = Math.max(longest, run.get(id)!);
        }
      }
      expect(longest).toBeLessThanOrEqual(3);
    }
  });

  it('reports attempts-to-mastery and the due-review backlog per cadence, and bounds the two-days-a-week backlog', () => {
    const rows: string[] = [];
    let twiceMax = 0;
    for (const [personaName, qualityOf] of PERSONAS) {
      for (const [name, active] of Object.entries(CADENCES)) {
        const { backlog, attempts, progress } = runPersona(active, qualityOf);
        const { mean, mastered } = meanAttemptsToMastery(attempts, progress);
        if (personaName === 'typical' && name === 'twoDaysAWeek') twiceMax = Math.max(...backlog);
        rows.push(`${personaName}/${name}: backlog max ${Math.max(...backlog)} end ${backlog[backlog.length - 1]}, attempts-to-mastery ${mean.toFixed(2)} (${mastered} mastered)`);
      }
    }
    console.log(`T11 REPORT\n${rows.join('\n')}`);
    expect(twiceMax).toBeLessThanOrEqual(BACKLOG_BOUND_TWO_DAYS);
  });
});
describe('review overload keeps the backlog bounded over a year (T4 follow-up to T11)', () => {
  it('typical learner: the due backlog stays at or under 30 at every cadence, 52 weeks', { timeout: 60000 }, () => {
    // Without the overload rule the same runs reach 163 (daily), 133 (4 days a week) and 56 (2 days a week);
    // with it the measured max is 25, 21 and 18.
    for (const name of ['daily', 'fourDaysAWeek', 'twoDaysAWeek']) {
      const { backlog, records } = runPersona(CADENCES[name], typicalQuality, 364);
      expect(Math.max(...backlog), name).toBeLessThanOrEqual(30);
      expect(Math.max(...records.map((record) => record.plan.length)), name).toBeLessThanOrEqual(4);
    }
  });
});

// Measured max over 12 weeks (typical, two days a week) is 21; baseline before T11 was 20, with no problem reaching mastery.
const BACKLOG_BOUND_TWO_DAYS = 25;

describe('T5 reinforcement (warm-up for a repeatedly failed problem)', () => {
  // Real catalog, daily cadence. The learner has solved a few Easies in the
  // topic, then fails one Medium three times in a row, then finally solves it.
  const topic = 'Two Pointers';
  const topicProblems = catalog.filter((problem) => problem.primaryTopic === topic);
  const medium = topicProblems.find((problem) => problem.difficulty === 'medium') as CatalogProblem;
  const easies = topicProblems.filter((problem) => problem.difficulty === 'easy');

  it('serves a same-topic Easy warm-up after 3 failures, and stops once the Medium is no longer struggling', () => {
    const problems = catalog;
    const progress = new Map<string, ProblemProgress>();
    const events: RecommendationEvent[] = [];
    const attempts: Attempt[] = [];
    const log = (item: CatalogProblem, quality: Quality, day: number) => {
      const now = new Date(2026, 6, 1 + day, 12);
      attempts.push(attemptRow(item, quality, now, day));
      progress.set(item.id, { ...progressAfterAttempt(progress.get(item.id), quality, localDate(0, now), now.toISOString(), false, now), problemId: item.id });
    };
    easies.slice(0, 2).forEach((easy, index) => log(easy, 'strong', index));
    for (let day = 3; day <= 5; day += 1) log(medium, 'weak', day);
    expect(progress.get(medium.id)?.struggling).toBe(true);

    const warmUpsFor = (day: number) => {
      const now = new Date(2026, 6, 1 + day, 12);
      return selectDailyPlan({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, now }).filter((item) => item.reason === 'reinforce');
    };
    // Day 12: both Easies have rested for days. Exactly one warm-up, an Easy in the same topic.
    const [warmUp, ...rest] = warmUpsFor(12);
    expect(rest).toHaveLength(0);
    expect(warmUp.problem.primaryTopic).toBe(topic);
    expect(warmUp.problem.difficulty).toBe('easy');
    expect(warmUp.reinforces?.id).toBe(medium.id);

    // The learner solves the Medium strongly: it stops struggling, the warm-up stops.
    log(medium, 'strong', 12);
    expect(progress.get(medium.id)?.struggling).toBe(false);
    expect(warmUpsFor(13)).toHaveLength(0);
  });
});

describe('time budget keeps the backlog bounded over a year', () => {
  // Measured (default minutes, no logged durations): backlog max 20 / 15 / 16 at 30 min
  // and 19 / 22 / 15 at 45 min (daily / 4 days / 2 days a week); 75 / 50 / 34 and
  // 84 / 51 / 39 problems solved in the year.
  it('typical learner on a 30 or 45 minute budget: plans fit the budget, keep a new problem, and the due backlog stays at or under 30', { timeout: 120000 }, () => {
    const rows: string[] = [];
    const minutes = minutesEstimator([], catalog, '2026-01-01');
    for (const budget of [30, 45]) {
      for (const name of ['daily', 'fourDaysAWeek', 'twoDaysAWeek']) {
        const { backlog, records, progress } = runPersona(CADENCES[name], typicalQuality, 364, budget);
        for (const { day, plan, dueBefore, unstartedBefore } of records) {
          if (plan.length > 1) expect(planMinutes(plan, minutes), `${budget}/${name} day ${day}`).toBeLessThanOrEqual(budget);
          expect(plan.length, `${budget}/${name} day ${day}`).toBeLessThanOrEqual(4);
          // A new problem every day below the overload line until the set has nothing left to
          // start (T22's pattern reviews free enough time that a 30-minute user can start all 250
          // within the year). Past the line a one-item budget consolidates first (T23).
          if (dueBefore < REVIEW_OVERLOAD_DUE && unstartedBefore > 0) expect(plan.some((item) => item.kind === 'new'), `${budget}/${name} day ${day}`).toBe(true);
        }
        // No crash either way: never a week of active days without new material while some is left.
        let since = 0;
        for (const { day, plan, unstartedBefore } of records) {
          since = plan.some((item) => item.kind === 'new') || unstartedBefore === 0 ? 0 : since + 1;
          expect(since, `${budget}/${name} day ${day}: active days without a new problem`).toBeLessThan(7);
        }
        const solved = [...progress.values()].filter((row) => row.status === 'solved' || row.status === 'mastered').length;
        rows.push(`${budget} min / ${name}: backlog max ${Math.max(...backlog)}, ${solved} solved in a year`);
        expect(Math.max(...backlog), `${budget}/${name}`).toBeLessThanOrEqual(30);
      }
    }
    console.log(`BUDGET REPORT\n${rows.join('\n')}`);
  });
});

describe('T13 light review gate (recall-decay model, 52 weeks)', () => {
  // The chance the learner recalls the approach of a due review, by the stage it
  // sits at. Each roll is a fixed function of (problem, attempt number), so the
  // two runs below face the same forgetting; only the review format differs.
  const RECALL_PERCENT = [55, 65, 75, 82, 88];
  const rollFor = (problemId: string, attemptNumber: number) => {
    let hash = 11;
    for (const char of `${problemId}|${attemptNumber}`) hash = (hash * 37 + char.charCodeAt(0)) % 10007;
    return hash % 100;
  };
  const LIGHT_MINUTES = 5;

  function runRecallModel(light: boolean, active: (day: number) => boolean, days = 364) {
    const problems = problemsInSet(catalog, 'nc250');
    const progress = new Map<string, ProblemProgress>();
    const events: RecommendationEvent[] = [];
    const attempts: Attempt[] = [];
    const counts = new Map<string, number>();
    const full = minutesEstimator([], catalog, '2026-01-01');
    const backlog: number[] = [];
    let minutes = 0;
    let lightCount = 0;
    for (let day = 0; day < days; day += 1) {
      const now = new Date(2026, 6, 1 + day, 12);
      backlog.push(dueReviewQueue(problems, [...progress.values()], now).length);
      if (!active(day)) continue;
      const plan = selectDailyPlan({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, now });
      for (const item of plan) {
        const id = item.problem.id;
        const existing = progress.get(id);
        const attemptNumber = counts.get(id) ?? 0;
        counts.set(id, attemptNumber + 1);
        let quality: Quality;
        if (item.kind === 'new') quality = typicalQuality(item.problem, day);
        else quality = rollFor(id, attemptNumber) < RECALL_PERCENT[existing?.reviewStage ?? 0] ? 'strong' : 'weak';
        const useLight = light && item.kind === 'review' && quality === 'strong' && lightReviewEligible(existing, localDate(0, now));
        minutes += useLight ? LIGHT_MINUTES : full(item.kind, item.problem.difficulty);
        if (useLight) lightCount += 1;
        events.push({ id: `${id}-${day}`, problemId: id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
        attempts.push({ ...attemptRow(item.problem, quality, now, day), ...(useLight ? { lightReview: true } : {}) });
        const next = progressAfterAttempt(existing, quality, localDate(0, now), now.toISOString(), false, now, perceivedFor(item.problem, quality));
        progress.set(id, { ...next, problemId: id });
      }
    }
    const rows = [...progress.values()];
    return {
      backlogMax: Math.max(...backlog),
      mastered: rows.filter((row) => row.status === 'mastered').length,
      solved: rows.filter((row) => row.status === 'solved' || row.status === 'mastered').length,
      attemptsPerMastered: attempts.length / Math.max(1, rows.filter((row) => row.status === 'mastered').length),
      minutes, lightCount
    };
  }

  it('light reviews at stage 3 do not worsen mastery or the due backlog, and they save minutes', { timeout: 120000 }, () => {
    const report: string[] = [];
    for (const name of ['daily', 'fourDaysAWeek', 'twoDaysAWeek']) {
      const baseline = runRecallModel(false, CADENCES[name]);
      const withLight = runRecallModel(true, CADENCES[name]);
      report.push(`${name}: baseline ${JSON.stringify(baseline)}\n${' '.repeat(name.length)}  light    ${JSON.stringify(withLight)}`);
      expect(withLight.backlogMax, name).toBeLessThanOrEqual(baseline.backlogMax);
      expect(withLight.mastered, name).toBeGreaterThanOrEqual(baseline.mastered);
      expect(withLight.attemptsPerMastered, name).toBeLessThanOrEqual(baseline.attemptsPerMastered);
      expect(withLight.lightCount, name).toBeGreaterThan(0);
      expect(withLight.minutes, name).toBeLessThan(baseline.minutes);
    }
    console.log(`LIGHT REVIEW REPORT\n${report.join('\n')}`);
  });
});

describe('T16 goal plans: interview deadline and skip Easies', () => {
  const tierOf = (item: DailyPlanItem) => TOPIC_TIERS[item.problem.primaryTopic];
  const newItems = (records: DayRecord[]) => records.flatMap((record) => record.plan).filter((item) => item.kind === 'new');

  it('an interview deadline favours tier-1 topics: tier 2 opens later and tier 1 keeps at least its share, same plan shape', () => {
    // Fast learner (always strong), daily, NeetCode 250. Since T22 this learner starts all
    // 250 problems within 150 days, so shares over that window converge for both runs;
    // what the weighting changes is how long the foundations hold the plan alone.
    const plain = runPersona(CADENCES.daily, () => 'strong', 60, null, { set: 'nc250' });
    const deadline = runPersona(CADENCES.daily, () => 'strong', 60, null, { set: 'nc250', favourFoundations: true });
    const firstDay = (records: DayRecord[], tier: number) => records.find((record) => record.plan.some((item) => item.kind === 'new' && tierOf(item) === tier))?.day ?? Infinity;
    const share = (records: DayRecord[], tier: number, days: number) => {
      const items = newItems(records.filter((record) => record.day < days));
      return items.filter((item) => tierOf(item) === tier).length / items.length;
    };
    console.log(`T16 DEADLINE REPORT (daily, fast): first tier-2 day ${firstDay(plain.records, 2)} -> ${firstDay(deadline.records, 2)}, tier-1 share over 30 days ${share(plain.records, 1, 30).toFixed(2)} -> ${share(deadline.records, 1, 30).toFixed(2)}`);
    expect(firstDay(deadline.records, 2)).toBeGreaterThan(firstDay(plain.records, 2));
    expect(share(deadline.records, 1, 30)).toBeGreaterThanOrEqual(share(plain.records, 1, 30));
    expect(firstDay(deadline.records, 3)).toBeGreaterThanOrEqual(firstDay(plain.records, 3));
    for (const { day, plan, dueBefore } of deadline.records) {
      expect(plan.length, `day ${day}`).toBeLessThanOrEqual(4);
      expect(plan.length, `day ${day}`).toBeGreaterThanOrEqual(2);
      if (dueBefore < HARD_BRAKE_DUE) expect(plan.some((item) => item.kind === 'new'), `day ${day}`).toBe(true);
    }
  });

  it('with no deadline the plan is exactly what it was (the flag is off by default)', () => {
    const left = runPersona(CADENCES.daily, typicalQuality, 40);
    const right = runPersona(CADENCES.daily, typicalQuality, 40, null, { favourFoundations: false });
    expect(right.records.map((record) => record.plan.map((item) => item.problem.id))).toEqual(left.records.map((record) => record.plan.map((item) => item.problem.id)));
  });

  it('a deadline keeps the due backlog at or under 30 over a year at every cadence', { timeout: 120000 }, () => {
    const rows: string[] = [];
    for (const name of ['daily', 'fourDaysAWeek', 'twoDaysAWeek']) {
      const { backlog, records } = runPersona(CADENCES[name], typicalQuality, 364, null, { set: 'nc150', favourFoundations: true });
      rows.push(`${name}: backlog max ${Math.max(...backlog)}`);
      expect(Math.max(...backlog), name).toBeLessThanOrEqual(30);
      expect(Math.max(...records.map((record) => record.plan.length)), name).toBeLessThanOrEqual(4);
    }
    console.log(`T16 DEADLINE BACKLOG (nc150, 52 weeks, typical)\n${rows.join('\n')}`);
  });

  it('skip Easies: no Easy is ever a new problem, a topic opens at Medium, and the backlog stays bounded', { timeout: 120000 }, () => {
    const rows: string[] = [];
    for (const name of ['daily', 'fourDaysAWeek', 'twoDaysAWeek']) {
      const { backlog, records, progress } = runPersona(CADENCES[name], typicalQuality, 364, null, { set: 'nc150', skipEasies: true });
      expect(newItems(records).some((item) => item.problem.difficulty === 'easy'), name).toBe(false);
      for (const { day, plan, dueBefore, unstartedBefore } of records) {
        expect(plan.length, `${name} day ${day}`).toBeLessThanOrEqual(4);
        // A new problem every day, until the (smaller) set has nothing left to offer.
        if (dueBefore < HARD_BRAKE_DUE && unstartedBefore > 0) expect(plan.some((item) => item.kind === 'new'), `${name} day ${day}`).toBe(true);
      }
      expect([...progress.keys()].every((id) => catalog.find((problem) => problem.id === id)?.difficulty !== 'easy'), name).toBe(true);
      rows.push(`${name}: backlog max ${Math.max(...backlog)}, ${progress.size} problems started`);
      expect(Math.max(...backlog), name).toBeLessThanOrEqual(30);
    }
    console.log(`T16 SKIP EASIES (nc150, 52 weeks, typical)\n${rows.join('\n')}`);
  });

  it('skip Easies: the first new problem in a fresh topic is a Medium, so there is no Easy ramp', () => {
    const { records } = runPersona(CADENCES.daily, () => 'strong', 3, null, { set: 'nc150', skipEasies: true });
    const firstDay = records[0].plan.filter((item) => item.kind === 'new');
    expect(firstDay.length).toBeGreaterThan(0);
    expect(firstDay.every((item) => item.problem.difficulty === 'medium')).toBe(true);
  });

  it('skip Easies leaves history alone: an Easy already reviewed stays in the unfiltered review queue', () => {
    const easy = catalog.find((problem) => problem.difficulty === 'easy' && problem.lists.includes('nc150'))!;
    const due: ProblemProgress = { problemId: easy.id, status: 'solved', reviewStage: 2, nextReviewDate: '2026-07-10', lastAttemptDate: '2026-07-03', lastQuality: 'strong', strongAttemptCount: 2, consecutiveWeak: 0, struggling: false, updatedAt: '' };
    const now = new Date(2026, 6, 19, 12);
    expect(dueReviewQueue(catalog, [due], now).map((entry) => entry.problem.id)).toEqual([easy.id]);
    const view = problemsInSet(catalog, 'nc150', true);
    expect(view.some((problem) => problem.id === easy.id)).toBe(false);
    expect(selectDailyPlan({ problems: view, progress: [due], recommendationEvents: [], now }).some((item) => item.problem.id === easy.id)).toBe(false);
  });
});
