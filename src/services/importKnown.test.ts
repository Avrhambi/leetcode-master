import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_DAYS, IMPORT_MIN_DAYS, IMPORT_REVIEW_STAGE } from './constants';
import { importedProgressRows, markableProblems, removableImportIds, reviewSpan, spreadReviewDates } from './importKnown';
import { validateBackupPayload } from '../db/backup';
import { dueReviewQueue } from './dailyPlan';
import { replayXp } from './gamification';
import { progressAfterAttempt } from './reviews';
import type { CatalogProblem } from '../types/models';

const TODAY = '2026-10-20';
const problem = (index: number) => ({ id: `p${index}`, neetcodeOrder: index });
const problems = (count: number) => Array.from({ length: count }, (_, index) => problem(index + 1));
const daysFromToday = (date: string) => Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(2026, 9, 20)) / 86_400_000);
const perDay = (dates: Map<string, string>) => {
  const counts = new Map<number, number>();
  for (const date of dates.values()) counts.set(daysFromToday(date), (counts.get(daysFromToday(date)) ?? 0) + 1);
  return counts;
};

describe('spreadReviewDates', () => {
  it('keeps every first review 7 to 21 days out, never earlier or later', () => {
    for (const count of [1, 2, 3, 14, 15, 16, 40, 150, 250]) {
      const days = [...spreadReviewDates(problems(count), TODAY).values()].map(daysFromToday);
      expect(Math.min(...days)).toBeGreaterThanOrEqual(IMPORT_MIN_DAYS);
      expect(Math.max(...days)).toBeLessThanOrEqual(IMPORT_MAX_DAYS);
    }
  });

  it('deals marks evenly: no day holds more than one mark above any other day', () => {
    for (const count of [16, 40, 150, 250]) {
      const counts = [...perDay(spreadReviewDates(problems(count), TODAY)).values()];
      expect(counts.length).toBe(IMPORT_MAX_DAYS - IMPORT_MIN_DAYS + 1);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('puts every mark on a different day when there are 15 or fewer, spanning the window', () => {
    const dates = spreadReviewDates(problems(15), TODAY);
    expect(new Set(dates.values()).size).toBe(15);
    const few = [...spreadReviewDates(problems(3), TODAY).values()].map(daysFromToday);
    expect(new Set(few).size).toBe(3);
    expect(few[2] - few[0]).toBeGreaterThanOrEqual(10);
  });

  it('does not depend on the order the problems were ticked in', () => {
    const forward = spreadReviewDates(problems(30), TODAY);
    const shuffled = spreadReviewDates([...problems(30)].reverse(), TODAY);
    expect([...shuffled.entries()].sort()).toEqual([...forward.entries()].sort());
  });

  it('is deterministic and handles month, year and leap-day rollovers', () => {
    expect(spreadReviewDates(problems(5), TODAY)).toEqual(spreadReviewDates(problems(5), TODAY));
    const lastDay = [...spreadReviewDates(problems(15), '2027-12-31').values()].sort();
    expect(lastDay[0]).toBe('2028-01-07');
    expect(lastDay[14]).toBe('2028-01-21');
    expect(spreadReviewDates([problem(1)], '2028-02-20').get('p1')).toBe('2028-03-05');
  });

  it('returns nothing for no problems', () => {
    expect(spreadReviewDates([], TODAY).size).toBe(0);
  });
});

describe('importedProgressRows', () => {
  const rows = importedProgressRows(problems(20), [], TODAY, '2026-10-20T08:00:00.000Z');

  it('writes solved, stage-2 rows with no attempt history', () => {
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'solved', reviewStage: IMPORT_REVIEW_STAGE, lastAttemptDate: null, lastQuality: null, strongAttemptCount: 0, consecutiveWeak: 0, struggling: false });
      expect(row.nextReviewDate).not.toBeNull();
    }
  });

  it('never overwrites or re-dates a problem that already has a progress row', () => {
    const skipped = importedProgressRows(problems(5), ['p2', 'p4'], TODAY, 'now');
    expect(skipped.map((row) => row.problemId)).toEqual(['p1', 'p3', 'p5']);
    expect(markableProblems(problems(5), ['p2', 'p4']).map((item) => item.id)).toEqual(['p1', 'p3', 'p5']);
  });

  it('leaves XP alone: the rows carry no attempts for replayXp to read', () => {
    expect(replayXp([])).toBe(0);
    expect(rows.every((row) => row.lastAttemptDate === null)).toBe(true);
  });

  it('does not bring a whole import due on one day', () => {
    const catalog = problems(40).map((item) => ({ ...item, title: item.id, slug: item.id, leetcodeUrl: '', neetcodeUrl: '', difficulty: 'easy', topics: ['Arrays'], primaryTopic: 'Arrays', lists: ['nc150'] })) as CatalogProblem[];
    const forty = importedProgressRows(problems(40), [], TODAY, 'now');
    const noon = (offset: number) => new Date(2026, 9, 20 + offset, 12);
    expect(dueReviewQueue(catalog, forty, noon(0))).toHaveLength(0);
    expect(dueReviewQueue(catalog, forty, noon(6))).toHaveLength(0);
    expect(dueReviewQueue(catalog, forty, noon(7)).length).toBeGreaterThan(0);
    expect(dueReviewQueue(catalog, forty, noon(7)).length).toBeLessThanOrEqual(3);
    expect(dueReviewQueue(catalog, forty, noon(14)).length).toBeLessThan(40);
    expect(dueReviewQueue(catalog, forty, noon(21))).toHaveLength(40);
  });

  it('validates as backup progress, so export and restore keep the rows', () => {
    const backup = { formatVersion: 3, exportedAt: '2026-10-20T00:00:00.000Z', progress: rows, attempts: [], recommendationEvents: [], settings: [] };
    expect(validateBackupPayload(backup).progress).toEqual(rows);
  });

  it('lets the first real attempt take over the row like any other progress', () => {
    const imported = { ...rows[0] };
    const after = progressAfterAttempt(imported, 'strong', TODAY, 'now', false, new Date(2026, 9, 20), 'manageable');
    expect(after.reviewStage).toBe(IMPORT_REVIEW_STAGE + 1);
    expect(after.strongAttemptCount).toBe(1);
  });
});

describe('removableImportIds', () => {
  it('returns only progress rows with no attempts', () => {
    expect(removableImportIds(['a', 'b', 'c'], ['b', 'x'])).toEqual(['a', 'c']);
    expect(removableImportIds(['a'], ['a'])).toEqual([]);
    expect(removableImportIds([], ['a'])).toEqual([]);
  });
});

describe('reviewSpan', () => {
  it('gives the first and last review date, or null with none', () => {
    const rows = importedProgressRows(problems(15), [], TODAY, 'now');
    expect(reviewSpan(rows)).toEqual({ first: '2026-10-27', last: '2026-11-10' });
    expect(reviewSpan([])).toBeNull();
  });
});
