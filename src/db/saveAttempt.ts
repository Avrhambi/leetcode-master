import { qualityFor, progressAfterAttempt } from '../services/reviews';
import { openRecommendationsToComplete } from '../services/recommendations';
import { badgesEarned } from '../services/badges';
import { currentStreak, type StreakGraceState } from '../services/streak';
import { STREAK_GRACE_PER_WEEK } from '../services/constants';
import { levelForXp } from '../services/gamification';
import { parseProblemSet, problemsInSet } from '../services/problemSet';
import { awardAttemptXp, readGamification, recordBadges } from './gamification';
import type { Attempt, HelpType, Outcome, PerceivedDifficulty } from '../types/models';
import { db } from './database';

function graceStateFrom(settings: { key: string; value: string }[]): StreakGraceState {
  const byKey = new Map(settings.map((row) => [row.key, row.value]));
  const remaining = Number(byKey.get('streakGraceRemaining'));
  return {
    graceRemaining: Number.isFinite(remaining) ? remaining : STREAK_GRACE_PER_WEEK,
    graceRefreshedOn: byKey.get('streakGraceRefreshedOn') ?? ''
  };
}

export interface AttemptInput { problemId: string; attemptedOn: string; outcome: Outcome; perceivedDifficulty: PerceivedDifficulty; helpType: HelpType | null; durationMinutes: number | null; notes: string; }

export async function saveAttempt(input: AttemptInput): Promise<void> {
  const createdAt = new Date().toISOString();
  const now = new Date();
  const attempt: Attempt = { id: crypto.randomUUID(), ...input, quality: qualityFor(input.outcome, input.perceivedDifficulty), createdAt };
  await db.transaction('rw', [db.attempts, db.progress, db.recommendationEvents, db.gamification, db.problems, db.settings], async () => {
    const existing = await db.progress.get(input.problemId);
    // A prior attempt for this problem on the same calendar day means the review
    // stage was already advanced today; a second pass is reinforcement only.
    const alreadyAttemptedToday = (await db.attempts.where('problemId').equals(input.problemId).and((row) => row.attemptedOn === input.attemptedOn).count()) > 0;
    await db.attempts.add(attempt);
    await db.progress.put({ ...progressAfterAttempt(existing, attempt.quality, input.attemptedOn, createdAt, alreadyAttemptedToday), problemId: input.problemId });

    // Read the full attempt set once (now including the row just added) — it feeds
    // both the XP streak multiplier and the badge/streak checks below.
    const [progress, attempts, problems, settings] = await Promise.all([
      db.progress.toArray(), db.attempts.toArray(), db.problems.toArray(), db.settings.toArray()
    ]);
    const activeDates = new Set(attempts.map((row) => row.attemptedOn));

    // Award XP in the same transaction so it is atomic with the attempt write.
    // `isFirstOfDay` is the negation of the same-day guard above; the grace-free
    // streak ending on `attemptedOn` applies the consistency multiplier. Both
    // inputs are reconstructible from attempt rows, so the v4 replay agrees.
    await awardAttemptXp(attempt.quality, !alreadyAttemptedToday, input.attemptedOn, activeDates, now);

    // Badge check runs after the progress write so predicates see fresh state,
    // and after the XP award so the level badges see the post-attempt level.
    // recordBadges unions into the stored set, so this only ever adds.
    const { streak } = currentStreak(new Set(attempts.map((row) => row.attemptedOn)), graceStateFrom(settings), now);
    const level = levelForXp((await readGamification()).xp);
    await recordBadges(badgesEarned({ progress, attempts, problems: problemsInSet(problems, parseProblemSet(settings.find((row) => row.key === 'problemSet')?.value)), currentStreakDays: streak, level }), now);
    // Recording an attempt from either entry point (daily plan or catalog)
    // completes any matching open daily recommendation for this problem today.
    const openEvents = await db.recommendationEvents.where('problemId').equals(input.problemId).toArray();
    for (const event of openRecommendationsToComplete(openEvents, input.problemId, now)) {
      await db.recommendationEvents.update(event.id, { completedAt: now.toISOString() });
    }
  });
}
