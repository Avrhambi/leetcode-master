import { db } from './database';
import type { ProblemList } from '../types/models';

// The first-run welcome (T25) ends by storing the chosen list and marking the
// welcome as seen, together, so a reload never shows it twice or loses the pick.
export async function finishOnboarding(set: ProblemList): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'problemSet', value: set });
    await db.settings.put({ key: 'onboardingDone', value: '1' });
  });
}
