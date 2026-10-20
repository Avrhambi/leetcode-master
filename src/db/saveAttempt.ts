import { localDate, qualityFor, progressAfterAttempt } from '../services/reviews';
import { openRecommendationsToComplete } from '../services/recommendations';
import type { AttemptUndoSnapshot } from '../services/attemptUndo';
import { badgesEarned } from '../services/badges';
import { currentStreak, weeklyStreakEndingOn, type StreakGraceState } from '../services/streak';
import { STREAK_GRACE_PER_WEEK } from '../services/constants';
import { levelForXp } from '../services/gamification';
import { parseProblemSet, problemsInSet } from '../services/problemSet';
import { parseSkipEasies } from '../services/goalPlan';
import { awardAttemptXp, readGamification, recordBadges } from './gamification';
import type { Attempt, HelpType, MockResult, Outcome, PerceivedDifficulty } from '../types/models';
import { db } from './database';

function graceStateFrom(settings: { key: string; value: string }[]): StreakGraceState {
  const byKey = new Map(settings.map((row) => [row.key, row.value]));
  const remaining = Number(byKey.get('streakGraceRemaining'));
  return {
    graceRemaining: Number.isFinite(remaining) ? remaining : STREAK_GRACE_PER_WEEK,
    graceRefreshedOn: byKey.get('streakGraceRefreshedOn') ?? ''
  };
}

export interface AttemptInput { problemId: string; attemptedOn: string; outcome: Outcome; perceivedDifficulty: PerceivedDifficulty; helpType: HelpType | null; durationMinutes: number | null; notes: string; lightReview?: boolean; mock?: MockResult; }

// Returns what `undoAttempt` needs to reverse this save (the quick log's Undo):
// the rows this transaction replaced, read inside it before they were written.
// Every other caller ignores it.
export async function saveAttempt(input: AttemptInput): Promise<AttemptUndoSnapshot> {
  const createdAt = new Date().toISOString();
  const now = new Date();
  const attempt: Attempt = { id: crypto.randomUUID(), ...input, quality: qualityFor(input.outcome, input.perceivedDifficulty), createdAt };
  return db.transaction('rw', [db.attempts, db.progress, db.recommendationEvents, db.gamification, db.problems, db.settings], async () => {
    const existing = await db.progress.get(input.problemId);
    const gamificationBefore = (await db.gamification.get('state')) ?? null;
    // A prior attempt for this problem on the same calendar day means the review
    // stage was already advanced today; a second pass is reinforcement only.
    const alreadyAttemptedToday = (await db.attempts.where('problemId').equals(input.problemId).and((row) => row.attemptedOn === input.attemptedOn).count()) > 0;
    await db.attempts.add(attempt);
    await db.progress.put({ ...progressAfterAttempt(existing, attempt.quality, input.attemptedOn, createdAt, alreadyAttemptedToday, now, input.perceivedDifficulty), problemId: input.problemId });

    // Read the full attempt set once (now including the row just added) — it feeds
    // both the XP streak multiplier and the badge/streak checks below.
    const [progress, attempts, problems, settings] = await Promise.all([
      db.progress.toArray(), db.attempts.toArray(), db.problems.toArray(), db.settings.toArray()
    ]);

    // Award XP in the same transaction so it is atomic with the attempt write. The
    // award is replayed from the attempt rows (see `awardAttemptXp`), so it agrees
    // with `replayXp` by construction.
    await awardAttemptXp(attempt.id, attempts, now);

    // Badge check runs after the progress write so predicates see fresh state,
    // and after the XP award so the level badges see the post-attempt level.
    // recordBadges unions into the stored set, so this only ever adds.
    const activeDates = new Set(attempts.map((row) => row.attemptedOn));
    const { streak } = currentStreak(activeDates, graceStateFrom(settings), now);
    const weeklyStreakWeeks = weeklyStreakEndingOn(activeDates, localDate(0, now));
    const level = levelForXp((await readGamification()).xp);
    const problemSet = parseProblemSet(settings.find((row) => row.key === 'problemSet')?.value);
    await recordBadges(badgesEarned({ progress, attempts, problems: problemsInSet(problems, problemSet, parseSkipEasies(settings.find((row) => row.key === 'skipEasies')?.value)), allProblems: problems, problemSet, currentStreakDays: streak, weeklyStreakWeeks, level, today: localDate(0, now) }), now);
    // Recording an attempt from either entry point (daily plan or catalog)
    // completes any matching open daily recommendation for this problem today.
    const openEvents = await db.recommendationEvents.where('problemId').equals(input.problemId).toArray();
    const completedEvents: AttemptUndoSnapshot['completedEvents'] = [];
    for (const event of openRecommendationsToComplete(openEvents, input.problemId, now)) {
      await db.recommendationEvents.update(event.id, { completedAt: now.toISOString() });
      completedEvents.push({ id: event.id, completedAtBefore: event.completedAt, completedAtSet: now.toISOString() });
    }
    return { attemptId: attempt.id, problemId: input.problemId, createdAt, progressBefore: existing ?? null, completedEvents, gamificationBefore };
  });
}
