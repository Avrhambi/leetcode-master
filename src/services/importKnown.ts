import { IMPORT_MAX_DAYS, IMPORT_MIN_DAYS, IMPORT_REVIEW_STAGE } from './constants';
import type { CatalogProblem, ProblemProgress } from '../types/models';

// "Mark problems you already know": pure rules for the imported progress rows.
// A mark is a progress row and nothing else. There is no Attempt row, so XP
// (replayed from attempts), streaks and badges are untouched, and a removable
// mark is recognisable without a new field: a progress row with no attempts.

// `YYYY-MM-DD` plus whole days, DST-proof (UTC arithmetic on the calendar date).
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export type KnownProblem = Pick<CatalogProblem, 'id' | 'neetcodeOrder'>;

// Next-review date per marked problem. The problems are put in catalog order (so
// the result never depends on the order they were ticked in) and dealt evenly
// across IMPORT_MIN_DAYS..IMPORT_MAX_DAYS days from `today`: per-day counts differ
// by at most one, and a handful of marks still spans the window instead of
// bunching at the start. Earlier catalog problems come due first.
export function spreadReviewDates(problems: KnownProblem[], today: string): Map<string, string> {
  const ordered = [...problems].sort((a, b) => a.neetcodeOrder - b.neetcodeOrder || a.id.localeCompare(b.id));
  const window = IMPORT_MAX_DAYS - IMPORT_MIN_DAYS + 1;
  return new Map(ordered.map((problem, index) => [
    problem.id,
    addDays(today, IMPORT_MIN_DAYS + Math.floor(((index + 0.5) * window) / ordered.length))
  ]));
}

// The problems an import may still mark: those with no progress row. Whatever
// the user has really done always wins, so existing rows are never overwritten.
export function markableProblems<T extends { id: string }>(problems: T[], existingProgressIds: Iterable<string>): T[] {
  const taken = new Set(existingProgressIds);
  return problems.filter((problem) => !taken.has(problem.id));
}

// The progress rows an import writes (rows that already exist are skipped).
export function importedProgressRows(problems: KnownProblem[], existingProgressIds: Iterable<string>, today: string, updatedAt: string): ProblemProgress[] {
  const fresh = markableProblems(problems, existingProgressIds);
  const dates = spreadReviewDates(fresh, today);
  return fresh.map((problem) => ({
    problemId: problem.id,
    status: 'solved',
    reviewStage: IMPORT_REVIEW_STAGE,
    nextReviewDate: dates.get(problem.id) ?? null,
    lastAttemptDate: null,
    lastQuality: null,
    strongAttemptCount: 0,
    consecutiveWeak: 0,
    struggling: false,
    updatedAt
  }));
}

// Ids whose progress row has no attempt behind it: what "Remove imported marks"
// deletes. A problem the user has really attempted keeps its row.
export function removableImportIds(progressIds: Iterable<string>, attemptedIds: Iterable<string>): string[] {
  const attempted = new Set(attemptedIds);
  return [...progressIds].filter((id) => !attempted.has(id));
}

// The marked problems as a set: progress rows with no attempt behind them. Skill
// and the finish forecast read this so an import counts as done, not as untouched.
export function importedIds(progressIds: Iterable<string>, attemptedIds: Iterable<string>): Set<string> {
  return new Set(removableImportIds(progressIds, attemptedIds));
}

// First and last next-review date of a set of rows, for the confirmation line.
export function reviewSpan(rows: Pick<ProblemProgress, 'nextReviewDate'>[]): { first: string; last: string } | null {
  const dates = rows.map((row) => row.nextReviewDate).filter((date): date is string => date !== null).sort();
  return dates.length === 0 ? null : { first: dates[0], last: dates[dates.length - 1] };
}
