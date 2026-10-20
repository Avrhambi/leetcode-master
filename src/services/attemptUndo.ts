import type { Attempt, GamificationState, ProblemProgress, RecommendationEvent } from '../types/models';
import { replayXp } from './gamification';

// Undo for a just-saved attempt (the quick log's 10-second Undo). This is the
// only path in the app that removes an attempt row, so the rules live here, pure
// and unit-tested, and `db/undoAttempt.ts` only reads, calls this and writes.
//
// `saveAttempt` writes five things in one transaction: the attempt row, the
// problem's progress row, completion stamps on matching daily recommendations,
// the XP total and the badge set. It also returns an `AttemptUndoSnapshot` of what
// each held just before, taken inside that same transaction. Undo reverses each:
//
// - attempt: deleted.
// - progress: the snapshot row put back exactly, or the row deleted when the
//   attempt created it.
// - recommendations: each event this save completed gets its previous
//   `completedAt` back (so the plan item is unlogged again). Rows are never
//   deleted: a render still holding the plan would re-persist them.
// - XP: recomputed with `replayXp` from the remaining attempts, as backup
//   restore does. XP is by definition that replay, so this also corrects the
//   streak multiplier of any later attempt that leaned on the removed one.
// - badges: untouched. They are a monotonic union and are never un-earned.

export interface AttemptUndoSnapshot {
  attemptId: string;
  problemId: string;
  createdAt: string;
  // The problem's progress row before the save (`null`: none existed).
  progressBefore: ProblemProgress | null;
  // Recommendations this save completed: their `completedAt` before, and the
  // stamp the save wrote.
  completedEvents: { id: string; completedAtBefore: string | null | undefined; completedAtSet: string }[];
  // The gamification row before the save (`null`: none existed).
  gamificationBefore: GamificationState | null;
}

export type AttemptUndoPlan =
  | { ok: false; reason: 'gone' | 'superseded' }
  | {
    ok: true;
    // Put back (a row) or delete (`null`) the problem's progress row.
    progress: ProblemProgress | null;
    eventRestores: { id: string; completedAt: string | null | undefined }[];
    // Write this row, or delete the gamification row when `null`.
    gamification: GamificationState | null;
  };

// Decide what an undo writes, from the snapshot and the current rows. Refuses
// when the attempt is already gone, or when a later attempt for the same problem
// exists (the snapshot's progress row would erase it): the user logged again in
// the meantime, so the plain history is the only way back.
export function planAttemptUndo(
  snapshot: AttemptUndoSnapshot,
  attempts: Attempt[],
  events: RecommendationEvent[],
  gamificationNow: GamificationState | undefined
): AttemptUndoPlan {
  if (!attempts.some((attempt) => attempt.id === snapshot.attemptId)) return { ok: false, reason: 'gone' };
  if (attempts.some((attempt) => attempt.problemId === snapshot.problemId && attempt.id !== snapshot.attemptId && attempt.createdAt >= snapshot.createdAt)) {
    return { ok: false, reason: 'superseded' };
  }
  const remaining = attempts.filter((attempt) => attempt.id !== snapshot.attemptId);
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const eventRestores = snapshot.completedEvents
    .filter((entry) => eventsById.get(entry.id)?.completedAt === entry.completedAtSet)
    .map((entry) => ({ id: entry.id, completedAt: entry.completedAtBefore }));
  const badges = gamificationNow?.badges ?? snapshot.gamificationBefore?.badges ?? [];
  const xp = replayXp(remaining);
  // No row existed before the save and nothing is left to record: drop it again.
  const gamification: GamificationState | null = snapshot.gamificationBefore === null && xp === 0 && badges.length === 0
    ? null
    : { key: 'state', xp, badges, updatedAt: snapshot.gamificationBefore?.updatedAt ?? gamificationNow?.updatedAt ?? '' };
  return { ok: true, progress: snapshot.progressBefore, eventRestores, gamification };
}
