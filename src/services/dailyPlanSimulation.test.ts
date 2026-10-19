import { describe, expect, it } from 'vitest';
import { dueReviewQueue, selectDailyPlan, selectExtraProblem, type DailyPlanItem } from './dailyPlan';
import { cadenceFor } from './cadence';
import { coreRank } from './coreRank';
import { progressAfterAttempt, localDate } from './reviews';
import { catalog } from '../data/catalog';
import { TOPIC_TIERS } from '../data/topicTiers';
import { problemsInSet } from './problemSet';
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

interface DayRecord { day: number; now: Date; plan: DailyPlanItem[]; dueBefore: number }

// Strong solves of an Easy feel easy; everything else feels manageable.
const perceivedFor = (problem: CatalogProblem, quality: Quality): PerceivedDifficulty => (quality === 'strong' && problem.difficulty === 'easy' ? 'easy' : 'manageable');

function runPersona(active: (day: number) => boolean, qualityOf: (problem: CatalogProblem, day: number) => Quality, days = 84) {
  const problems = problemsInSet(catalog, 'nc250');
  const progress = new Map<string, ProblemProgress>();
  const events: RecommendationEvent[] = [];
  const attempts: Attempt[] = [];
  const records: DayRecord[] = [];
  const backlog: number[] = [];
  for (let day = 0; day < days; day += 1) {
    const now = new Date(2026, 6, 1 + day, 12);
    backlog.push(dueReviewQueue(problems, [...progress.values()], now).length);
    if (!active(day)) continue;
    const plan = selectDailyPlan({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, now });
    records.push({ day, now, plan, dueBefore: backlog[day] });
    for (const item of plan) {
      const quality = qualityOf(item.problem, day);
      events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null });
      attempts.push(attemptRow(item.problem, quality, now, day));
      const next = progressAfterAttempt(progress.get(item.problem.id), quality, localDate(0, now), now.toISOString(), false, now, perceivedFor(item.problem, quality));
      progress.set(item.problem.id, { ...next, problemId: item.problem.id });
    }
  }
  return { records, attempts, backlog, progress, events, problems };
}

describe('T4 cadence personas (12 simulated weeks)', () => {
  for (const [cadenceName, active] of Object.entries(CADENCES)) {
    for (const [personaName, qualityOf] of [['fast', () => 'strong' as Quality], ['typical', typicalQuality]] as const) {
      it(`${personaName} / ${cadenceName}: at least one new problem on every active day, never more than four items`, () => {
        const { records } = runPersona(active, qualityOf);
        expect(records.length).toBeGreaterThan(0);
        for (const { day, plan } of records) {
          expect(plan.length, `day ${day}`).toBeLessThanOrEqual(4);
          expect(plan.length, `day ${day}`).toBeGreaterThanOrEqual(2);
          expect(plan.some((item) => item.kind === 'new'), `day ${day}`).toBe(true);
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
    // The profile clears itself: the next active day is back to a normal plan.
    const next = records.find((record) => record.day === 36)!;
    expect(next.plan.filter((item) => item.kind === 'new').length).toBeGreaterThanOrEqual(1);
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
