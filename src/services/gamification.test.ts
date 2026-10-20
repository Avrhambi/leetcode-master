import { describe, expect, it } from 'vitest';
import { attemptXpAwards, levelForXp, replayXp, snapshotForXp, stagesBeforeEach, xpAfterReplay, xpForAttempt, xpForLevel } from './gamification';
import { XP_BY_QUALITY, XP_COMEBACK_BONUS, XP_RETENTION_BONUS_BY_STAGE, xpStreakMultiplier } from './constants';
import { streakEndingOn } from './streak';
import type { Attempt } from '../types/models';

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: crypto.randomUUID(),
  problemId: 'p1',
  attemptedOn: '2026-08-01',
  outcome: 'solved_independently',
  perceivedDifficulty: 'manageable',
  helpType: null,
  durationMinutes: null,
  notes: '',
  quality: 'strong',
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over
});

describe('xpForAttempt', () => {
  it('awards the full quality-based amount on the first attempt of a ×1.0 streak day', () => {
    expect(xpForAttempt('strong', true, 1)).toBe(20);
    expect(xpForAttempt('partial', true, 2)).toBe(12);
    expect(xpForAttempt('weak', true, 0)).toBe(5);
  });

  it('awards a quarter (rounded) for a same-day reinforcement pass', () => {
    expect(xpForAttempt('strong', false, 1)).toBe(5);
    expect(xpForAttempt('partial', false, 1)).toBe(3);
    expect(xpForAttempt('weak', false, 1)).toBe(1);
  });

  it('scales by the streak-consistency multiplier, rounding once over the whole product', () => {
    expect(xpForAttempt('strong', true, 3)).toBe(22); // 20 × 1.1
    expect(xpForAttempt('strong', true, 7)).toBe(25); // 20 × 1.25
    expect(xpForAttempt('strong', true, 14)).toBe(30); // 20 × 1.5
    expect(xpForAttempt('strong', true, 999)).toBe(30); // ceiling holds
    expect(xpForAttempt('partial', true, 3)).toBe(13); // round(12 × 1.1 = 13.2)
    expect(xpForAttempt('weak', false, 7)).toBe(2); // round(5 × 0.25 × 1.25 = 1.5625)
  });
});

describe('levelForXp / xpForLevel', () => {
  it('is 0 at 0 XP and non-positive XP', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(-100)).toBe(0);
  });

  it('hits the expected breakpoints', () => {
    expect(levelForXp(49)).toBe(0);
    expect(levelForXp(50)).toBe(1);
    expect(levelForXp(199)).toBe(1);
    expect(levelForXp(200)).toBe(2);
    expect(levelForXp(450)).toBe(3);
    expect(levelForXp(800)).toBe(4);
  });

  it('is monotonic non-decreasing across a wide range', () => {
    let last = 0;
    for (let xp = 0; xp <= 5000; xp += 7) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('xpForLevel is the inverse boundary of levelForXp', () => {
    for (let level = 0; level <= 10; level += 1) {
      const start = xpForLevel(level);
      expect(levelForXp(start)).toBe(level);
      if (start > 0) expect(levelForXp(start - 1)).toBe(level - 1);
    }
  });
});

describe('snapshotForXp', () => {
  it('reports progress within the current level', () => {
    const snap = snapshotForXp(120);
    expect(snap.level).toBe(1);
    expect(snap.xpIntoLevel).toBe(70); // 120 - 50
    expect(snap.xpForNextLevel).toBe(150); // 200 - 50
  });

  it('is exact at a level boundary', () => {
    const snap = snapshotForXp(200);
    expect(snap.level).toBe(2);
    expect(snap.xpIntoLevel).toBe(0);
  });
});

