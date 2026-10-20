import { db } from './database';
import { replayXp } from '../services/gamification';
import { summarizeRestore, type RestoreSummary } from '../services/backupHealth';
import type { AppSetting, Attempt, BackupPayload, GamificationState, ProblemProgress, RecommendationEvent } from '../types/models';

const outcomes = ['solved_independently', 'solved_with_hint', 'watched_solution', 'could_not_solve'];
const perceivedDifficulties = ['easy', 'manageable', 'hard'];
const helpTypes = ['small_hint', 'pattern_identification', 'pseudocode', 'full_code', 'solution_video'];
const qualities = ['strong', 'partial', 'weak'];
const statuses = ['not_started', 'attempted', 'solved', 'mastered'];
const eventKinds = ['new', 'review'];
const settingKeys = ['catalogVersion', 'streakGraceRemaining', 'streakGraceRefreshedOn', 'lastActiveOn', 'problemSet', 'lastBackupOn', 'sessionMinutes', 'planResetAt', 'weeklyGoalDays', 'interviewDate', 'skipEasies', 'activeMock'];

// Progress fields added in backup formatVersion 2. A v1 payload omits them; they
// are defaulted on restore, matching the Dexie v2 migration backfill.
function withProgressDefaults(row: ProblemProgress): ProblemProgress {
  return { ...row, consecutiveWeak: row.consecutiveWeak ?? 0, struggling: row.struggling ?? false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string { return typeof value === 'string'; }
function isNullableString(value: unknown): value is string | null { return value === null || isString(value); }
function isOneOf(value: unknown, options: string[]): boolean { return isString(value) && options.includes(value); }
function isInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value); }

function isProgress(value: unknown): value is ProblemProgress {
  return isRecord(value) && isString(value.problemId) && isOneOf(value.status, statuses) && isInteger(value.reviewStage) && value.reviewStage >= 0 && value.reviewStage <= 5 && isNullableString(value.nextReviewDate) && isNullableString(value.lastAttemptDate) && (value.lastQuality === null || isOneOf(value.lastQuality, qualities)) && isInteger(value.strongAttemptCount) && value.strongAttemptCount >= 0 && isString(value.updatedAt)
    // formatVersion 2 fields: present and well-typed, or absent (v1 payload).
    && (value.consecutiveWeak === undefined || (isInteger(value.consecutiveWeak) && value.consecutiveWeak >= 0))
    && (value.struggling === undefined || typeof value.struggling === 'boolean');
}

function isNullableCount(value: unknown): boolean { return value === null || (isInteger(value) && value >= 0); }

// The optional `mock` field of a mock-interview attempt (T24).
function isMockResult(value: unknown): boolean {
  return isRecord(value) && isString(value.sessionId) && isNullableCount(value.testsPassed) && isNullableCount(value.testsTotal) && isInteger(value.timeLimitMinutes) && value.timeLimitMinutes >= 1 && typeof value.overTime === 'boolean';
}

function isAttempt(value: unknown): value is Attempt {
  return isRecord(value) && isString(value.id) && isString(value.problemId) && isString(value.attemptedOn) && isOneOf(value.outcome, outcomes) && isOneOf(value.perceivedDifficulty, perceivedDifficulties) && (value.helpType === null || isOneOf(value.helpType, helpTypes)) && (value.durationMinutes === null || (isInteger(value.durationMinutes) && value.durationMinutes >= 1 && value.durationMinutes <= 600)) && isString(value.notes) && isOneOf(value.quality, qualities) && isString(value.createdAt) && (value.lightReview === undefined || typeof value.lightReview === 'boolean') && (value.mock === undefined || isMockResult(value.mock));
}

function isRecommendationEvent(value: unknown): value is RecommendationEvent {
  return isRecord(value) && isString(value.id) && isString(value.problemId) && isOneOf(value.kind, eventKinds) && isString(value.recommendedAt) && isNullableString(value.skippedUntil) && (value.completedAt === undefined || isNullableString(value.completedAt));
}

function isSetting(value: unknown): value is AppSetting {
  return isRecord(value) && isOneOf(value.key, settingKeys) && isString(value.value);
}

// Optional in a v2 payload: a backup taken by a coach-fixes-era build has no
// gamification row, and one taken before the visuals slice has no `badges`.
function isGamificationState(value: unknown): value is GamificationState {
  return isRecord(value) && value.key === 'state' && isInteger(value.xp) && value.xp >= 0 && isString(value.updatedAt)
    && (value.badges === undefined || (Array.isArray(value.badges) && value.badges.every(isString)));
}

