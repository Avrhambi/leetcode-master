import type { Outcome, PerceivedDifficulty, ProblemProgress, ProgressStatus, Quality } from '../types/models';
import { CONFIDENT_FIRST_SOLVE_STAGE, LATE_RECALL_GAP_RATIO, LATE_RECALL_STAGE_JUMP, LIGHT_REVIEW_MIN_STAGE, STRUGGLE_BACKOFF_DAYS, STRUGGLE_THRESHOLD } from './constants';

export function qualityFor(outcome: Outcome, perceivedDifficulty: PerceivedDifficulty): Quality {
  if (outcome === 'solved_independently') return perceivedDifficulty === 'hard' ? 'partial' : 'strong';
  return outcome === 'solved_with_hint' ? 'partial' : 'weak';
}

export function localDate(offsetDays = 0, from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function reviewDate(stage: ProblemProgress['reviewStage'], today = new Date()): string | null {
  const daysByStage = [1, 3, 7, 14, 30, null] as const;
  const days = daysByStage[stage];
  return days === null ? null : localDate(days, today);
}

// Whole calendar days from `from` to `to` (both `YYYY-MM-DD`).
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// True when a strong recall came at least LATE_RECALL_GAP_RATIO times later than
// the review was scheduled for. The scheduled interval is read from the stored
// dates (`nextReviewDate - lastAttemptDate`), so it also holds for the struggling backoff.
function isLateRecall(existing: ProblemProgress | undefined, attemptedOn: string): boolean {
  if (!existing?.lastAttemptDate || !existing.nextReviewDate) return false;
  const scheduled = daysBetween(existing.lastAttemptDate, existing.nextReviewDate);
  const actual = daysBetween(existing.lastAttemptDate, attemptedOn);
  return scheduled > 0 && actual >= scheduled * LATE_RECALL_GAP_RATIO;
}

// True when the "I recalled the approach" shortcut is offered: a due review at
// stage 3 or 4 (the 14- and 30-day reviews). Earlier stages are too fragile to
// trust a recall without code.
export function lightReviewEligible(progress: ProblemProgress | undefined, today: string): boolean {
  return progress !== undefined && progress.reviewStage >= LIGHT_REVIEW_MIN_STAGE && progress.reviewStage <= 4
    && progress.nextReviewDate !== null && progress.nextReviewDate <= today;
}

// Days until the next review, backing off once a problem is `struggling` so a
// persistent blind spot is not served every single day. `consecutiveWeak` is the
// count *including* this attempt.
function weakReviewDate(consecutiveWeak: number, today: Date): string {
  if (consecutiveWeak < STRUGGLE_THRESHOLD) return localDate(1, today) as string;
  const index = Math.min(consecutiveWeak - STRUGGLE_THRESHOLD, STRUGGLE_BACKOFF_DAYS.length - 1);
  return localDate(STRUGGLE_BACKOFF_DAYS[index], today);
}

// Advance a problem's review state after an attempt.
//
// Stage rules (all functions of the attempt sequence — quality, perceived
// difficulty, dates — so a replay of `attempts` can reproduce them, which T6's
// `stagesBeforeEach` relies on):
//   strong   +1 stage; +2 when recalled at least 2x later than scheduled (late
//            recall is stronger evidence than an on-time one); capped at 5.
//   partial  -1 stage (minimum 1), so a hint at stage 4 returns in 14 days, not 3.
//   weak     reset to 0.
//   first attempt ever, solved independently and felt easy: starts at stage 2.
//   light review (recalled the approach, no re-solve): stored as a strong attempt
//            with `lightReview: true`, so it advances exactly like a full solve; the
//            flag only records what the UI offered and how long it took.
// Existing progress rows are not rewritten; the rules apply from each problem's next attempt.
//
// `alreadyAttemptedToday` is true when an attempt for this problem already exists
// on `attemptedOn` (any entry point — daily plan or catalog). In that case the
// spaced-repetition position (`reviewStage`, `nextReviewDate`) is frozen so a
// second same-day pass is reinforcement, not accelerated promotion — but the
// softer signals (`lastQuality`, `consecutiveWeak`, `struggling`, counts) still
// move. This needs no stored "last advanced on" column and stays correct under
// out-of-order backdated attempts.
export function progressAfterAttempt(
  existing: ProblemProgress | undefined,
  quality: Quality,
  attemptedOn: string,
  updatedAt: string,
  alreadyAttemptedToday = false,
  today = new Date(),
  perceivedDifficulty: PerceivedDifficulty | null = null
): ProblemProgress {
  const previousStage = existing?.reviewStage ?? 0;
  const consecutiveWeak = quality === 'weak' ? (existing?.consecutiveWeak ?? 0) + 1 : 0;
  const struggling = quality === 'strong' ? false : consecutiveWeak >= STRUGGLE_THRESHOLD || (existing?.struggling ?? false);

  const firstAttempt = !existing || (existing.lastQuality === null && existing.lastAttemptDate === null);
  const strongJump = firstAttempt && perceivedDifficulty === 'easy'
    ? CONFIDENT_FIRST_SOLVE_STAGE
    : previousStage + (isLateRecall(existing, attemptedOn) ? LATE_RECALL_STAGE_JUMP : 1);
  const advancedStage = (quality === 'strong' ? Math.min(strongJump, 5) : quality === 'partial' ? Math.max(previousStage - 1, 1) : 0) as ProblemProgress['reviewStage'];
  const reviewStage = alreadyAttemptedToday ? previousStage : advancedStage;
  const nextReviewDate = alreadyAttemptedToday
    ? (existing?.nextReviewDate ?? null)
    : quality === 'weak'
      ? weakReviewDate(consecutiveWeak, today)
      : reviewDate(reviewStage, today);

  // Freeze `status` with the rest of the spaced-repetition position: a second
  // same-day pass must not flip a scheduled review back to 'attempted' (which
  // would make it eligible as a fresh recommendation while still due for review).
  const status: ProgressStatus = alreadyAttemptedToday && existing
    ? existing.status
    : reviewStage === 5
      ? 'mastered'
      : quality === 'weak'
        ? 'attempted'
        : 'solved';

  return {
    problemId: existing?.problemId ?? '',
    status,
    reviewStage,
    nextReviewDate,
    lastAttemptDate: attemptedOn,
    lastQuality: quality,
    strongAttemptCount: (existing?.strongAttemptCount ?? 0) + (quality === 'strong' ? 1 : 0),
    consecutiveWeak,
    struggling,
    updatedAt
  };
}
