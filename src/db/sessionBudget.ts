import { db } from './database';
import type { SessionBudget } from '../services/sessionTime';

// Saves the time budget (`null` clears it) and re-plans the rest of today by
// stamping `planResetAt`: the plan then ignores today's recommendations made
// before that moment unless they were logged (see `selectDailyPlan`). Nothing is
// deleted, so a render still holding the old plan has nothing to write back.
export async function saveSessionBudget(minutes: SessionBudget | null, now = new Date()): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    if (minutes === null) await db.settings.delete('sessionMinutes');
    else await db.settings.put({ key: 'sessionMinutes', value: String(minutes) });
    await db.settings.put({ key: 'planResetAt', value: now.toISOString() });
  });
}
