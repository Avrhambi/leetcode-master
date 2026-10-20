import { db } from './database';
import type { ProblemList } from '../types/models';

// Goal-plan settings (T16). Plain `settings` rows: no schema change, and nothing
// here touches progress, attempts or recommendations.

// Saves the interview date and, in the same transaction, the set that fits it
// (`null` leaves the set alone). The user can still pick another set afterwards.
export async function saveInterviewGoal(date: string, set: ProblemList | null): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'interviewDate', value: date });
    if (set !== null) await db.settings.put({ key: 'problemSet', value: set });
  });
}

// Removes the date only; the set stays as it is.
export async function clearInterviewDate(): Promise<void> {
  await db.settings.delete('interviewDate');
}

export async function saveSkipEasies(on: boolean): Promise<void> {
  if (on) await db.settings.put({ key: 'skipEasies', value: '1' });
  else await db.settings.delete('skipEasies');
}
