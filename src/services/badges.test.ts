import { describe, expect, it } from 'vitest';
import { badgeHint, badgesEarned, mergeBadges, volumeTargets } from './badges';
import { BADGES } from './constants';
import { proficientTopics } from './mastery';
import type { Attempt, CatalogProblem, ProblemList, ProblemProgress } from '../types/models';

const problem = (id: string, primaryTopic: string, lists: ProblemList[] = ['nc150', 'nc250'], difficulty: CatalogProblem['difficulty'] = 'easy'): CatalogProblem => ({
  id, title: id, slug: id, leetcodeUrl: `https://leetcode.com/problems/${id}/`,
  difficulty, topics: [primaryTopic], primaryTopic, neetcodeUrl: '', lists, neetcodeOrder: 0
});

const prog = (problemId: string, status: ProblemProgress['status'], reviewStage?: ProblemProgress['reviewStage']): ProblemProgress => ({
  problemId, status, reviewStage: reviewStage ?? (status === 'mastered' ? 5 : 1), nextReviewDate: null,
  lastAttemptDate: '2026-08-01', lastQuality: 'strong', strongAttemptCount: 1,
  consecutiveWeak: 0, struggling: false, updatedAt: '2026-08-01T00:00:00.000Z'
});

let counter = 0;
const attempt = (problemId: string, over: Partial<Attempt> = {}): Attempt => ({
  id: `a${counter++}`, problemId, attemptedOn: '2026-08-01', outcome: 'solved_independently',
  perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: '',
  quality: 'strong', createdAt: `2026-08-01T10:00:${String(counter % 60).padStart(2, '0')}.000Z`, ...over
});

const twoTopics = [problem('a1', 'Arrays & Hashing'), problem('a2', 'Arrays & Hashing'), problem('t1', 'Trees')];
const base = { progress: [], attempts: [], problems: twoTopics, currentStreakDays: 0, level: 0 };

