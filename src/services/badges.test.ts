import { describe, expect, it } from 'vitest';
import { badgesEarned, mergeBadges } from './badges';
import type { Attempt, CatalogProblem, ProblemProgress } from '../types/models';

const problem = (id: string, primaryTopic: string): CatalogProblem => ({
  id, title: id, slug: id, leetcodeUrl: `https://leetcode.com/problems/${id}/`,
  difficulty: 'easy', topics: [primaryTopic], primaryTopic, neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 0
});

const prog = (problemId: string, status: ProblemProgress['status']): ProblemProgress => ({
  problemId, status, reviewStage: status === 'mastered' ? 5 : 1, nextReviewDate: null,
  lastAttemptDate: '2026-08-01', lastQuality: 'strong', strongAttemptCount: 1,
  consecutiveWeak: 0, struggling: false, updatedAt: '2026-08-01T00:00:00.000Z'
});

const attempt = (problemId: string): Attempt => ({
  id: crypto.randomUUID(), problemId, attemptedOn: '2026-08-01', outcome: 'solved_independently',
  perceivedDifficulty: 'easy', helpType: null, durationMinutes: null, notes: '',
  quality: 'strong', createdAt: '2026-08-01T10:00:00.000Z'
});

const twoTopics = [problem('a1', 'Arrays'), problem('a2', 'Arrays'), problem('t1', 'Trees')];
const base = { progress: [], attempts: [], problems: twoTopics, currentStreakDays: 0, level: 0 };

describe('badgesEarned', () => {
  it('grants nothing for an empty profile', () => {
    expect(badgesEarned(base)).toEqual([]);
  });

  it('does not grant all-mastered on an empty catalog (vacuous every)', () => {
    expect(badgesEarned({ ...base, problems: [] })).not.toContain('all-mastered');
  });

  it('grants first-solve on any solved problem', () => {
    const earned = badgesEarned({ ...base, progress: [prog('a1', 'solved')], attempts: [attempt('a1')], currentStreakDays: 1 });
    expect(earned).toContain('first-solve');
    expect(earned).not.toContain('first-mastered');
  });

  it('grants first-mastered and topic-cleared only when every problem in a topic is mastered', () => {
    const partial = badgesEarned({ ...base, progress: [prog('a1', 'mastered'), prog('a2', 'solved')] });
    expect(partial).toContain('first-mastered');
    expect(partial).not.toContain('topic-cleared');

    const full = badgesEarned({ ...base, progress: [prog('a1', 'mastered'), prog('a2', 'mastered')] });
    expect(full).toContain('topic-cleared');
  });

  it('grants all-mastered only when every catalog problem is mastered', () => {
    const notAll = badgesEarned({ ...base, progress: [prog('a1', 'mastered'), prog('a2', 'mastered')] });
    expect(notAll).not.toContain('all-mastered');
    const all = badgesEarned({ ...base, progress: [prog('a1', 'mastered'), prog('a2', 'mastered'), prog('t1', 'mastered')] });
    expect(all).toContain('all-mastered');
    expect(all).not.toContain('five-topics-cleared'); // only 2 topics in this catalog
  });

  it('grants five-topics-cleared at five fully-mastered topics', () => {
    const problems = Array.from({ length: 5 }, (_, i) => problem(`x${i}`, `T${i}`));
    const notYet = badgesEarned({ ...base, problems, progress: problems.slice(0, 4).map((p) => prog(p.id, 'mastered')) });
    expect(notYet).not.toContain('five-topics-cleared');
    const cleared = badgesEarned({ ...base, problems, progress: problems.map((p) => prog(p.id, 'mastered')) });
    expect(cleared).toContain('five-topics-cleared');
  });

  it('grants the streak tiers at their exact thresholds', () => {
    expect(badgesEarned({ ...base, currentStreakDays: 6 })).not.toContain('week-streak');
    expect(badgesEarned({ ...base, currentStreakDays: 7 })).toContain('week-streak');
    expect(badgesEarned({ ...base, currentStreakDays: 9 })).not.toContain('ten-day-streak');
    expect(badgesEarned({ ...base, currentStreakDays: 10 })).toContain('ten-day-streak');
    expect(badgesEarned({ ...base, currentStreakDays: 30 })).toContain('month-streak');
    expect(badgesEarned({ ...base, currentStreakDays: 100 })).toEqual(
      expect.arrayContaining(['week-streak', 'ten-day-streak', 'month-streak', 'century-streak'])
    );
  });

  it('grants the level badges at their exact thresholds', () => {
    expect(badgesEarned({ ...base, level: 4 })).not.toContain('level-5');
    expect(badgesEarned({ ...base, level: 5 })).toContain('level-5');
    expect(badgesEarned({ ...base, level: 10 })).toEqual(expect.arrayContaining(['level-5', 'level-10']));
  });

  it('grants half-catalog at 75 attempted problems and century at 100', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => attempt(`p${i}`));
    const at74 = badgesEarned({ ...base, attempts: mk(74) });
    expect(at74).not.toContain('half-catalog');
    const at75 = badgesEarned({ ...base, attempts: mk(75) });
    expect(at75).toContain('half-catalog');
    expect(at75).not.toContain('century');
    expect(badgesEarned({ ...base, attempts: mk(100) })).toContain('century');
  });

  it('counts distinct problems, not attempt rows, for the catalog milestones', () => {
    const manyAttemptsOneProblem = Array.from({ length: 80 }, () => attempt('a1'));
    expect(badgesEarned({ ...base, attempts: manyAttemptsOneProblem })).not.toContain('half-catalog');
  });
});

describe('mergeBadges', () => {
  it('unions without dropping a stored badge that is no longer earned', () => {
    expect(mergeBadges(['first-mastered'], ['first-solve'])).toEqual(['first-solve', 'first-mastered']);
  });

  it('is idempotent', () => {
    const once = mergeBadges([], ['first-solve', 'century']);
    expect(mergeBadges(once, ['first-solve', 'century'])).toEqual(once);
  });

  it('orders by the BADGES list, not insertion order', () => {
    expect(mergeBadges(['century'], ['first-solve'])).toEqual(['first-solve', 'century']);
  });

  it('drops an unknown stored id rather than surfacing it', () => {
    expect(mergeBadges(['retired-badge', 'first-solve'], [])).toEqual(['first-solve']);
  });
});
