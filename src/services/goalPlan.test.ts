import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import { problemsInSet } from './problemSet';
import { minutesEstimator } from './sessionTime';
import { buildGoalPlan, checkInterviewDate, formatHours, goalDetail, goalLine, goalLineShort, onTimeReviewOffsets, parseInterviewDate, parseSkipEasies, readGoalSettings, recommendationText, type GoalInput } from './goalPlan';
import type { Attempt } from '../types/models';

const today = '2026-10-20';

describe('checkInterviewDate', () => {
  it('accepts tomorrow and the far limit, and reports the days left', () => {
    expect(checkInterviewDate('2026-10-21', today)).toEqual({ ok: true, date: '2026-10-21', daysLeft: 1 });
    expect(checkInterviewDate('2026-12-01', today)).toEqual({ ok: true, date: '2026-12-01', daysLeft: 42 });
    expect(checkInterviewDate('2028-10-19', today)).toEqual({ ok: true, date: '2028-10-19', daysLeft: 730 });
  });
  it('rejects today and past dates', () => {
    expect(checkInterviewDate('2026-10-20', today)).toEqual({ ok: false, reason: 'past' });
    expect(checkInterviewDate('2020-01-01', today)).toEqual({ ok: false, reason: 'past' });
    expect(checkInterviewDate('0002-10-20', today)).toEqual({ ok: false, reason: 'past' });
  });
  it('rejects a date more than two years away as a typo', () => {
    expect(checkInterviewDate('2028-10-20', today)).toEqual({ ok: false, reason: 'far' });
    expect(checkInterviewDate('2999-01-01', today)).toEqual({ ok: false, reason: 'far' });
  });
  it('rejects empty, malformed and impossible dates', () => {
    expect(checkInterviewDate('', today)).toEqual({ ok: false, reason: 'empty' });
    expect(checkInterviewDate('  ', today)).toEqual({ ok: false, reason: 'empty' });
    for (const bad of ['tomorrow', '2026-13-01', '2026-02-30', '26-10-21', '2026/10/21', '20261-10-21', '2026-10-2']) {
      expect(checkInterviewDate(bad, today), bad).toEqual({ ok: false, reason: 'invalid' });
    }
  });
  it('a stored value that has passed, or is junk, means no deadline', () => {
    expect(parseInterviewDate('2026-12-01', today)).toEqual({ date: '2026-12-01', daysLeft: 42 });
    expect(parseInterviewDate('2026-10-19', today)).toBeNull();
    expect(parseInterviewDate('soon', today)).toBeNull();
    expect(parseInterviewDate(undefined, today)).toBeNull();
  });
});

describe('settings parsing', () => {
  it('skipEasies is on only for "1"', () => {
    expect(parseSkipEasies('1')).toBe(true);
    for (const off of [undefined, '', '0', 'true']) expect(parseSkipEasies(off)).toBe(false);
  });
  it('reads the goal settings and flags a date that has passed', () => {
    expect(readGoalSettings([], today)).toEqual({ interview: null, expiredInterviewDate: null, skipEasies: false, weeklyGoalDays: null, budget: null });
    const rows = [{ key: 'interviewDate', value: '2026-12-01' }, { key: 'skipEasies', value: '1' }, { key: 'weeklyGoalDays', value: '5' }, { key: 'sessionMinutes', value: '30' }] as const;
    expect(readGoalSettings([...rows], today)).toEqual({ interview: { date: '2026-12-01', daysLeft: 42 }, expiredInterviewDate: null, skipEasies: true, weeklyGoalDays: 5, budget: 30 });
    expect(readGoalSettings([{ key: 'interviewDate', value: '2026-09-01' }], today).expiredInterviewDate).toBe('2026-09-01');
  });
});

describe('review offsets', () => {
  it('are read off the real review rules: 3, 10, 24 and 54 days after a strong first solve', () => {
    expect(onTimeReviewOffsets()).toEqual([3, 10, 24, 54]);
  });
});

