import { describe, expect, it } from 'vitest';
import { validateBackupPayload } from './backup';
import type { ProblemProgress } from '../types/models';

const v1Progress = {
  problemId: 'two-sum', status: 'solved', reviewStage: 2, nextReviewDate: '2026-07-26',
  lastAttemptDate: '2026-07-19', lastQuality: 'strong', strongAttemptCount: 2, updatedAt: '2026-07-19T00:00:00.000Z'
};
const v2Progress: ProblemProgress = { ...v1Progress, status: 'solved', lastQuality: 'strong', consecutiveWeak: 0, struggling: false } as ProblemProgress;

const base = { exportedAt: '2026-07-19T00:00:00.000Z', attempts: [], recommendationEvents: [], settings: [{ key: 'catalogVersion', value: '1' }] };
const v1Backup = { ...base, formatVersion: 1, progress: [v1Progress] };
const v2Backup = { ...base, formatVersion: 2, progress: [v2Progress] };
const v3Backup = { ...base, formatVersion: 3, catalogVersion: 'neetcode-250-v1', appVersion: '0.0.0', progress: [v2Progress] };

describe('validateBackupPayload', () => {
  it('accepts a version-one backup whose progress omits the v2 fields', () => {
    expect(validateBackupPayload(v1Backup)).toEqual(v1Backup);
  });
  it('accepts a version-two backup that carries the v2 fields', () => {
    expect(validateBackupPayload(v2Backup)).toEqual(v2Backup);
  });
  it('accepts a version-three backup with its informational fields', () => {
    expect(validateBackupPayload(v3Backup)).toEqual(v3Backup);
  });
  it('accepts a version-three backup without them, and rejects non-string ones', () => {
    const bare: Record<string, unknown> = { ...v3Backup };
    delete bare.catalogVersion;
    delete bare.appVersion;
    expect(validateBackupPayload(bare)).toEqual(bare);
    expect(() => validateBackupPayload({ ...v3Backup, appVersion: 3 })).toThrow('valid LeetCode Master backup');
    expect(() => validateBackupPayload({ ...v3Backup, catalogVersion: null })).toThrow('valid LeetCode Master backup');
  });
  it('accepts the lastBackupOn settings key', () => {
    const withBackup = { ...v3Backup, settings: [{ key: 'lastBackupOn', value: '2026-10-19' }] };
    expect(validateBackupPayload(withBackup)).toEqual(withBackup);
  });
  it('keeps rows for problem ids that are not in the catalog', () => {
    const orphan = { ...v2Progress, problemId: 'removed-from-catalog' };
    expect(validateBackupPayload({ ...v3Backup, progress: [orphan] }).progress).toEqual([orphan]);
  });
  it('accepts the new streak settings keys', () => {
    const withStreak = { ...v2Backup, settings: [{ key: 'streakGraceRemaining', value: '1' }, { key: 'streakGraceRefreshedOn', value: '2026-07-19' }] };
    expect(validateBackupPayload(withStreak)).toEqual(withStreak);
  });
  it('accepts the weeklyGoalDays settings key', () => {
    const withGoal = { ...v3Backup, settings: [{ key: 'weeklyGoalDays', value: '4' }] };
    expect(validateBackupPayload(withGoal).settings).toEqual([{ key: 'weeklyGoalDays', value: '4' }]);
  });
  it('accepts the interviewDate and skipEasies settings keys', () => {
    const withGoals = { ...v3Backup, settings: [{ key: 'interviewDate', value: '2026-12-01' }, { key: 'skipEasies', value: '1' }] };
    expect(validateBackupPayload(withGoals).settings).toEqual(withGoals.settings);
  });
  it('accepts the problemSet settings key', () => {
    const withSet = { ...v2Backup, settings: [{ key: 'problemSet', value: 'nc75' }] };
    expect(validateBackupPayload(withSet)).toEqual(withSet);
  });
  it('still accepts a v2 backup that carries no gamification row', () => {
    expect(validateBackupPayload(v2Backup)).toEqual(v2Backup);
    expect('gamification' in validateBackupPayload(v2Backup)).toBe(false);
  });
  it('accepts a v2 backup with a well-formed gamification row (no badges)', () => {
    const withXp = { ...v2Backup, gamification: { key: 'state', xp: 340, updatedAt: '2026-08-01T00:00:00.000Z' } };
    expect(validateBackupPayload(withXp)).toEqual(withXp);
  });
  it('accepts a gamification row that carries a badges array', () => {
    const withBadges = { ...v2Backup, gamification: { key: 'state', xp: 340, badges: ['first-solve', 'century'], updatedAt: '2026-08-01T00:00:00.000Z' } };
    expect(validateBackupPayload(withBadges)).toEqual(withBadges);
  });
  it('rejects a malformed gamification row', () => {
    expect(() => validateBackupPayload({ ...v2Backup, gamification: { key: 'state', xp: -1, updatedAt: 'x' } })).toThrow('valid LeetCode Master backup');
    expect(() => validateBackupPayload({ ...v2Backup, gamification: { key: 'wrong', xp: 10, updatedAt: 'x' } })).toThrow('valid LeetCode Master backup');
    expect(() => validateBackupPayload({ ...v2Backup, gamification: { key: 'state', xp: 10, badges: [1, 2], updatedAt: 'x' } })).toThrow('valid LeetCode Master backup');
  });
  it('rejects invalid nested user data before restore', () => {
    expect(() => validateBackupPayload({ ...v1Backup, attempts: [{ id: 'a' }] })).toThrow('valid LeetCode Master backup');
  });
  it('rejects a malformed v2 field', () => {
    expect(() => validateBackupPayload({ ...v2Backup, progress: [{ ...v2Progress, consecutiveWeak: -1 }] })).toThrow('valid LeetCode Master backup');
  });
  it('rejects an unsupported format version', () => {
    expect(() => validateBackupPayload({ ...v1Backup, formatVersion: 4 })).toThrow('valid LeetCode Master backup');
  });
  it('rejects an unknown settings key', () => {
    expect(() => validateBackupPayload({ ...v1Backup, settings: [{ key: 'nope', value: 'x' }] })).toThrow('valid LeetCode Master backup');
  });
});
