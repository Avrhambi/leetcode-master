import { db } from './database';
import { saveAttempt } from './saveAttempt';
import { localDate } from '../services/reviews';
import { mockAttemptFields, type ActiveMock, type MockProblemReport } from '../services/mockInterview';

// Mock interviews (T24). The running mock is a plain `activeMock` settings row, so
// a reload or a trip to NeetCode keeps the clock; its results are ordinary
// attempts saved through `saveAttempt`.

export async function startMock(problemIds: string[], minutes: number, now = new Date()): Promise<ActiveMock> {
  const mock: ActiveMock = { id: crypto.randomUUID(), startedAt: now.toISOString(), minutes, problemIds };
  await db.settings.put({ key: 'activeMock', value: JSON.stringify(mock) });
  return mock;
}

export async function cancelMock(): Promise<void> {
  await db.settings.delete('activeMock');
}

// Saves one attempt per reported problem and clears the running mock, all in one
// transaction: either the whole mock is recorded or none of it is. Each attempt
// goes through `saveAttempt` (its own transaction joins this one), so progress,
// recommendation stamps, XP and badges follow the usual rules.
export async function finishMock(mock: ActiveMock, reports: MockProblemReport[], overTime: boolean): Promise<void> {
  await db.transaction('rw', [db.attempts, db.progress, db.recommendationEvents, db.gamification, db.problems, db.settings], async () => {
    for (const report of reports) {
      const fields = mockAttemptFields(report, mock.id, mock.minutes, overTime);
      await saveAttempt({ problemId: report.problemId, attemptedOn: localDate(), durationMinutes: null, notes: '', ...fields });
    }
    await db.settings.delete('activeMock');
  });
}
