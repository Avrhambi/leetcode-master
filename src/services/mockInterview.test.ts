import { describe, expect, it } from 'vitest';
import {
  checkTests, clockText, daysSinceLastMock, effectiveOutcome, mockAttemptFields, mockClock, mockDifficulty, mockDue, mockHistory,
  mockMinutes, mockQuality, mockSessionLine, outcomeFromTests, parseActiveMock, selectMockProblems, type MockProblemReport
} from './mockInterview';
import { topicSkills } from './skill';
import { catalog } from '../data/catalog';
import { problemsInSet } from './problemSet';
import type { Attempt, ProblemProgress } from '../types/models';

const today = '2026-07-19';
const problems = problemsInSet(catalog, 'nc150');
const row = (problemId: string): ProblemProgress => ({ problemId, status: 'solved', reviewStage: 2, nextReviewDate: '2026-07-25', lastAttemptDate: '2026-07-10', lastQuality: 'strong', strongAttemptCount: 1, consecutiveWeak: 0, struggling: false, updatedAt: '' });
let counter = 0;
const attempt = (problemId: string, attemptedOn: string, changes: Partial<Attempt> = {}): Attempt => {
  counter += 1;
  return { id: `a${counter}`, problemId, attemptedOn, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: '', quality: 'strong', createdAt: `${attemptedOn}T12:00:${String(counter % 60).padStart(2, '0')}.000Z`, ...changes };
};