describe('badgesEarned', () => {
  it('grants nothing for an empty profile', () => {
    expect(badgesEarned(base)).toEqual([]);
  });

  it('does not grant all-mastered or list badges on an empty catalog (vacuous every)', () => {
    const earned = badgesEarned({ ...base, problems: [], allProblems: [] });
    expect(earned).not.toContain('all-mastered');
    expect(earned).not.toContain('list-75');
  });

  it('grants first-solve on any solved problem', () => {
    const earned = badgesEarned({ ...base, progress: [prog('a1', 'solved')], attempts: [attempt('a1')], currentStreakDays: 1 });
    expect(earned).toContain('first-solve');
    expect(earned).not.toContain('first-mastered');
  });

  it('grants topic-cleared (topic proficient) only when every core problem in a topic is at stage 3+', () => {
    const partial = badgesEarned({ ...base, progress: [prog('a1', 'solved', 3), prog('a2', 'solved', 2)] });
    expect(partial).not.toContain('topic-cleared');
    const full = badgesEarned({ ...base, progress: [prog('a1', 'solved', 3), prog('a2', 'solved', 4)] });
    expect(full).toContain('topic-cleared');
    expect(full).not.toContain('first-mastered');
  });

  it('only asks for core problems: the extra 100 of the 250 do not block proficiency', () => {
    const problems = [problem('core', 'Trees'), problem('extra', 'Trees', ['nc250'])];
    const progress = [prog('core', 'solved', 3)];
    expect(proficientTopics(problems, progress, 'nc250')).toEqual(new Set(['Trees']));
    expect(badgesEarned({ ...base, problems, progress, problemSet: 'nc250' })).toContain('topic-cleared');
  });

  it('asks for the NeetCode 75 only when that set is active', () => {
    const problems = [problem('seventy-five', 'Trees', ['nc75', 'nc150', 'nc250']), problem('hundred-fifty', 'Trees', ['nc150', 'nc250'])];
    const progress = [prog('seventy-five', 'solved', 3)];
    expect(proficientTopics(problems, progress, 'nc75').has('Trees')).toBe(true);
    expect(proficientTopics(problems, progress, 'nc150').has('Trees')).toBe(false);
  });

  it('never counts a topic with no core problem', () => {
    expect(proficientTopics([problem('extra', 'Trees', ['nc250'])], [prog('extra', 'solved', 5)], 'nc150').size).toBe(0);
  });

  it('grants all-mastered only when every problem in the set is mastered', () => {
    const notAll = badgesEarned({ ...base, progress: [prog('a1', 'mastered'), prog('a2', 'mastered')] });
    expect(notAll).not.toContain('all-mastered');
    const all = badgesEarned({ ...base, progress: [prog('a1', 'mastered'), prog('a2', 'mastered'), prog('t1', 'mastered')] });
    expect(all).toContain('all-mastered');
    expect(all).not.toContain('five-topics-cleared'); // only 2 topics in this catalog
  });

  it('grants five-topics-cleared at five proficient topics', () => {
    const problems = Array.from({ length: 5 }, (_, i) => problem(`x${i}`, `T${i}`));
    const notYet = badgesEarned({ ...base, problems, progress: problems.slice(0, 4).map((p) => prog(p.id, 'solved', 3)) });
    expect(notYet).not.toContain('five-topics-cleared');
    const cleared = badgesEarned({ ...base, problems, progress: problems.map((p) => prog(p.id, 'solved', 3)) });
    expect(cleared).toContain('five-topics-cleared');
  });

  it('grants the retention badges at 10 / 25 / 50 problems at stage 3+', () => {
    const rows = (n: number, stage: ProblemProgress['reviewStage'] = 3) => Array.from({ length: n }, (_, i) => prog(`r${i}`, 'solved', stage));
    expect(badgesEarned({ ...base, progress: rows(9) })).not.toContain('retained-10');
    expect(badgesEarned({ ...base, progress: rows(10, 2) })).not.toContain('retained-10');
    expect(badgesEarned({ ...base, progress: rows(10) })).toContain('retained-10');
    expect(badgesEarned({ ...base, progress: rows(25) })).toEqual(expect.arrayContaining(['retained-10', 'retained-25']));
    expect(badgesEarned({ ...base, progress: rows(50) })).toContain('retained-50');
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

  it('grants the weekly-consistency badges at 4 / 12 / 26 weeks', () => {
    expect(badgesEarned({ ...base, weeklyStreakWeeks: 3 })).not.toContain('weeks-4');
    expect(badgesEarned({ ...base, weeklyStreakWeeks: 4 })).toContain('weeks-4');
    expect(badgesEarned({ ...base, weeklyStreakWeeks: 11 })).not.toContain('weeks-12');
    expect(badgesEarned({ ...base, weeklyStreakWeeks: 12 })).toContain('weeks-12');
    expect(badgesEarned({ ...base, weeklyStreakWeeks: 26 })).toEqual(expect.arrayContaining(['weeks-4', 'weeks-12', 'weeks-26']));
  });

  it('grants welcome-back only when the user practised again after a 7+ day gap', () => {
    const on = (date: string) => attempt('a1', { attemptedOn: date, createdAt: `${date}T10:00:00.000Z` });
    expect(badgesEarned({ ...base, attempts: [on('2026-08-01'), on('2026-08-07')] })).not.toContain('welcome-back'); // 6 days
    expect(badgesEarned({ ...base, attempts: [on('2026-08-01'), on('2026-08-08')] })).toContain('welcome-back'); // 7 days
    expect(badgesEarned({ ...base, attempts: [on('2026-08-01')] })).not.toContain('welcome-back'); // no return yet
  });

  it('grants comeback on the strong attempt that ends a run of 3 weak ones, not before', () => {
    const run = (qualities: Attempt['quality'][]) => qualities.map((quality, i) => attempt('a1', {
      quality, attemptedOn: `2026-08-0${i + 1}`, createdAt: `2026-08-0${i + 1}T10:00:00.000Z`,
      outcome: quality === 'weak' ? 'could_not_solve' : 'solved_independently'
    }));
    expect(badgesEarned({ ...base, attempts: run(['weak', 'weak', 'strong']) })).not.toContain('comeback');
    expect(badgesEarned({ ...base, attempts: run(['weak', 'weak', 'weak']) })).not.toContain('comeback');
    expect(badgesEarned({ ...base, attempts: run(['weak', 'weak', 'weak', 'partial']) })).not.toContain('comeback');
    expect(badgesEarned({ ...base, attempts: run(['weak', 'weak', 'weak', 'strong']) })).toContain('comeback');
  });

  it('grants foundations-solid when every foundations topic in the set reaches the skill threshold', () => {
    const problems = [problem('f1', 'Arrays & Hashing'), problem('f2', 'Two Pointers'), problem('m1', 'Graphs')];
    const strong = (id: string, day: number) => attempt(id, { attemptedOn: `2026-08-${String(day).padStart(2, '0')}`, createdAt: `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z` });
    const one = [strong('f1', 1), strong('f1', 2), strong('f1', 3)];
    expect(badgesEarned({ ...base, problems, attempts: one })).not.toContain('foundations-solid');
    const both = [...one, strong('f2', 4), strong('f2', 5), strong('f2', 6)];
    expect(badgesEarned({ ...base, problems, attempts: both })).toContain('foundations-solid');
  });

  it('grants the level badges at their exact thresholds', () => {
    expect(badgesEarned({ ...base, level: 4 })).not.toContain('level-5');
    expect(badgesEarned({ ...base, level: 5 })).toContain('level-5');
    expect(badgesEarned({ ...base, level: 10 })).toEqual(expect.arrayContaining(['level-5', 'level-10']));
  });

  it('scales the volume badges to the active set', () => {
    expect(volumeTargets(75)).toEqual({ half: 38, century: 75 });
    expect(volumeTargets(150)).toEqual({ half: 75, century: 100 });
    expect(volumeTargets(250)).toEqual({ half: 125, century: 100 });
    const set = Array.from({ length: 75 }, (_, i) => problem(`p${i}`, 'Trees', ['nc75', 'nc150', 'nc250']));
    const mk = (n: number) => set.slice(0, n).map((p) => attempt(p.id));
    expect(badgesEarned({ ...base, problems: set, attempts: mk(37) })).not.toContain('half-catalog');
    expect(badgesEarned({ ...base, problems: set, attempts: mk(38) })).toContain('half-catalog');
    expect(badgesEarned({ ...base, problems: set, attempts: mk(74) })).not.toContain('century');
    expect(badgesEarned({ ...base, problems: set, attempts: mk(75) })).toContain('century'); // the whole 75
  });

  it('counts distinct in-set problems, not attempt rows, for the volume milestones', () => {
    const manyAttemptsOneProblem = Array.from({ length: 80 }, () => attempt('a1'));
    expect(badgesEarned({ ...base, attempts: manyAttemptsOneProblem })).not.toContain('half-catalog');
  });

  it('grants a list-complete badge when every problem in that list is solved, whatever set is active', () => {
    const catalog = [
      problem('s1', 'Trees', ['nc75', 'nc150', 'nc250']),
      problem('h1', 'Trees', ['nc150', 'nc250']),
      problem('e1', 'Trees', ['nc250'])
    ];
    const active = catalog.slice(0, 1); // the 75 is active
    const earn = (ids: string[]) => badgesEarned({
      ...base, problems: active, allProblems: catalog, problemSet: 'nc75', progress: ids.map((id) => prog(id, 'solved'))
    });
    expect(earn([])).not.toContain('list-75');
    expect(earn(['s1'])).toContain('list-75');
    expect(earn(['s1'])).not.toContain('list-150');
    expect(earn(['s1', 'h1'])).toContain('list-150'); // finishing the 150 counts while the 75 is active
    expect(earn(['s1', 'h1'])).not.toContain('list-250');
    expect(earn(['s1', 'h1', 'e1'])).toContain('list-250');
  });
});

describe('badgeHint', () => {
  it('quotes the active set for volume and proficiency badges', () => {
    expect(badgeHint('half-catalog', 'nc75', 75)).toBe('Attempt 38 problems from the NeetCode 75.');
    expect(badgeHint('century', 'nc250', 250)).toBe('Attempt 100 problems from the NeetCode 250.');
    expect(badgeHint('topic-cleared', 'nc75', 75)).toContain('NeetCode 75');
    expect(badgeHint('topic-cleared', 'nc250', 250)).toContain('NeetCode 150');
  });

  it('falls back to the neutral hint, and every badge has one', () => {
    expect(badgeHint('level-5', 'nc150', 150)).toBe('Reach level 5.');
    for (const badge of BADGES) expect(badgeHint(badge.id, 'nc150', 150).length).toBeGreaterThan(0);
  });
});

describe('mergeBadges', () => {
  it('unions without dropping a stored badge that is no longer earned', () => {
    expect(mergeBadges(['first-solve'], ['first-mastered'])).toEqual(['first-mastered', 'first-solve']);
  });

  it('is idempotent', () => {
    const once = mergeBadges([], ['first-solve', 'century']);
    expect(mergeBadges(once, ['first-solve', 'century'])).toEqual(once);
  });

  it('orders by the BADGES list, not insertion order', () => {
    expect(mergeBadges(['century'], ['first-solve'])).toEqual(['first-solve', 'century']);
    // shelf order: retention -> consistency -> mastery -> volume -> level
    expect(mergeBadges(['level-5', 'century', 'first-mastered', 'week-streak'], ['retained-10'])).toEqual(['retained-10', 'week-streak', 'first-mastered', 'century', 'level-5']);
  });

  it('drops an unknown stored id rather than surfacing it', () => {
    expect(mergeBadges(['retired-badge', 'first-solve'], [])).toEqual(['first-solve']);
  });
});
