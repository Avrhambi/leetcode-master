import { db } from './database';

// Saves the "N days a week" goal (`null` clears it). A personal target only: it
// changes nothing about the plan, the streak or XP.
export async function saveWeeklyGoal(days: number | null): Promise<void> {
  if (days === null) await db.settings.delete('weeklyGoalDays');
  else await db.settings.put({ key: 'weeklyGoalDays', value: String(days) });
}