describe('replayXp', () => {
  it('sums first-of-day XP across distinct problem-days (all ×1.0, streak < 3)', () => {
    const xp = replayXp([
      attempt({ problemId: 'p1', attemptedOn: '2026-08-01', quality: 'strong' }),
      attempt({ problemId: 'p2', attemptedOn: '2026-08-01', quality: 'weak' }),
      attempt({ problemId: 'p1', attemptedOn: '2026-08-02', quality: 'partial' })
    ]);
    expect(xp).toBe(20 + 5 + 12);
  });

  it('applies the consistency multiplier once the streak crosses a tier', () => {
    // Five consecutive days, one strong attempt each. Days 1–2 ×1.0, days 3–5 ×1.1.
    const days = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
    const xp = replayXp(days.map((d, i) => attempt({
      problemId: `p${i}`, attemptedOn: d, quality: 'strong', createdAt: `${d}T09:00:00.000Z`
    })));
    expect(xp).toBe(20 + 20 + 22 + 22 + 22);
  });

  it('discounts a same-day repeat regardless of insertion order', () => {
    const first = attempt({ problemId: 'p1', attemptedOn: '2026-08-01', quality: 'strong', createdAt: '2026-08-01T09:00:00.000Z' });
    const repeat = attempt({ problemId: 'p1', attemptedOn: '2026-08-01', quality: 'strong', createdAt: '2026-08-01T18:00:00.000Z' });
    expect(replayXp([repeat, first])).toBe(20 + 5);
  });

  it('is 0 for an empty history', () => {
    expect(replayXp([])).toBe(0);
  });

  // The live path (saveAttempt) computes isFirstOfDay by counting attempt rows
  // already stored for this problem + attemptedOn. This folds a history the same
  // way and must land on the same lifetime total replayXp reports.
  it('agrees with an incremental live-award fold, including a backdated attempt', () => {
    const history: Attempt[] = [
      attempt({ id: 'a', problemId: 'p1', attemptedOn: '2026-08-01', quality: 'strong', createdAt: '2026-08-01T09:00:00.000Z' }),
      attempt({ id: 'b', problemId: 'p1', attemptedOn: '2026-08-01', quality: 'weak', createdAt: '2026-08-01T20:00:00.000Z' }),
      attempt({ id: 'c', problemId: 'p2', attemptedOn: '2026-08-02', quality: 'partial', createdAt: '2026-08-02T09:00:00.000Z' }),
      // logged on the 3rd but backdated to the 1st — a fresh problem-day
      attempt({ id: 'd', problemId: 'p1', attemptedOn: '2026-07-30', quality: 'strong', createdAt: '2026-08-03T09:00:00.000Z' })
    ];

    // Mirror saveAttempt: fold in createdAt order, accumulating active dates, and
    // compute the streak-ending-on multiplier from the dates seen so far.
    let liveTotal = 0;
    const stored: Attempt[] = [];
    const activeDates = new Set<string>();
    for (const next of history) {
      const isFirstOfDay = !stored.some((a) => a.problemId === next.problemId && a.attemptedOn === next.attemptedOn);
      activeDates.add(next.attemptedOn);
      liveTotal += xpForAttempt(next.quality, isFirstOfDay, streakEndingOn(activeDates, next.attemptedOn));
      stored.push(next);
    }

    expect(replayXp(history)).toBe(liveTotal);
  });
});

describe('retention bonus', () => {
  it('adds a bonus that grows with the prior stage, on strong and partial first-of-day attempts only', () => {
    expect(xpForAttempt('strong', true, 1, { retentionStage: 1 })).toBe(20 + 2);
    expect(xpForAttempt('strong', true, 1, { retentionStage: 3 })).toBe(20 + 6);
    expect(xpForAttempt('strong', true, 1, { retentionStage: 5 })).toBe(20 + 10);
    expect(xpForAttempt('partial', true, 1, { retentionStage: 2 })).toBe(12 + 4);
    expect(xpForAttempt('weak', true, 1, { retentionStage: 4 })).toBe(5);
    expect(xpForAttempt('strong', false, 1, { retentionStage: 4 })).toBe(5); // a same-day repeat earns none
    expect(xpForAttempt('strong', true, 1, {})).toBe(20);
    for (let stage = 1; stage < XP_RETENTION_BONUS_BY_STAGE.length; stage += 1) {
      expect(XP_RETENTION_BONUS_BY_STAGE[stage]).toBeGreaterThan(XP_RETENTION_BONUS_BY_STAGE[stage - 1]);
    }
  });

  it('is earned on a due review in a replayed history, and not on an early or first attempt', () => {
    const first = attempt({ id: 'a', attemptedOn: '2026-08-01', createdAt: '2026-08-01T12:00:00.000Z' });
    const dueReview = attempt({ id: 'b', attemptedOn: '2026-08-04', createdAt: '2026-08-04T12:00:00.000Z' }); // stage 1 reviews 3 days later
    const awards = attemptXpAwards([first, dueReview]);
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(20 + XP_RETENTION_BONUS_BY_STAGE[1]);
    expect(stagesBeforeEach([first, dueReview]).get('b')).toMatchObject({ reviewStage: 1, reviewDue: true });

    // Stage 2 after the second strong attempt, next review in 7 days: attempting the next day is early.
    const early = attempt({ id: 'c', attemptedOn: '2026-08-05', createdAt: '2026-08-05T12:00:00.000Z' });
    expect(stagesBeforeEach([first, dueReview, early]).get('c')).toMatchObject({ reviewStage: 2, reviewDue: false });
    expect(attemptXpAwards([first, dueReview, early]).get('c')).toBe(Math.round(20 * xpStreakMultiplier(2)));
  });

  it('replays the T11 stage rules: a confident first solve starts at stage 2', () => {
    const first = attempt({ id: 'a', attemptedOn: '2026-08-01', perceivedDifficulty: 'easy', createdAt: '2026-08-01T12:00:00.000Z' });
    const review = attempt({ id: 'b', attemptedOn: '2026-08-08', createdAt: '2026-08-08T12:00:00.000Z' });
    expect(stagesBeforeEach([first, review]).get('b')).toMatchObject({ reviewStage: 2, reviewDue: true });
  });
});

