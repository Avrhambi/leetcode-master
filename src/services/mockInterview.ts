import type { Attempt, CatalogProblem, Difficulty, HelpType, MockResult, Outcome, PerceivedDifficulty, ProblemProgress } from '../types/models';
import { tierWeight } from '../data/topicTiers';
import { coreRank } from './coreRank';
import { daysBetween } from './cadence';
import { MOCK_MINUTES, MOCK_PARTIAL_PASS_RATIO, MOCK_PROBLEM_COUNTS, MOCK_RECENT_DAYS, SKILL_HARD_THRESHOLD, SKILL_MEDIUM_THRESHOLD } from './constants';
import { qualityFor } from './reviews';
import { topicReadiness } from './readiness';

// Mock interviews (T24, timing T25): one or two problems under one time limit, then an
// honest report per problem (solved / some tests / not solved, how many tests
// passed, any hint). Each problem is saved as an ordinary Attempt with a `mock`
// field, so the review rules, XP and badges replay from attempts exactly as
// before, and topic skill weighs it more (SKILL_MOCK_WEIGHT): it was timed,
// unseen and unaided. Everything here is pure; `today` / `now` are passed in.

export type MockProblemCount = (typeof MOCK_PROBLEM_COUNTS)[number];

// ---- picking the problems ---------------------------------------------------

export interface MockSelectionInput {
  // The active set (what the interview should draw from).
  problems: CatalogProblem[];
  progress: ProblemProgress[];
  attempts: Pick<Attempt, 'problemId' | 'attemptedOn'>[];
  skills: Map<string, number>;
  count: number;
  today: string;
  // Changes the pick when the user asks for different problems.
  seed?: number;
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

// Interview level for a topic: Medium is what most interviews ask; an Easy only
// while the topic is still below the Medium threshold, a Hard once it is past the
// Hard one.
export function mockDifficulty(skill: number): Difficulty {
  if (skill >= SKILL_HARD_THRESHOLD) return 'hard';
  return skill >= SKILL_MEDIUM_THRESHOLD ? 'medium' : 'easy';
}

function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 0xffffffff;
}

// The problems for a mock: distinct topics, unseen problems first (an interview
// never repeats one you know), at the topic's interview level. Topics are picked
// started ones first (a cold topic is mostly a guaranteed fail and tells you
// little), then by what the result would tell you: tier weight and how far the
// topic is from ready, with a seeded shuffle so mocks vary. A problem attempted in the last MOCK_RECENT_DAYS is
// never reused. Deterministic for the same day, inputs and seed.
export function selectMockProblems({ problems, progress, attempts, skills, count, today, seed = 0 }: MockSelectionInput): CatalogProblem[] {
  const progressIds = new Set(progress.map((row) => row.problemId));
  const lastAttempt = new Map<string, string>();
  for (const attempt of attempts) {
    const known = lastAttempt.get(attempt.problemId);
    if (known === undefined || attempt.attemptedOn > known) lastAttempt.set(attempt.problemId, attempt.attemptedOn);
  }
  const recent = (problem: CatalogProblem) => {
    const last = lastAttempt.get(problem.id);
    return last !== undefined && daysBetween(last, today) < MOCK_RECENT_DAYS;
  };
  const startedTopics = new Set(problems.filter((problem) => progressIds.has(problem.id) || lastAttempt.has(problem.id)).map((problem) => problem.primaryTopic));
  const topics = [...new Set(problems.map((problem) => problem.primaryTopic))]
    .map((topic) => {
      const readinessGap = 1 - topicReadiness(skills.get(topic) ?? 0);
      return { topic, started: startedTopics.has(topic), score: tierWeight(topic) * (0.25 + readinessGap) + 0.3 * hash(`${today}|${seed}|${topic}`) };
    })
    .sort((left, right) => Number(right.started) - Number(left.started) || right.score - left.score);

  // First pass: unseen problems only. Second pass, only if that left the mock
  // short: problems seen before (not in the last MOCK_RECENT_DAYS) in topics not yet used.
  const picked: CatalogProblem[] = [];
  for (const unseenOnly of [true, false]) {
    for (const { topic } of topics) {
      if (picked.length >= count) break;
      if (picked.some((problem) => problem.primaryTopic === topic)) continue;
      const target = DIFFICULTY_ORDER.indexOf(mockDifficulty(skills.get(topic) ?? 0));
      const distance = (problem: CatalogProblem) => Math.abs(DIFFICULTY_ORDER.indexOf(problem.difficulty) - target);
      const candidates = problems.filter((problem) => problem.primaryTopic === topic && !recent(problem)
        && (!unseenOnly || (!progressIds.has(problem.id) && !lastAttempt.has(problem.id))));
      const choice = [...candidates].sort((left, right) => distance(left) - distance(right) || coreRank(left) - coreRank(right) || hash(`${seed}|${left.id}`) - hash(`${seed}|${right.id}`))[0];
      if (choice) picked.push(choice);
    }
  }
  // Easiest first, as an interview usually warms up.
  return picked.sort((left, right) => DIFFICULTY_ORDER.indexOf(left.difficulty) - DIFFICULTY_ORDER.indexOf(right.difficulty) || left.neetcodeOrder - right.neetcodeOrder);
}

