import type { Attempt, ProblemProgress } from '../types/models';
import { attemptXpAwards } from './gamification';

// The "Done for today" summary. Display only: every number is derived from the
// stored attempts and progress rows each time, so an Undo (the attempt row
// disappears) just recomputes it. Dates are passed in as local `YYYY-MM-DD`
// strings; nothing here reads the clock.

export interface DayWrapUpInput {
  today: string;
  // Today's stored plan items, and which of them are logged (the plan's own
  // completion rule, from the recommendation rows).
  planProblemIds: readonly string[];
  completedProblemIds: ReadonlySet<string>;
  attempts: readonly Attempt[];
  progress: readonly ProblemProgress[];
  // Catalog ids (unfiltered). Progress rows outside it are kept on restore but
  // never come due, so they are not counted here either.
  catalogIds: ReadonlySet<string>;
}

export interface DayWrapUp {
  // Plan items logged today (all of them: the summary exists only then).
  itemsDone: number;
  // Every attempt dated today, plan or not.
  attemptsToday: number;
  // Sum of today's logged durations; null when none carried one, so the UI never
  // shows an unmeasured 0.
  minutesLogged: number | null;
  // Attempts today with no duration, to say "N of M timed" when only some were.
  untimedAttempts: number;
  // XP the day's attempts earned: their entries in `attemptXpAwards`, the fold
  // `replayXp` sums and the live award reads, so it equals the XP delta.
  xpEarned: number;
  // Earliest review date after today, or null when none is scheduled.
  nextReviewDate: string | null;
  // Reviews that are due today or earlier and still not done (a time budget or
  // overload kept them out of the plan, or they were skipped for 24 hours).
  reviewsStillDue: number;
}

// The summary, or null while any plan item is still open (or there is no plan).
export function dayWrapUp(input: DayWrapUpInput): DayWrapUp | null {
  const planIds = new Set(input.planProblemIds);
  if (planIds.size === 0 || [...planIds].some((id) => !input.completedProblemIds.has(id))) return null;

  const awards = attemptXpAwards([...input.attempts]);
  const todays = input.attempts.filter((attempt) => attempt.attemptedOn === input.today);
  const timed = todays.filter((attempt) => attempt.durationMinutes !== null);
  const reviewable = input.progress.filter((row) => input.catalogIds.has(row.problemId) && row.nextReviewDate !== null);
  const upcoming = reviewable.map((row) => row.nextReviewDate as string).filter((date) => date > input.today).sort();

  return {
    itemsDone: planIds.size,
    attemptsToday: todays.length,
    minutesLogged: timed.length === 0 ? null : timed.reduce((sum, attempt) => sum + (attempt.durationMinutes ?? 0), 0),
    untimedAttempts: todays.length - timed.length,
    xpEarned: todays.reduce((sum, attempt) => sum + (awards.get(attempt.id) ?? 0), 0),
    nextReviewDate: upcoming[0] ?? null,
    reviewsStillDue: reviewable.filter((row) => (row.nextReviewDate as string) <= input.today).length
  };
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// "Tomorrow (2026-10-21)", "In 3 days (2026-10-23)", or "No reviews scheduled".
export function nextReviewWords(nextReviewDate: string | null, today: string): string {
  if (nextReviewDate === null) return 'No reviews scheduled';
  const days = daysBetween(today, nextReviewDate);
  return days <= 1 ? `Tomorrow (${nextReviewDate})` : `In ${days} days (${nextReviewDate})`;
}

// Minutes logged, said plainly: no durations is "No time logged", never "0 min".
export function minutesWords(wrapUp: Pick<DayWrapUp, 'minutesLogged' | 'untimedAttempts' | 'attemptsToday'>): string {
  if (wrapUp.minutesLogged === null) return 'No time logged';
  const timed = wrapUp.attemptsToday - wrapUp.untimedAttempts;
  return wrapUp.untimedAttempts === 0 ? `${wrapUp.minutesLogged} min` : `${wrapUp.minutesLogged} min (${timed} of ${wrapUp.attemptsToday} attempts timed)`;
}
