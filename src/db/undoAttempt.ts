import { db } from './database';
import { planAttemptUndo, type AttemptUndoSnapshot } from '../services/attemptUndo';

// Reverse one `saveAttempt` (the quick log's 10-second Undo) in a single
// transaction: delete the attempt, restore the progress row and the recommendation
// completion stamps from the snapshot, and rebuild XP with `replayXp`. This is the
// only code that deletes an attempt row; see `services/attemptUndo.ts` for the
// rules. Resolves `true` when it undid, `false` when it refused (the attempt is
// gone or a later attempt for the problem exists) and wrote nothing.
export async function undoAttempt(snapshot: AttemptUndoSnapshot): Promise<boolean> {
  return db.transaction('rw', [db.attempts, db.progress, db.recommendationEvents, db.gamification], async () => {
    const [attempts, events, gamificationNow] = await Promise.all([
      db.attempts.toArray(), db.recommendationEvents.where('problemId').equals(snapshot.problemId).toArray(), db.gamification.get('state')
    ]);
    const plan = planAttemptUndo(snapshot, attempts, events, gamificationNow);
    if (!plan.ok) return false;
    await db.attempts.delete(snapshot.attemptId);
    if (plan.progress) await db.progress.put(plan.progress);
    else await db.progress.delete(snapshot.problemId);
    for (const restore of plan.eventRestores) {
      const event = events.find((row) => row.id === restore.id);
      if (!event) continue;
      // Put the row back without the key when it had none before the save.
      const rest = { ...event };
      delete rest.completedAt;
      await db.recommendationEvents.put(restore.completedAt === undefined ? rest : { ...rest, completedAt: restore.completedAt });
    }
    if (plan.gamification) await db.gamification.put(plan.gamification);
    else await db.gamification.delete('state');
    return true;
  });
}

// Replace the note on an attempt (the quick log's "add a note"). A note changes
// no rule: quality, review stage and XP never read it.
export async function saveAttemptNote(attemptId: string, notes: string): Promise<void> {
  await db.attempts.update(attemptId, { notes: notes.trim() });
}