export function validateBackupPayload(value: unknown): BackupPayload {
  if (!isRecord(value) || (value.formatVersion !== 1 && value.formatVersion !== 2 && value.formatVersion !== 3) || !isString(value.exportedAt) || !Array.isArray(value.progress) || !Array.isArray(value.attempts) || !Array.isArray(value.recommendationEvents) || !Array.isArray(value.settings) || !value.progress.every(isProgress) || !value.attempts.every(isAttempt) || !value.recommendationEvents.every(isRecommendationEvent) || !value.settings.every((row) => isRecord(row) && isString(row.key) && isString(row.value)) || (value.gamification !== undefined && !isGamificationState(value.gamification)) || (value.catalogVersion !== undefined && !isString(value.catalogVersion)) || (value.appVersion !== undefined && !isString(value.appVersion))) {
    throw new Error('This file is not a valid LeetCode Master backup.');
  }
  // A setting key this build does not know (written by a newer build) is dropped,
  // not rejected, so a newer backup still restores here.
  const payload = value as unknown as BackupPayload;
  return { ...payload, settings: (payload.settings as unknown[]).filter(isSetting) };
}

export async function createBackupPayload(): Promise<BackupPayload> {
  const [progress, attempts, recommendationEvents, settings, gamification] = await Promise.all([
    db.progress.toArray(), db.attempts.toArray(), db.recommendationEvents.toArray(), db.settings.toArray(), db.gamification.get('state')
  ]);
  const catalogVersion = settings.find((row) => row.key === 'catalogVersion')?.value;
  return { formatVersion: 3, ...(catalogVersion ? { catalogVersion } : {}), appVersion: __APP_VERSION__, exportedAt: new Date().toISOString(), progress, attempts, recommendationEvents, settings, ...(gamification ? { gamification } : {}) };
}

// Reading is separate from replacing so the UI can show the file's contents and
// offer "download current data first" before anything is destroyed.
export async function parseBackupFile(file: File): Promise<BackupPayload> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Backup files must be 5 MB or smaller.');
  return validateBackupPayload(JSON.parse(await file.text()));
}

export async function recordBackup(today: string): Promise<void> {
  await db.settings.put({ key: 'lastBackupOn', value: today });
}

// Rows for problem ids missing from the catalog are kept, not rejected: the
// catalog may have changed between builds, and history must survive that.
export async function restoreBackup(payload: BackupPayload): Promise<RestoreSummary> {
  await db.transaction('rw', db.progress, db.attempts, db.recommendationEvents, db.settings, db.gamification, async () => {
    await Promise.all([db.progress.clear(), db.attempts.clear(), db.recommendationEvents.clear(), db.settings.clear(), db.gamification.clear()]);
    await Promise.all([
      db.progress.bulkPut(payload.progress.map(withProgressDefaults)),
      db.attempts.bulkPut(payload.attempts),
      db.recommendationEvents.bulkPut(payload.recommendationEvents),
      db.settings.bulkPut(payload.settings)
    ]);
    // XP is by definition `replayXp(attempts)`, so always rebuild it from the
    // restored attempts rather than trusting the payload's number: a backup
    // exported from an older build carries XP computed under an older formula
    // (e.g. before the streak multiplier), and the Dexie upgrade that would have
    // re-replayed it does not run on a restore. Deriving it here keeps restore
    // self-healing across formula changes. Only the badges come from the payload
    // (they need the streak clock and self-heal on the next attempt anyway); a
    // payload without them restores with none.
    const gamification: GamificationState = {
      key: 'state',
      xp: replayXp(payload.attempts),
      badges: payload.gamification?.badges ?? [],
      updatedAt: new Date().toISOString()
    };
    await db.gamification.put(gamification);
  });
  const catalogIds = new Set((await db.problems.toCollection().primaryKeys()) as string[]);
  return summarizeRestore(payload, catalogIds);
}

export async function resetAndReseed(): Promise<void> {
  const { catalog, CATALOG_VERSION } = await import('../data/catalog');
  await db.transaction('rw', [db.problems, db.progress, db.attempts, db.recommendationEvents, db.settings, db.gamification], async () => {
    await Promise.all([db.problems.clear(), db.progress.clear(), db.attempts.clear(), db.recommendationEvents.clear(), db.settings.clear(), db.gamification.clear()]);
    await db.problems.bulkPut(catalog);
    await db.settings.put({ key: 'catalogVersion', value: CATALOG_VERSION });
  });
}