function input(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    catalog,
    startedIds: new Set(),
    attempts: [],
    estimate: minutesEstimator([], catalog, today),
    interview: { daysLeft: 84 },
    today,
    skipEasies: false,
    weeklyGoalDays: null,
    budget: null,
    ...overrides
  };
}

const paceAttempts = () => catalog.slice(0, 8).map((problem, index) => ({ problemId: problem.id, attemptedOn: index < 4 ? '2026-10-12' : '2026-10-19' }));

describe('buildGoalPlan', () => {
  it('works the hours out by hand for a tiny catalog', () => {
    const tiny = catalog.slice(0, 2).map((problem, index) => ({ ...problem, difficulty: 'easy' as const, lists: ['nc75', 'nc150', 'nc250'] as typeof problem.lists, neetcodeOrder: index }));
    const plan = buildGoalPlan(input({ catalog: tiny, interview: { daysLeft: 14 }, estimate: minutesEstimator([], tiny, today) }));
    const fit = plan.fits[0];
    // Two Easies at 20 min each, one topic, started on day 3.5 and day 10.5 of 14. The topic's pattern
    // is reviewed 3, 10, 24 and 54 days after its first problem, counted only before day 14: 3.5+3 and
    // 3.5+10 (2 reviews, 10 min each). Each first attempt adds 0.4 of a re-solve: 0.8 (8 min), rounded to 1.
    expect(fit.remaining).toBe(2);
    expect(fit.newMinutes).toBe(40);
    expect(fit.reviews).toBe(3);
    expect(fit.reviewMinutes).toBe(28);
    expect(fit.totalMinutes).toBe(68);
    expect(fit.perWeek).toBe(1);
    // Assumed 4 days x 45 min over 2 weeks.
    expect(plan.availableMinutes).toBe(360);
    expect(fit.fits).toBe(true);
  });

  it('uses the weekly goal and the time budget when set, and says when it assumed them', () => {
    const assumed = buildGoalPlan(input());
    expect([assumed.daysPerWeek, assumed.sessionMinutes, assumed.daysAssumed, assumed.minutesAssumed]).toEqual([4, 45, true, true]);
    const own = buildGoalPlan(input({ weeklyGoalDays: 6, budget: 60 }));
    expect([own.daysPerWeek, own.sessionMinutes, own.daysAssumed, own.minutesAssumed]).toEqual([6, 60, false, false]);
    expect(own.availableMinutes).toBe(Math.round(12 * 6 * 60));
    expect(own.availableMinutes).toBeGreaterThan(assumed.availableMinutes);
  });

  it('recommends the largest set that fits, and the smallest when none does', () => {
    const roomy = buildGoalPlan(input({ interview: { daysLeft: 730 }, weeklyGoalDays: 7, budget: 60 }));
    expect(roomy.recommended.set).toBe('nc250');
    const tight = buildGoalPlan(input());
    const fitting = tight.fits.filter((fit) => fit.fits);
    expect(tight.recommended.set).toBe(fitting.length > 0 ? fitting[fitting.length - 1].set : 'nc75');
    const crunch = buildGoalPlan(input({ interview: { daysLeft: 3 } }));
    expect(crunch.anyFits).toBe(false);
    expect(crunch.recommended.set).toBe('nc75');
    expect(recommendationText(crunch)).toContain('more than your time allows');
  });

  it('hours grow with the set, and shrink as problems are started or Easies are skipped', () => {
    const plan = buildGoalPlan(input());
    const hours = plan.fits.map((fit) => fit.totalMinutes);
    expect(hours[0]).toBeLessThan(hours[1]);
    expect(hours[1]).toBeLessThan(hours[2]);
    expect(plan.fits.map((fit) => fit.remaining)).toEqual([75, 150, 250]);

    const started = new Set(problemsInSet(catalog, 'nc75').slice(0, 20).map((problem) => problem.id));
    const some = buildGoalPlan(input({ startedIds: started }));
    expect(some.fits[0].remaining).toBe(55);
    expect(some.fits[0].totalMinutes).toBeLessThan(plan.fits[0].totalMinutes);

    const skipped = buildGoalPlan(input({ skipEasies: true }));
    const easies = (set: 'nc75' | 'nc150' | 'nc250') => problemsInSet(catalog, set).filter((problem) => problem.difficulty === 'easy').length;
    expect(skipped.fits.map((fit) => fit.remaining)).toEqual([75 - easies('nc75'), 150 - easies('nc150'), 250 - easies('nc250')]);
    expect(skipped.fits[1].totalMinutes).toBeLessThan(plan.fits[1].totalMinutes);
  });

  it('uses the user\'s own logged minutes once there are enough (T12 estimates)', () => {
    const base = buildGoalPlan(input());
    const hards = catalog.filter((problem) => problem.difficulty === 'hard').slice(0, 3);
    const attempts: Attempt[] = hards.map((problem, index) => ({ id: `a${index}`, problemId: problem.id, attemptedOn: `2026-10-0${index + 1}`, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: 100, notes: '', quality: 'strong', createdAt: `2026-10-0${index + 1}T10:00:00.000Z` }));
    const calibrated = buildGoalPlan(input({ estimate: minutesEstimator(attempts, catalog, today) }));
    expect(calibrated.fits[0].newMinutes).toBeGreaterThan(base.fits[0].newMinutes);
    const two = buildGoalPlan(input({ estimate: minutesEstimator(attempts.slice(0, 2), catalog, today) }));
    expect(two.fits[0].newMinutes).toBe(base.fits[0].newMinutes);
  });

  it('takes the user pace from the T14 forecast, and is null on thin history', () => {
    expect(buildGoalPlan(input()).yourPace).toBeNull();
    expect(buildGoalPlan(input({ attempts: paceAttempts() })).yourPace).toBe(4);
  });

  it('an empty to-do list is free and fits', () => {
    const everything = new Set(catalog.map((problem) => problem.id));
    const done = buildGoalPlan(input({ startedIds: everything }));
    expect(done.fits.every((fit) => fit.remaining === 0 && fit.totalMinutes === 0 && fit.fits)).toBe(true);
    expect(goalLine(done, 'nc75')).toContain('started every problem');
  });

  it('is deterministic', () => {
    expect(buildGoalPlan(input())).toEqual(buildGoalPlan(input()));
  });
});

