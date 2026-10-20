import { db } from './database';
import { importedProgressRows, reviewSpan, removableImportIds, type KnownProblem } from '../services/importKnown';

export interface ImportResult { written: number; first: string | null; last: string | null }

// Marks problems as already known: progress rows only (no attempts, so no XP,
// streak or badges), all in one transaction. The existing-row check runs inside
// it, so a row written meanwhile is never overwritten.
export async function importKnownProblems(problems: KnownProblem[], today: string): Promise<ImportResult> {
  return db.transaction('rw', db.progress, async () => {
    const existing = (await db.progress.toCollection().primaryKeys()) as string[];
    const rows = importedProgressRows(problems, existing, today, new Date().toISOString());
    await db.progress.bulkAdd(rows);
    const span = reviewSpan(rows);
    return { written: rows.length, first: span?.first ?? null, last: span?.last ?? null };
  });
}

// Undo: deletes progress rows that have no attempts. A problem attempted since
// the import keeps its row. Returns how many marks were removed.
export async function removeImportedMarks(): Promise<number> {
  return db.transaction('rw', db.progress, db.attempts, async () => {
    const progressIds = (await db.progress.toCollection().primaryKeys()) as string[];
    const attemptedIds = (await db.attempts.orderBy('problemId').uniqueKeys()) as string[];
    const ids = removableImportIds(progressIds, attemptedIds);
    await db.progress.bulkDelete(ids);
    return ids.length;
  });
}
