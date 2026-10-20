import { describe, expect, it } from 'vitest';
import { dayWrapUp, minutesWords, nextReviewWords, type DayWrapUpInput } from './dayWrapUp';
import { attemptXpAwards, replayXp } from './gamification';
import type { Attempt, ProblemProgress } from '../types/models';

const TODAY = '2026-10-20';
let counter = 0;
const attempt = (over: Partial<Attempt>): Attempt => {
  counter += 1;
  return {
    id: `a${String(counter).padStart(3, '0')}`,
    problemId: 'p1',
    attemptedOn: TODAY,
    outcome: 'solved_independently',
    perceivedDifficulty: 'manageable',
    helpType: null,
    durationMinutes: null,
    notes: '',
    quality: 'strong',
    createdAt: `${over.attemptedOn ?? TODAY}T10:${String(counter % 60).padStart(2, '0')}:00.000Z`,
    ...over
  };
};
const row = (problemId: string, nextReviewDate: string | null): ProblemProgress => ({
  problemId, status: 'solved', reviewStage: 1, nextReviewDate, lastAttemptDate: TODAY, lastQuality: 'strong',
  strongAttemptCount: 1, consecutiveWeak: 0, struggling: false, updatedAt: `${TODAY}T10:00:00.000Z`
});
const input = (over: Partial<DayWrapUpInput> = {}): DayWrapUpInput => ({
  today: TODAY,
  planProblemIds: ['p1', 'p2'],
  completedProblemIds: new Set(['p1', 'p2']),
  attempts: [attempt({ problemId: 'p1', durationMinutes: 20 }), attempt({ problemId: 'p2', durationMinutes: 15 })],
  progress: [row('p1', '2026-10-21'), row('p2', '2026-10-23')],
  catalogIds: new Set(['p1', 'p2', 'p3']),
  ...over
});