describe('comeback bonus', () => {
  const weakRun = (n: number) => Array.from({ length: n }, (_, i) => attempt({
    id: `w${i}`, quality: 'weak', outcome: 'could_not_solve', attemptedOn: `2026-08-0${i + 1}`, createdAt: `2026-08-0${i + 1}T12:00:00.000Z`
  }));

  it('adds a bonus only to a strong attempt', () => {
    expect(xpForAttempt('strong', true, 1, { comeback: true })).toBe(20 + XP_COMEBACK_BONUS);
    expect(xpForAttempt('partial', true, 1, { comeback: true })).toBe(12);
    expect(xpForAttempt('strong', false, 1, { comeback: true })).toBe(5);
  });

  it('is earned by the strong attempt that ends 3+ weak ones, in a replayed history', () => {
    const strong = attempt({ id: 'done', attemptedOn: '2026-08-04', createdAt: '2026-08-04T12:00:00.000Z' });
    const withRun = attemptXpAwards([...weakRun(3), strong]).get('done');
    expect(withRun).toBe(xpForAttempt('strong', true, 4, { comeback: true }));
    // Two weak attempts is not a struggle run.
    const short = attempt({ id: 'done', attemptedOn: '2026-08-03', createdAt: '2026-08-03T12:00:00.000Z' });
    expect(attemptXpAwards([...weakRun(2), short]).get('done')).toBe(xpForAttempt('strong', true, 3, {}));
  });

  it('is paid once: the next strong attempt earns no comeback', () => {
    const rows = [...weakRun(3),
      attempt({ id: 's1', attemptedOn: '2026-08-04', createdAt: '2026-08-04T12:00:00.000Z' }),
      attempt({ id: 's2', attemptedOn: '2026-08-05', createdAt: '2026-08-05T12:00:00.000Z' })];
    expect(stagesBeforeEach(rows).get('s1')?.consecutiveWeak).toBe(3);
    expect(stagesBeforeEach(rows).get('s2')?.consecutiveWeak).toBe(0);
  });
});

describe('consistency multiplier is the better of the daily and weekly streak', () => {
  it('uses whichever tier is higher', () => {
    expect(xpForAttempt('strong', true, 1, { weeklyStreak: 8 })).toBe(30);
    expect(xpForAttempt('strong', true, 14, { weeklyStreak: 0 })).toBe(30);
    expect(xpForAttempt('strong', true, 3, { weeklyStreak: 4 })).toBe(25); // weekly 1.25 beats daily 1.1
    expect(xpForAttempt('strong', true, 7, { weeklyStreak: 2 })).toBe(25); // daily 1.25 beats weekly 1.1
    expect(xpForAttempt('strong', true, 1, { weeklyStreak: 1 })).toBe(20);
  });

  it('lets a steady 3-days-a-week learner reach the top tier, which a daily-only streak never gives them', () => {
    // Monday 2026-08-03: Mon / Wed / Fri for 10 weeks, a new problem each day.
    const history: Attempt[] = [];
    const start = new Date(2026, 7, 3);
    for (let week = 0; week < 10; week += 1) {
      for (const offset of [0, 2, 4]) {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + offset);
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        history.push(attempt({ id: `d${history.length}`, problemId: `p${history.length}`, attemptedOn: key, createdAt: `${key}T12:00:00.000Z` }));
      }
    }
    const awards = attemptXpAwards(history);
    const last = history[history.length - 1];
    expect(awards.get(last.id)).toBe(Math.round(XP_BY_QUALITY.strong * 1.5)); // the ×1.5 ceiling
    // With only the daily streak (1 day at most here) every attempt would have earned the base 20.
    expect(replayXp(history)).toBeGreaterThan(history.length * XP_BY_QUALITY.strong);
    expect(awards.get(history[0].id)).toBe(20); // the first weeks start at ×1.0
  });
});

