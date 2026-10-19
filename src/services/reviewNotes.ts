import type { Attempt } from '../types/models';

// The most recent non-empty note per problem — what the user wrote for "next
// time", shown before they re-solve it. Latest by attempt date, then save time.
export function latestNotes(attempts: Attempt[]): Map<string, string> {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (attempt.notes.trim() === '') continue;
    const current = latest.get(attempt.problemId);
    if (!current || attempt.attemptedOn > current.attemptedOn || (attempt.attemptedOn === current.attemptedOn && attempt.createdAt > current.createdAt)) latest.set(attempt.problemId, attempt);
  }
  return new Map([...latest].map(([problemId, attempt]) => [problemId, attempt.notes.trim()]));
}
