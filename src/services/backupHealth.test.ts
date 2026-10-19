import { describe, expect, it } from 'vitest';
import { backupFileName, backupReminderDue, lastBackupLabel, restoreSummaryText, summarizeRestore } from './backupHealth';

describe('backupFileName', () => {
  it('carries the date', () => expect(backupFileName('2026-10-19')).toBe('leetcode-master-backup-2026-10-19.json'));
});

describe('lastBackupLabel', () => {
  it('says never, today, singular and plural days', () => {
    expect(lastBackupLabel(undefined, '2026-10-19')).toBe('Last backup: never');
    expect(lastBackupLabel('2026-10-19', '2026-10-19')).toBe('Last backup: today');
    expect(lastBackupLabel('2026-10-18', '2026-10-19')).toBe('Last backup: 1 day ago');
    expect(lastBackupLabel('2026-10-05', '2026-10-19')).toBe('Last backup: 14 days ago');
  });
  it('never goes negative for a clock-skewed date', () => expect(lastBackupLabel('2026-10-25', '2026-10-19')).toBe('Last backup: today'));
});

describe('backupReminderDue', () => {
  it('stays quiet with no progress', () => expect(backupReminderDue(undefined, [], '2026-10-19')).toBe(false));
  it('fires at exactly 14 days since the last backup, not before', () => {
    expect(backupReminderDue('2026-10-06', ['2026-09-01'], '2026-10-19')).toBe(false);
    expect(backupReminderDue('2026-10-05', ['2026-09-01'], '2026-10-19')).toBe(true);
  });
  it('with no backup, counts from the first attempt', () => {
    expect(backupReminderDue(undefined, ['2026-10-10', '2026-10-18'], '2026-10-19')).toBe(false);
    expect(backupReminderDue(undefined, ['2026-10-18', '2026-10-05'], '2026-10-19')).toBe(true);
  });
  it('a fresh backup silences it', () => expect(backupReminderDue('2026-10-19', ['2026-01-01'], '2026-10-19')).toBe(false));
});

describe('summarizeRestore', () => {
  const rows = (...ids: string[]) => ids.map((problemId) => ({ problemId }));
  const catalog = new Set(['two-sum', 'valid-anagram']);
  it('counts attempts and distinct attempted problems', () => {
    const summary = summarizeRestore({ attempts: rows('two-sum', 'two-sum', 'valid-anagram'), progress: rows('two-sum', 'valid-anagram'), recommendationEvents: [] }, catalog);
    expect(summary).toEqual({ attempts: 3, problems: 2, unknownProblemIds: [] });
    expect(restoreSummaryText(summary)).toBe('Restored 3 attempts across 2 problems.');
  });
  it('reports ids outside the catalog from any table, once each', () => {
    const summary = summarizeRestore({ attempts: rows('two-sum', 'gone-a'), progress: rows('gone-a', 'gone-b'), recommendationEvents: rows('gone-b') }, catalog);
    expect(summary.unknownProblemIds).toEqual(['gone-a', 'gone-b']);
    expect(restoreSummaryText(summary)).toContain('2 problems are not in this catalog');
  });
  it('words the singular case', () => {
    expect(restoreSummaryText({ attempts: 1, problems: 1, unknownProblemIds: ['x'] })).toBe('Restored 1 attempt across 1 problem. 1 problem is not in this catalog and was kept as is.');
  });
});