// A deterministic pseudo-random history that exercises every rule: several problems,
// all three qualities, same-day repeats, long gaps and a backdated attempt.
function randomHistory(count: number, seed: number): Attempt[] {
  let state = seed;
  const next = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const qualities: Attempt['quality'][] = ['strong', 'strong', 'partial', 'weak'];
  const out: Attempt[] = [];
  let day = 0;
  for (let i = 0; i < count; i += 1) {
    day += next() < 0.3 ? 0 : Math.floor(next() * 12);
    const date = new Date(2026, 0, 1 + day);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const backdated = next() < 0.05 ? Math.floor(next() * 5) : 0;
    const attemptedOn = backdated ? (() => { const d = new Date(2026, 0, 1 + Math.max(0, day - backdated)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() : key;
    const quality = qualities[Math.floor(next() * qualities.length)];
    out.push(attempt({
      id: `r${String(i).padStart(4, '0')}`, problemId: `p${Math.floor(next() * 6)}`, attemptedOn, quality,
      outcome: quality === 'weak' ? 'could_not_solve' : quality === 'partial' ? 'solved_with_hint' : 'solved_independently',
      perceivedDifficulty: next() < 0.2 ? 'easy' : 'manageable',
      createdAt: `${key}T12:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`
    }));
  }
  return out;
}

describe('replay equals the live award', () => {
  // saveAttempt reads the full history, including the row it just added, and takes
  // that attempt's entry from `attemptXpAwards`. Awarding attempt N must therefore
  // not depend on any attempt saved after it, or the running total the live path
  // keeps would drift from `replayXp`.
  it.each([1, 2, 3, 4, 5])('summing each attempt\'s award at the moment it was saved matches replayXp (seed %i)', (seed) => {
    const history = randomHistory(150, seed);
    const saved: Attempt[] = [];
    let live = 0;
    for (const next of [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
      saved.push(next);
      live += attemptXpAwards(saved).get(next.id) ?? 0;
    }
    expect(live).toBe(replayXp(history));
  });

  it('does not depend on the order the rows are handed in', () => {
    const history = randomHistory(80, 9);
    expect(replayXp([...history].reverse())).toBe(replayXp(history));
  });
});

describe('the v5 re-replay never lowers XP', () => {
  // The v4 formula: base quality XP, the same-day repeat factor and the daily
  // streak multiplier only. Every v5 change is additive or a max() on top of it.
  function replayV4(attempts: Attempt[]): number {
    const seen = new Set<string>();
    const dates = new Set<string>();
    let xp = 0;
    for (const a of [...attempts].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))) {
      const key = `${a.problemId} ${a.attemptedOn}`;
      const first = !seen.has(key);
      seen.add(key);
      dates.add(a.attemptedOn);
      xp += xpForAttempt(a.quality, first, streakEndingOn(dates, a.attemptedOn));
    }
    return xp;
  }

  it.each([1, 2, 3, 4, 5, 6])('is at least the v4 total (seed %i)', (seed) => {
    const history = randomHistory(200, seed);
    expect(replayXp(history)).toBeGreaterThanOrEqual(replayV4(history));
  });

  it('keeps a stored total that is already higher, and raises a lower one', () => {
    const history = randomHistory(40, 7);
    const replayed = replayXp(history);
    expect(xpAfterReplay(replayed + 500, history)).toBe(replayed + 500);
    expect(xpAfterReplay(0, history)).toBe(replayed);
  });
});

describe('light review replay', () => {
  it('replays a flagged recall exactly like a strong solve, so XP and stages stay reconstructible', () => {
    const row = (id: string, attemptedOn: string, extra: Partial<Attempt> = {}): Attempt => attempt({ id, attemptedOn, createdAt: `${attemptedOn}T12:00:00.000Z`, ...extra });
    const base = [row('a', '2026-08-01'), row('b', '2026-08-04'), row('c', '2026-08-11')];
    const full = [...base, row('e', '2026-08-25'), row('f', '2026-09-24')];
    const light = [...base, row('e', '2026-08-25', { lightReview: true }), row('f', '2026-09-24', { lightReview: true })];
    expect(stagesBeforeEach(light).get('f')?.reviewStage).toBe(4);
    expect([...stagesBeforeEach(light)]).toEqual([...stagesBeforeEach(full)]);
    expect([...attemptXpAwards(light)]).toEqual([...attemptXpAwards(full)]);
  });
});