// The time limit (MOCK_MINUTES): 30 for one problem, 60 for two Easies, 90 for
// two with a Medium or Hard among them.
export function mockMinutes(problems: CatalogProblem[]): number {
  if (problems.length <= 1) return MOCK_MINUTES.single;
  return problems.every((problem) => problem.difficulty === 'easy') ? MOCK_MINUTES.pairEasy : MOCK_MINUTES.pair;
}

// ---- the running mock -------------------------------------------------------

// The `activeMock` setting: what is running, so a reload keeps the clock.
export interface ActiveMock { id: string; startedAt: string; minutes: number; problemIds: string[] }

// Hours after the time limit when a forgotten mock is dropped.
const ACTIVE_MOCK_STALE_HOURS = 12;

export function parseActiveMock(value: string | undefined, now: Date): ActiveMock | null {
  if (value === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { id, startedAt, minutes, problemIds } = parsed as Record<string, unknown>;
  if (typeof id !== 'string' || typeof startedAt !== 'string' || typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) return null;
  // Up to 3: a mock started before T25 dropped the 3-problem option still finishes.
  if (!Array.isArray(problemIds) || problemIds.length === 0 || problemIds.length > 3 || !problemIds.every((item) => typeof item === 'string')) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started) || started > now.getTime()) return null;
  if (now.getTime() - started > (minutes * 60 + ACTIVE_MOCK_STALE_HOURS * 3600) * 1000) return null;
  return { id, startedAt, minutes, problemIds: problemIds as string[] };
}

export interface MockClock { elapsedSeconds: number; remainingSeconds: number; overTime: boolean }

export function mockClock(mock: ActiveMock, now: Date): MockClock {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - Date.parse(mock.startedAt)) / 1000));
  const remainingSeconds = mock.minutes * 60 - elapsedSeconds;
  return { elapsedSeconds, remainingSeconds: Math.max(0, remainingSeconds), overTime: remainingSeconds < 0 };
}

// "12:05" for the countdown.
export function clockText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// ---- the report -------------------------------------------------------------

export type MockOutcome = 'solved' | 'partial' | 'unsolved';

export interface MockProblemReport {
  problemId: string;
  outcome: MockOutcome;
  // Optional test counts; when both are given they decide the outcome.
  testsPassed: number | null;
  testsTotal: number | null;
  usedHint: boolean;
}

export type MockReportError = 'tests-invalid';

// Checks the counts a user typed: whole numbers, at least one test, passed <= total.
export function checkTests(passed: number | null, total: number | null): MockReportError | null {
  if (passed === null && total === null) return null;
  if (passed === null || total === null) return 'tests-invalid';
  if (!Number.isInteger(passed) || !Number.isInteger(total) || total < 1 || total > 10000 || passed < 0 || passed > total) return 'tests-invalid';
  return null;
}

// What the test counts say: every test passing is a solve, at least
// MOCK_PARTIAL_PASS_RATIO is partial, less is not solved.
export function outcomeFromTests(passed: number, total: number): MockOutcome {
  if (passed >= total) return 'solved';
  return passed / total >= MOCK_PARTIAL_PASS_RATIO ? 'partial' : 'unsolved';
}

export function effectiveOutcome(report: MockProblemReport): MockOutcome {
  if (report.testsPassed !== null && report.testsTotal !== null && checkTests(report.testsPassed, report.testsTotal) === null) return outcomeFromTests(report.testsPassed, report.testsTotal);
  return report.outcome;
}