describe('wording', () => {
  it('formats hours honestly', () => {
    expect(formatHours(40)).toBe('40 min');
    expect(formatHours(60)).toBe('1 h');
    expect(formatHours(2300)).toBe('38.3 h');
  });
  it('explains the arithmetic, including what is assumed and what is not counted', () => {
    const plan = buildGoalPlan(input());
    const text = goalDetail(plan, 'nc75').join('\n');
    expect(text).toContain('75 new problems');
    expect(text).toContain('3, 10, 24, 54 days');
    expect(text).toContain('4 days a week (assumed) × 45 min (assumed)');
    expect(text).toContain('Not enough history');
    expect(text).toContain('not counted');
    expect(goalLine(plan, 'nc75')).toMatch(/^Interview in 84 days: NeetCode 75 is about /);
    expect(goalLineShort(plan, 'nc75')).toMatch(/^Interview in 84 days · NeetCode 75 ≈ .* h, \d+ new a week · (fits|over) your time$/);
  });
  it('mentions the pace gap when the user is slower than the plan needs', () => {
    const attempts = paceAttempts();
    const plan = buildGoalPlan(input({ attempts, startedIds: new Set(attempts.map((attempt) => attempt.problemId)) }));
    expect(goalDetail(plan, 'nc250').join('\n')).toContain('Your recent pace is 4 new problems a week, below the');
  });
});