describe('dayWrapUp', () => {
  it('is null until every plan item is logged', () => {
    expect(dayWrapUp(input({ completedProblemIds: new Set(['p1']) }))).toBeNull();
    expect(dayWrapUp(input({ completedProblemIds: new Set() }))).toBeNull();
  });

  it('is null when there is no plan', () => {
    expect(dayWrapUp(input({ planProblemIds: [] }))).toBeNull();
  });

  it('counts the plan items, today\'s attempts and the logged minutes', () => {
    const wrapUp = dayWrapUp(input());
    expect(wrapUp).toMatchObject({ itemsDone: 2, attemptsToday: 2, minutesLogged: 35, untimedAttempts: 0 });
  });

  it('reports no minutes (not 0) when no attempt carried a duration', () => {
    const wrapUp = dayWrapUp(input({ attempts: [attempt({ problemId: 'p1' }), attempt({ problemId: 'p2' })] }));
    expect(wrapUp?.minutesLogged).toBeNull();
    expect(minutesWords(wrapUp!)).toBe('No time logged');
  });

  it('says how many attempts were timed when only some were', () => {
    const wrapUp = dayWrapUp(input({ attempts: [attempt({ problemId: 'p1', durationMinutes: 12 }), attempt({ problemId: 'p2' })] }))!;
    expect(wrapUp).toMatchObject({ minutesLogged: 12, untimedAttempts: 1 });
    expect(minutesWords(wrapUp)).toBe('12 min (1 of 2 attempts timed)');
    expect(minutesWords({ minutesLogged: 35, untimedAttempts: 0, attemptsToday: 2 })).toBe('35 min');
  });

  it('ignores attempts from other days for minutes and XP', () => {
    const old = attempt({ problemId: 'p3', attemptedOn: '2026-10-18', durationMinutes: 90 });
    const wrapUp = dayWrapUp(input({ attempts: [old, ...input().attempts] }))!;
    expect(wrapUp.attemptsToday).toBe(2);
    expect(wrapUp.minutesLogged).toBe(35);
    const awards = attemptXpAwards([old, ...input().attempts]);
    expect(wrapUp.xpEarned).toBe(replayXp([old, ...input().attempts]) - awards.get(old.id)!);
  });

  it('counts a logged problem outside the plan (a catalog log) in minutes and XP', () => {
    const extra = attempt({ problemId: 'p3', durationMinutes: 8 });
    const wrapUp = dayWrapUp(input({ attempts: [...input().attempts, extra] }))!;
    expect(wrapUp).toMatchObject({ itemsDone: 2, attemptsToday: 3, minutesLogged: 43 });
  });

  describe('XP earned today', () => {
    it('is exactly what the live award folds give those attempts, bonuses included', () => {
      // Yesterday's strong solve of p1, due today: today's recall earns the retention bonus.
      const yesterday = attempt({ problemId: 'p1', attemptedOn: '2026-10-19' });
      const todays = [attempt({ problemId: 'p1' }), attempt({ problemId: 'p2', quality: 'weak', outcome: 'could_not_solve' })];
      const all = [yesterday, ...todays];
      const awards = attemptXpAwards(all);
      const expected = todays.reduce((sum, a) => sum + awards.get(a.id)!, 0);
      expect(dayWrapUp(input({ attempts: all }))!.xpEarned).toBe(expected);
      expect(dayWrapUp(input({ attempts: all }))!.xpEarned).toBe(replayXp(all) - awards.get(yesterday.id)!);
    });

    it('counts the repeat pass on the same problem at the reduced same-day award', () => {
      const first = attempt({ problemId: 'p1' });
      const again = attempt({ problemId: 'p1' });
      const only = dayWrapUp(input({ planProblemIds: ['p1'], completedProblemIds: new Set(['p1']), attempts: [first] }))!;
      const both = dayWrapUp(input({ planProblemIds: ['p1'], completedProblemIds: new Set(['p1']), attempts: [first, again] }))!;
      expect(both.xpEarned).toBeGreaterThan(only.xpEarned);
      expect(both.xpEarned - only.xpEarned).toBe(attemptXpAwards([first, again]).get(again.id));
    });

    it('recomputes after an undo (the attempt row is gone)', () => {
      const [a, b] = input().attempts;
      const full = dayWrapUp(input({ attempts: [a, b] }))!;
      const undone = dayWrapUp(input({ planProblemIds: ['p1'], completedProblemIds: new Set(['p1']), attempts: [a] }))!;
      expect(undone.xpEarned).toBe(attemptXpAwards([a]).get(a.id));
      expect(full.xpEarned).toBeGreaterThan(undone.xpEarned);
      // ...and with the item reopened there is no summary at all.
      expect(dayWrapUp(input({ completedProblemIds: new Set(['p1']), attempts: [a] }))).toBeNull();
    });

    it('is 0 when nothing was attempted today (a plan completed some other way)', () => {
      expect(dayWrapUp(input({ attempts: [] }))).toMatchObject({ xpEarned: 0, attemptsToday: 0, minutesLogged: null });
    });
  });

  describe('next review', () => {
    it('is the earliest review date after today', () => {
      expect(dayWrapUp(input({ progress: [row('p1', '2026-10-27'), row('p2', '2026-10-22'), row('p3', '2026-11-30')] }))!.nextReviewDate).toBe('2026-10-22');
    });

    it('skips dates on or before today and rows with no date', () => {
      const wrapUp = dayWrapUp(input({ progress: [row('p1', '2026-10-20'), row('p2', null), row('p3', '2026-10-25')] }))!;
      expect(wrapUp.nextReviewDate).toBe('2026-10-25');
    });

    it('is null when nothing is scheduled', () => {
      expect(dayWrapUp(input({ progress: [row('p1', null)] }))!.nextReviewDate).toBeNull();
      expect(dayWrapUp(input({ progress: [] }))!.nextReviewDate).toBeNull();
    });

    it('ignores progress rows for ids outside the catalog', () => {
      const wrapUp = dayWrapUp(input({ progress: [row('ghost', '2026-10-21'), row('p1', '2026-10-24')] }))!;
      expect(wrapUp.nextReviewDate).toBe('2026-10-24');
    });

    it('counts reviews still due that the plan left out (budget or overload)', () => {
      const wrapUp = dayWrapUp(input({ progress: [row('p1', '2026-10-21'), row('p3', '2026-10-15'), row('p2', '2026-10-20'), row('ghost', '2026-10-01')] }))!;
      expect(wrapUp.reviewsStillDue).toBe(2);
      expect(wrapUp.nextReviewDate).toBe('2026-10-21');
    });

    it('leaves out due reviews the plan does not owe (covered, parked or later in the topic)', () => {
      const wrapUp = dayWrapUp(input({ progress: [row('p3', '2026-10-15'), row('p2', '2026-10-20')], optionalIds: new Set(['p3']) }))!;
      expect(wrapUp.reviewsStillDue).toBe(1);
    });
  });
});

describe('nextReviewWords', () => {
  it('names tomorrow, a number of days, and none', () => {
    expect(nextReviewWords('2026-10-21', TODAY)).toBe('Tomorrow (2026-10-21)');
    expect(nextReviewWords('2026-10-23', TODAY)).toBe('In 3 days (2026-10-23)');
    expect(nextReviewWords('2026-11-02', TODAY)).toBe('In 13 days (2026-11-02)');
    expect(nextReviewWords(null, TODAY)).toBe('No reviews scheduled');
  });
});
