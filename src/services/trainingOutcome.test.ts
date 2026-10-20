import { describe, expect, it } from 'vitest';
import { planDueCount, selectDailyPlan } from './dailyPlan';
import { localDate, progressAfterAttempt, qualityFor } from './reviews';
import { problemsInSet } from './problemSet';
import { minutesEstimator, planMinutes } from './sessionTime';
import { mockAttemptFields, mockMinutes, selectMockProblems } from './mockInterview';
import { topicSkills } from './skill';
import { catalog } from '../data/catalog';
import { Learner, LEARNERS, type LearnerProfile } from '../test/learnerModel';
import type { Attempt, CatalogProblem, ProblemList, ProblemProgress, Quality, RecommendationEvent } from '../types/models';

// Training outcomes (T22-T24) against the simulated learner in src/test/learnerModel.ts:
// ability that grows with practice (most from new variants of a pattern) and
// fades without it. Readiness = the learner's chance on an unseen Medium,
// tier-weighted. The model is an assumption, written out in that file; these
// tests pin the engine's guarantees (explore vs consolidate without a crash,
// retention, every kind of user) and print the measured numbers.
//
// Measured before T22 under the same model (typical learner, NeetCode 150, days to
// 60 / 70 / 80% readiness): daily no budget 81 / 102 / 163; daily 120 min 73 / 93 / 112;
// 4 days a week no budget 158 / 192 / 235; 2 days a week 120 min 353 / never / never.
// Reviews were 86-90% of all items.

const CADENCES: Record<string, (day: number) => boolean> = {
  daily: () => true,
  fourDaysAWeek: (day) => [0, 1, 3, 4].includes(day % 7),
  twoDaysAWeek: (day) => { const week = Math.floor(day / 7); const first = (week * 3) % 7; return day % 7 === first || day % 7 === (first + 3) % 7; }
};

interface Scenario { learner: LearnerProfile; set: ProblemList; cadence: string; budget: number | null; days: number; deadline?: number; mockEvery?: number }

interface Outcome {
  reached: Record<60 | 70 | 80, number | null>;
  readinessOn: (day: number) => number;
  reviewShare: number;
  longestStarve: number;
  overBudgetDays: number;
  mockMissesOwed: boolean;
  mocks: number;
}