export interface MockAttemptFields { outcome: Outcome; perceivedDifficulty: PerceivedDifficulty; helpType: HelpType | null; mock: MockResult }

// A mock report as the attempt fields `saveAttempt` stores. The quality comes out
// of the same `qualityFor` as every other attempt:
//   every test, no hint, in time  -> solved without help, manageable  (strong)
//   every test, but over time     -> solved without help, felt hard   (partial)
//   every test, with a hint       -> solved with a small hint          (partial)
//   some tests (>= half)          -> solved without help, felt hard    (partial)
//   fewer than half / not solved  -> did not solve                     (weak)
export function mockAttemptFields(report: MockProblemReport, sessionId: string, timeLimitMinutes: number, overTime: boolean): MockAttemptFields {
  const outcome = effectiveOutcome(report);
  const mock: MockResult = { sessionId, testsPassed: report.testsPassed, testsTotal: report.testsTotal, timeLimitMinutes, overTime };
  if (outcome === 'unsolved') return { outcome: 'could_not_solve', perceivedDifficulty: 'hard', helpType: null, mock };
  if (report.usedHint) return { outcome: 'solved_with_hint', perceivedDifficulty: outcome === 'solved' ? 'manageable' : 'hard', helpType: 'small_hint', mock };
  if (outcome === 'partial' || overTime) return { outcome: 'solved_independently', perceivedDifficulty: 'hard', helpType: null, mock };
  return { outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, mock };
}

export function mockQuality(fields: MockAttemptFields) {
  return qualityFor(fields.outcome, fields.perceivedDifficulty);
}

// ---- history and nudges -----------------------------------------------------

export interface MockSession {
  sessionId: string;
  date: string;
  problemIds: string[];
  solved: number;
  // Tests passed / total over the problems that reported counts, or null.
  testRatio: number | null;
  overTime: boolean;
}

// Past mocks, newest first, grouped from the attempt rows.
export function mockHistory(attempts: Attempt[]): MockSession[] {
  const sessions = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    if (!attempt.mock) continue;
    sessions.set(attempt.mock.sessionId, [...(sessions.get(attempt.mock.sessionId) ?? []), attempt]);
  }
  return [...sessions.entries()]
    .map(([sessionId, rows]) => {
      const counted = rows.filter((row) => row.mock?.testsPassed !== null && row.mock?.testsTotal !== null);
      const passed = counted.reduce((sum, row) => sum + (row.mock?.testsPassed ?? 0), 0);
      const total = counted.reduce((sum, row) => sum + (row.mock?.testsTotal ?? 0), 0);
      return {
        sessionId,
        date: rows.map((row) => row.attemptedOn).sort()[0],
        problemIds: rows.map((row) => row.problemId),
        solved: rows.filter((row) => row.quality === 'strong').length,
        testRatio: total > 0 ? passed / total : null,
        overTime: rows.some((row) => row.mock?.overTime)
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date) || right.sessionId.localeCompare(left.sessionId));
}

// Days since the last mock, or null with none.
export function daysSinceLastMock(attempts: Attempt[], today: string): number | null {
  const dates = attempts.filter((attempt) => attempt.mock && attempt.attemptedOn <= today).map((attempt) => attempt.attemptedOn).sort();
  return dates.length === 0 ? null : daysBetween(dates[dates.length - 1], today);
}

// A mock is suggested once the user has some practice behind them (at least
// three started topics, so it is not a cold exam) and the last mock is at least
// `everyDays` ago.
export function mockDue(attempts: Attempt[], problems: CatalogProblem[], today: string, everyDays: number): boolean {
  const topicOf = new Map(problems.map((problem) => [problem.id, problem.primaryTopic]));
  const topics = new Set(attempts.map((attempt) => topicOf.get(attempt.problemId)).filter((topic) => topic !== undefined));
  if (topics.size < 3) return false;
  const since = daysSinceLastMock(attempts, today);
  return since === null || since >= everyDays;
}

export function mockSessionLine(session: MockSession): string {
  const tests = session.testRatio === null ? '' : ` · ${Math.round(session.testRatio * 100)}% of tests`;
  return `${session.date}: ${session.solved} of ${session.problemIds.length} solved${tests}${session.overTime ? ' · over time' : ''}`;
}
