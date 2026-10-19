import { db } from './database';
import type { ProblemList } from '../types/models';

// Changing the set never touches progress, attempts or recommendations: it only
// changes which catalog rows the app shows and recommends.
export async function saveProblemSet(set: ProblemList): Promise<void> {
  await db.settings.put({ key: 'problemSet', value: set });
}
