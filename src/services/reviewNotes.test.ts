import { describe, expect, it } from 'vitest';
import { latestNotes } from './reviewNotes';
import type { Attempt } from '../types/models';

const attempt = (problemId: string, attemptedOn: string, notes: string, createdAt = `${attemptedOn}T10:00:00.000Z`): Attempt => ({ id: `${problemId}-${createdAt}`, problemId, attemptedOn, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes, quality: 'strong', createdAt });

describe('latest notes', () => {
  it('keeps the most recent non-empty note per problem', () => {
    const notes = latestNotes([
      attempt('a', '2026-07-01', 'two pointers from both ends'),
      attempt('a', '2026-07-05', '  sort first, then sweep  '),
      attempt('a', '2026-07-09', ''),
      attempt('b', '2026-07-02', '   ')
    ]);
    expect(notes.get('a')).toBe('sort first, then sweep');
    expect(notes.has('b')).toBe(false);
  });
  it('breaks a same-day tie by save time, not array order', () => {
    const notes = latestNotes([attempt('a', '2026-07-01', 'later', '2026-07-01T12:00:00.000Z'), attempt('a', '2026-07-01', 'earlier', '2026-07-01T08:00:00.000Z')]);
    expect(notes.get('a')).toBe('later');
  });
});
