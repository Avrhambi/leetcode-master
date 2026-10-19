import { BACKUP_REMINDER_DAYS } from './constants';

// Pure rules around backups: when to nudge, how to word "last backup", and what
// a restore contained. Dates are `YYYY-MM-DD` local strings passed in, never read here.

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function backupFileName(today: string): string {
  return `leetcode-master-backup-${today}.json`;
}

export function lastBackupLabel(lastBackupOn: string | undefined, today: string): string {
  if (!lastBackupOn) return 'Last backup: never';
  const days = Math.max(0, daysBetween(lastBackupOn, today));
  if (days === 0) return 'Last backup: today';
  return `Last backup: ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

// True when there is progress worth protecting and the last backup (or, with none,
// the first attempt) is BACKUP_REMINDER_DAYS or more days old.
export function backupReminderDue(lastBackupOn: string | undefined, attemptDates: string[], today: string): boolean {
  if (attemptDates.length === 0) return false;
  const since = lastBackupOn ?? attemptDates.reduce((earliest, date) => (date < earliest ? date : earliest));
  return daysBetween(since, today) >= BACKUP_REMINDER_DAYS;
}

export interface RestoreSummary {
  attempts: number;
  problems: number;
  // Problem ids in the backup that this build's catalog doesn't contain. Kept, not rejected.
  unknownProblemIds: string[];
}

interface HasProblemId { problemId: string }

export function summarizeRestore(
  payload: { attempts: HasProblemId[]; progress: HasProblemId[]; recommendationEvents: HasProblemId[] },
  catalogIds: Set<string>
): RestoreSummary {
  const attempted = new Set(payload.attempts.map((row) => row.problemId));
  const referenced = new Set([...attempted, ...payload.progress.map((row) => row.problemId), ...payload.recommendationEvents.map((row) => row.problemId)]);
  return {
    attempts: payload.attempts.length,
    problems: attempted.size,
    unknownProblemIds: [...referenced].filter((id) => !catalogIds.has(id)).sort()
  };
}

export function restoreSummaryText(summary: RestoreSummary): string {
  const base = `Restored ${summary.attempts} ${summary.attempts === 1 ? 'attempt' : 'attempts'} across ${summary.problems} ${summary.problems === 1 ? 'problem' : 'problems'}.`;
  const unknown = summary.unknownProblemIds.length;
  return unknown === 0 ? base : `${base} ${unknown} ${unknown === 1 ? 'problem is' : 'problems are'} not in this catalog and ${unknown === 1 ? 'was' : 'were'} kept as is.`;
}