function run({ learner: profile, set, cadence, budget, days, deadline, mockEvery }: Scenario): Outcome {
  const problems = problemsInSet(catalog, set);
  const topics = [...new Set(problems.map((problem) => problem.primaryTopic))];
  const learner = new Learner(profile);
  const progress = new Map<string, ProblemProgress>();
  const events: RecommendationEvent[] = [];
  const attempts: Attempt[] = [];
  const estimate = minutesEstimator([], catalog, '2026-01-01');
  const reached: Outcome['reached'] = { 60: null, 70: null, 80: null };
  const readiness: number[] = [];
  let items = 0;
  let reviews = 0;
  let starve = 0;
  let longestStarve = 0;
  let overBudgetDays = 0;
  let mocks = 0;
  let mockMissesOwed = true;
  let pendingMisses: string[] = [];
  let seq = 0;

  const log = (problem: CatalogProblem, quality: Quality, now: Date, day: number, extra: Partial<Attempt> = {}) => {
    seq += 1;
    const today = localDate(0, now);
    const already = attempts.some((attempt) => attempt.problemId === problem.id && attempt.attemptedOn === today);
    attempts.push({ id: `${problem.id}-${day}-${seq}`, problemId: problem.id, attemptedOn: today, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: '', quality, createdAt: new Date(now.getTime() + seq).toISOString(), ...extra });
    progress.set(problem.id, { ...progressAfterAttempt(progress.get(problem.id), quality, today, now.toISOString(), already, now, 'manageable'), problemId: problem.id });
  };

  for (let day = 0; day < days; day += 1) {
    const now = new Date(2026, 6, 1 + day, 12);
    const daysLeft = deadline !== undefined && day < deadline ? deadline - day : null;
    if (CADENCES[cadence](day)) {
      // A failed mock problem from the last mock must be among the owed reviews (or
      // parked above the level) by the next active day: mocks feed the plan.
      if (pendingMisses.length > 0) {
        const owedBefore = planDueCount({ problems, progress: [...progress.values()], recommendationEvents: events, attempts, skillProblems: catalog, now });
        if (owedBefore === 0) mockMissesOwed = false;
        pendingMisses = [];
      }
      const input = { problems, progress: [...progress.values()], recommendationEvents: events, attempts, skillProblems: catalog, sessionMinutes: budget, interviewDaysLeft: daysLeft, favourFoundations: daysLeft !== null, now };
      const unstarted = problems.some((problem) => !progress.has(problem.id));
      const plan = selectDailyPlan(input);
      if (budget !== null && plan.length > 1 && planMinutes(plan, estimate) > budget) overBudgetDays += 1;
      starve = plan.some((item) => item.kind === 'new') || !unstarted ? 0 : starve + 1;
      longestStarve = Math.max(longestStarve, starve);
      for (const item of plan) {
        const quality = learner.attempt(item.problem, day);
        items += 1;
        if (item.kind === 'review') reviews += 1;
        events.push({ id: `${item.problem.id}-${day}`, problemId: item.problem.id, kind: item.kind, recommendedAt: now.toISOString(), skippedUntil: null, completedAt: now.toISOString() });
        log(item.problem, quality, now, day);
      }
      if (mockEvery !== undefined && day > 0 && day % mockEvery === 0) {
        const skills = topicSkills(attempts, catalog);
        const chosen = selectMockProblems({ problems, progress: [...progress.values()], attempts, skills, count: 2, today: localDate(0, now), seed: day });
        mocks += 1;
        for (const problem of chosen) {
          const quality = learner.attempt(problem, day, 0.05);
          const outcome = quality === 'strong' ? 'solved' : quality === 'partial' ? 'partial' : 'unsolved';
          const fields = mockAttemptFields({ problemId: problem.id, outcome, testsPassed: null, testsTotal: null, usedHint: false }, `mock-${day}`, mockMinutes(chosen), false);
          expect(qualityFor(fields.outcome, fields.perceivedDifficulty)).toBe(quality);
          log(problem, quality, now, day, fields);
          if (quality === 'weak') pendingMisses.push(problem.id);
        }
      }
    }
    const value = learner.readiness(topics, day);
    readiness.push(value);
    for (const threshold of [60, 70, 80] as const) if (reached[threshold] === null && value >= threshold / 100) reached[threshold] = day + 1;
  }
  return { reached, readinessOn: (day) => readiness[day - 1], reviewShare: reviews / Math.max(1, items), longestStarve, overBudgetDays, mockMissesOwed, mocks };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const days = (value: number | null) => (value === null ? 'never' : String(value));
const line = (name: string, outcome: Outcome) => `${name}: 60/70/80% on day ${days(outcome.reached[60])}/${days(outcome.reached[70])}/${days(outcome.reached[80])}, day 90 ${pct(outcome.readinessOn(90))}, day 365 ${pct(outcome.readinessOn(365))}, reviews ${pct(outcome.reviewShare)} of items, longest stretch without new material ${outcome.longestStarve} active days`;

describe('training outcomes for every kind of user (learner model, NeetCode 150, one year)', () => {
  it('explores and consolidates without a crash: a new problem at least every week of active days, reviews never the whole plan, retention held', { timeout: 240000 }, () => {
    const rows: string[] = [];
    for (const learner of Object.values(LEARNERS)) {
      for (const cadence of Object.keys(CADENCES)) {
        for (const budget of [null, 60, 120]) {
          const outcome = run({ learner, set: 'nc150', cadence, budget, days: 365 });
          const name = `${learner.name} / ${cadence} / ${budget === null ? 'no budget' : `${budget} min`}`;
          rows.push(line(name, outcome));
          expect(outcome.longestStarve, name).toBeLessThan(7);
          expect(outcome.reviewShare, name).toBeLessThan(0.8);
          expect(outcome.overBudgetDays, name).toBe(0);
          // Retention: what was learned is still there at the end of the year.
          if (cadence !== 'twoDaysAWeek') expect(outcome.readinessOn(365), name).toBeGreaterThanOrEqual(outcome.readinessOn(180) - 0.2);
        }
      }
    }
    console.log(`TRAINING OUTCOMES\n${rows.join('\n')}`);
  });

  it('reaches interview readiness faster than the per-problem engine did, at the cadences a job seeker keeps', { timeout: 120000 }, () => {
    // Baselines measured before T22 under this model (see the header).
    const dailyLong = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'daily', budget: 120, days: 200 });
    expect(dailyLong.reached[60]).not.toBeNull();
    expect(dailyLong.reached[60]!).toBeLessThan(73);
    expect(dailyLong.reached[70]!).toBeLessThan(93);
    const dailyAny = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'daily', budget: null, days: 200 });
    expect(dailyAny.reached[60]!).toBeLessThan(81);
    const fourDays = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'fourDaysAWeek', budget: null, days: 250 });
    expect(fourDays.reached[60]!).toBeLessThan(158);
    expect(fourDays.reached[70]!).toBeLessThan(192);
    const twoDays = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'twoDaysAWeek', budget: 120, days: 365 });
    expect(twoDays.reached[60]!).toBeLessThan(353);
    // An experienced engineer brushing up gets there in about a month at an hour or two a day.
    const experienced = run({ learner: LEARNERS.experienced, set: 'nc150', cadence: 'daily', budget: 120, days: 120 });
    expect(experienced.reached[60]!).toBeLessThanOrEqual(35);
  });

  it('with an interview date, the plan stays at least as ready on the day as without one, and never crashes', { timeout: 120000 }, () => {
    const rows: string[] = [];
    for (const deadline of [14, 45, 90]) {
      const plain = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'daily', budget: 120, days: deadline });
      const dated = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'daily', budget: 120, days: deadline, deadline });
      rows.push(`interview in ${deadline} days: readiness on the day ${pct(plain.readinessOn(deadline))} without a date, ${pct(dated.readinessOn(deadline))} with it`);
      expect(dated.readinessOn(deadline), `${deadline} days`).toBeGreaterThanOrEqual(plain.readinessOn(deadline) - 0.05);
      expect(dated.longestStarve).toBeLessThan(7);
    }
    console.log(`DEADLINE OUTCOMES\n${rows.join('\n')}`);
  });

  it('weekly mock interviews feed the plan: missed mock problems come back as owed reviews, and readiness does not suffer', { timeout: 120000 }, () => {
    const plain = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'daily', budget: 90, days: 120 });
    const withMocks = run({ learner: LEARNERS.typical, set: 'nc150', cadence: 'daily', budget: 90, days: 120, mockEvery: 7 });
    console.log(`MOCK OUTCOMES: ${withMocks.mocks} mocks; day 60 readiness ${pct(plain.readinessOn(60))} -> ${pct(withMocks.readinessOn(60))}, day 120 ${pct(plain.readinessOn(120))} -> ${pct(withMocks.readinessOn(120))}`);
    expect(withMocks.mocks).toBeGreaterThan(10);
    expect(withMocks.mockMissesOwed).toBe(true);
    expect(withMocks.readinessOn(120)).toBeGreaterThanOrEqual(plain.readinessOn(120) - 0.02);
    expect(withMocks.longestStarve).toBeLessThan(7);
  });
});