describe('selectMockProblems', () => {
  // Three solved problems in each of four topics, so every started topic still has unseen ones.
  const solved = ['Arrays & Hashing', 'Two Pointers', 'Stack', 'Binary Search'].flatMap((topic) => problems.filter((problem) => problem.primaryTopic === topic).slice(0, 3));
  const attempts = solved.map((problem) => attempt(problem.id, '2026-07-01'));
  const progress = solved.map((problem) => row(problem.id));
  const skills = topicSkills(attempts, catalog);
  const pick = (count: number, seed = 0) => selectMockProblems({ problems, progress, attempts, skills, count, today, seed });

  it('picks the asked number of unseen problems from distinct topics', () => {
    for (const count of [1, 2, 3]) {
      const chosen = pick(count);
      expect(chosen).toHaveLength(count);
      expect(new Set(chosen.map((problem) => problem.primaryTopic)).size).toBe(count);
      expect(chosen.every((problem) => !solved.some((seen) => seen.id === problem.id))).toBe(true);
    }
  });

  it('is deterministic for a day and changes with the seed', () => {
    expect(pick(3).map((problem) => problem.id)).toEqual(pick(3).map((problem) => problem.id));
    const seeds = new Set([0, 1, 2, 3, 4, 5].map((seed) => pick(2, seed).map((problem) => problem.id).join()));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('prefers started topics, at the topic\'s interview level, easiest first', () => {
    const chosen = pick(2);
    const started = new Set(solved.map((problem) => problem.primaryTopic));
    expect(chosen.every((problem) => started.has(problem.primaryTopic))).toBe(true);
    // At the topic's interview level, or the nearest level that still has an unseen problem.
    const order = ['easy', 'medium', 'hard'];
    for (const problem of chosen) {
      const target = order.indexOf(mockDifficulty(skills.get(problem.primaryTopic) ?? 0));
      const unseenLevels = problems.filter((item) => item.primaryTopic === problem.primaryTopic && !solved.some((seen) => seen.id === item.id)).map((item) => Math.abs(order.indexOf(item.difficulty) - target));
      expect(Math.abs(order.indexOf(problem.difficulty) - target)).toBe(Math.min(...unseenLevels));
    }
    expect(order.indexOf(chosen[0].difficulty)).toBeLessThanOrEqual(order.indexOf(chosen[1].difficulty));
  });

  it('never reuses a problem attempted in the last 14 days, and falls back to older solved ones when nothing is unseen', () => {
    const topic = problems.filter((problem) => problem.primaryTopic === 'Bit Manipulation');
    const old = topic.map((problem) => attempt(problem.id, '2026-06-01'));
    const fresh = [attempt(topic[0].id, '2026-07-15')];
    const chosen = selectMockProblems({ problems: topic, progress: topic.map((problem) => row(problem.id)), attempts: [...old, ...fresh], skills: new Map(), count: 1, today });
    expect(chosen).toHaveLength(1);
    expect(chosen[0].id).not.toBe(topic[0].id);
  });

  it('asks Easy below the Medium threshold, Medium in between, Hard past the Hard threshold', () => {
    expect(mockDifficulty(0)).toBe('easy');
    expect(mockDifficulty(0.3)).toBe('medium');
    expect(mockDifficulty(0.7)).toBe('hard');
  });

  it('times one problem at 30 min, two Easies at 60 and any other pair at 90', () => {
    const [easy, medium, hard] = ['easy', 'medium', 'hard'].map((difficulty) => problems.find((problem) => problem.difficulty === difficulty)!);
    const otherEasy = problems.find((problem) => problem.difficulty === 'easy' && problem.id !== easy.id)!;
    expect(mockMinutes([easy])).toBe(30);
    expect(mockMinutes([hard])).toBe(30);
    expect(mockMinutes([easy, otherEasy])).toBe(60);
    expect(mockMinutes([easy, medium])).toBe(90);
    expect(mockMinutes([medium, hard])).toBe(90);
  });
});

describe('the running mock', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');
  const stored = (changes: Record<string, unknown> = {}) => JSON.stringify({ id: 'm1', startedAt: '2026-07-19T11:30:00.000Z', minutes: 50, problemIds: ['two-sum', 'valid-anagram'], ...changes });

  it('reads a well-formed running mock and refuses anything else', () => {
    expect(parseActiveMock(stored(), now)?.problemIds).toEqual(['two-sum', 'valid-anagram']);
    expect(parseActiveMock(undefined, now)).toBeNull();
    expect(parseActiveMock('not json', now)).toBeNull();
    expect(parseActiveMock(stored({ minutes: 0 }), now)).toBeNull();
    expect(parseActiveMock(stored({ problemIds: [] }), now)).toBeNull();
    expect(parseActiveMock(stored({ startedAt: '2026-07-19T13:00:00.000Z' }), now)).toBeNull();
    // Forgotten: more than 12 hours past its time limit.
    expect(parseActiveMock(stored({ startedAt: '2026-07-18T22:00:00.000Z' }), now)).toBeNull();
  });

  it('counts down and then counts over time', () => {
    const mock = parseActiveMock(stored(), now)!;
    expect(mockClock(mock, now)).toEqual({ elapsedSeconds: 1800, remainingSeconds: 1200, overTime: false });
    expect(mockClock(mock, new Date('2026-07-19T12:25:00.000Z'))).toEqual({ elapsedSeconds: 3300, remainingSeconds: 0, overTime: true });
    expect(clockText(1200)).toBe('20:00');
    expect(clockText(65)).toBe('01:05');
  });
});

describe('the report', () => {
  const report = (changes: Partial<MockProblemReport>): MockProblemReport => ({ problemId: 'two-sum', outcome: 'solved', testsPassed: null, testsTotal: null, usedHint: false, ...changes });

  it('validates test counts', () => {
    expect(checkTests(null, null)).toBeNull();
    expect(checkTests(3, 5)).toBeNull();
    expect(checkTests(5, 5)).toBeNull();
    expect(checkTests(6, 5)).toBe('tests-invalid');
    expect(checkTests(3, null)).toBe('tests-invalid');
    expect(checkTests(0, 0)).toBe('tests-invalid');
    expect(checkTests(1.5, 3)).toBe('tests-invalid');
  });

  it('lets the test counts decide the outcome: all solved, at least half partial, else unsolved', () => {
    expect(outcomeFromTests(10, 10)).toBe('solved');
    expect(outcomeFromTests(5, 10)).toBe('partial');
    expect(outcomeFromTests(4, 10)).toBe('unsolved');
    expect(effectiveOutcome(report({ outcome: 'solved', testsPassed: 2, testsTotal: 10 }))).toBe('unsolved');
    expect(effectiveOutcome(report({ outcome: 'unsolved' }))).toBe('unsolved');
  });

  it('maps each result to the same quality rules as every attempt', () => {
    const quality = (changes: Partial<MockProblemReport>, overTime = false) => mockQuality(mockAttemptFields(report(changes), 'm1', 50, overTime));
    expect(quality({})).toBe('strong');
    expect(quality({ testsPassed: 12, testsTotal: 12 })).toBe('strong');
    expect(quality({}, true)).toBe('partial');
    expect(quality({ usedHint: true })).toBe('partial');
    expect(quality({ outcome: 'partial' })).toBe('partial');
    expect(quality({ testsPassed: 7, testsTotal: 10 })).toBe('partial');
    expect(quality({ outcome: 'unsolved' })).toBe('weak');
    expect(quality({ testsPassed: 1, testsTotal: 10, usedHint: true })).toBe('weak');
  });

  it('records the mock on the attempt', () => {
    const fields = mockAttemptFields(report({ testsPassed: 7, testsTotal: 10 }), 'm1', 50, true);
    expect(fields.mock).toEqual({ sessionId: 'm1', testsPassed: 7, testsTotal: 10, timeLimitMinutes: 50, overTime: true });
    expect(fields).toMatchObject({ outcome: 'solved_independently', perceivedDifficulty: 'hard', helpType: null });
    expect(mockAttemptFields(report({ outcome: 'unsolved' }), 'm1', 50, false)).toMatchObject({ outcome: 'could_not_solve', helpType: null });
  });
});

describe('history and nudges', () => {
  const mockRow = (sessionId: string, date: string, quality: Attempt['quality'], tests: [number, number] | null, overTime = false) => attempt(`p-${sessionId}-${quality}-${counter}`, date, { quality, mock: { sessionId, testsPassed: tests?.[0] ?? null, testsTotal: tests?.[1] ?? null, timeLimitMinutes: 50, overTime } });

  it('groups mock attempts into sessions, newest first', () => {
    const attempts = [mockRow('s1', '2026-07-10', 'strong', [10, 10]), mockRow('s1', '2026-07-10', 'weak', [2, 10]), mockRow('s2', '2026-07-15', 'partial', null, true), attempt('plain', '2026-07-16')];
    const history = mockHistory(attempts);
    expect(history.map((session) => session.sessionId)).toEqual(['s2', 's1']);
    expect(history[1]).toMatchObject({ solved: 1, testRatio: 0.6, overTime: false });
    expect(mockSessionLine(history[1])).toBe('2026-07-10: 1 of 2 solved · 60% of tests');
    expect(mockSessionLine(history[0])).toBe('2026-07-15: 0 of 1 solved · over time');
    expect(daysSinceLastMock(attempts, today)).toBe(4);
    expect(daysSinceLastMock([attempt('plain', '2026-07-16')], today)).toBeNull();
  });

  it('suggests a mock only after some practice in three topics, and again after the strategy\'s interval', () => {
    const inTopics = (topics: string[], date: string) => topics.map((topic) => attempt(problems.find((problem) => problem.primaryTopic === topic)!.id, date));
    expect(mockDue(inTopics(['Arrays & Hashing', 'Stack'], '2026-07-10'), problems, today, 7)).toBe(false);
    const practised = inTopics(['Arrays & Hashing', 'Stack', 'Two Pointers'], '2026-07-10');
    expect(mockDue(practised, problems, today, 7)).toBe(true);
    expect(mockDue([...practised, mockRow('s', '2026-07-15', 'strong', null)], problems, today, 7)).toBe(false);
    expect(mockDue([...practised, mockRow('s', '2026-07-12', 'strong', null)], problems, today, 7)).toBe(true);
  });
});

describe('mock results weigh more in topic skill', () => {
  it('moves skill further than the same practice result', () => {
    const problem = problems.find((item) => item.primaryTopic === 'Stack' && item.difficulty === 'medium')!;
    const practice = topicSkills([attempt(problem.id, today)], catalog).get('Stack')!;
    const mock = topicSkills([attempt(problem.id, today, { mock: { sessionId: 'm', testsPassed: null, testsTotal: null, timeLimitMinutes: 25, overTime: false } })], catalog).get('Stack')!;
    expect(mock).toBeGreaterThan(practice);
  });
});
