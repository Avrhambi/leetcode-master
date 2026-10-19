import Dexie, { type EntityTable } from 'dexie';
import type { AppSetting, Attempt, CatalogProblem, GamificationState, ProblemProgress, RecommendationEvent } from '../types/models';
import { replayXp, xpAfterReplay } from '../services/gamification';

// The database name is a storage key, not branding: renaming it would orphan every user's data.
export const db = new Dexie('pattern-pilot') as Dexie & {
  problems: EntityTable<CatalogProblem, 'id'>;
  progress: EntityTable<ProblemProgress, 'problemId'>;
  attempts: EntityTable<Attempt, 'id'>;
  recommendationEvents: EntityTable<RecommendationEvent, 'id'>;
  settings: EntityTable<AppSetting, 'key'>;
  gamification: EntityTable<GamificationState, 'key'>;
};

const stores = {
  problems: '&id, slug, neetcodeOrder, primaryTopic, difficulty',
  progress: '&problemId, status, nextReviewDate, lastAttemptDate',
  attempts: '&id, problemId, attemptedOn, createdAt',
  recommendationEvents: '&id, problemId, kind, recommendedAt, skippedUntil',
  settings: '&key'
};

const storesV3 = { ...stores, gamification: '&key' };

db.version(1).stores(stores);

// v2: `consecutiveWeak` / `struggling` added to progress for the struggling-problem
// de-escalation. No index changes, so no store rebuild. Idempotent — guards on
// field presence.
//
// The streak-cadence settings (`streakGraceRemaining`, `streakGraceRefreshedOn`,
// `lastActiveOn`) are NOT seeded here and are currently not written — the
// dashboard reader defaults when they are absent, so a reset or a v1 restore
// (neither of which re-runs this upgrade) leaves the streak working, not broken.
db.version(2).stores(stores).upgrade(async (tx) => {
  await tx.table<ProblemProgress>('progress').toCollection().modify((row) => {
    if (typeof row.consecutiveWeak !== 'number') row.consecutiveWeak = 0;
    if (typeof row.struggling !== 'boolean') row.struggling = false;
  });
});

// v3: adds the single-row `gamification` store and seeds it by replaying lifetime
// XP from the full `attempts` history, so a returning user is not level 0.
//
// This must be its own version — Dexie never re-runs a `version(2)` upgrade for a
// user who already opened a v2 build, so the replay could not live there. A fresh
// install is created directly at v3 and skips this callback entirely, hence the
// gamification reader defaults to `{ xp: 0 }` when the row is absent.
db.version(3).stores(storesV3).upgrade(async (tx) => {
  const attempts = await tx.table<Attempt>('attempts').toArray();
  await tx.table<GamificationState>('gamification').put({
    key: 'state',
    xp: replayXp(attempts),
    updatedAt: new Date().toISOString()
  });
});

// v4: the XP formula gains a streak-consistency multiplier (see
// services/constants.ts). Stored lifetime XP no longer equals
// `replayXp(attempts)` for anyone who practised under v3, so re-replay it with
// the new formula. This is a one-time retroactive XP *increase* — a possible
// level bump, never a loss. A fresh install is created at v4 and skips this.
// `replayXp` still reads only attempt rows, so backup restore's fallback call
// (backup.ts) picks up the new formula for free.
db.version(4).stores(storesV3).upgrade(async (tx) => {
  const attempts = await tx.table<Attempt>('attempts').toArray();
  const row = await tx.table<GamificationState>('gamification').get('state');
  await tx.table<GamificationState>('gamification').put({
    key: 'state',
    xp: replayXp(attempts),
    badges: row?.badges ?? [],
    updatedAt: new Date().toISOString()
  });
});

// v5: the XP formula gains a retention bonus, a comeback bonus and a weekly-streak
// multiplier (services/constants.ts), and the badge set grows. Re-replay XP with
// the new formula: every change is additive or a max(), so this is a one-time
// retroactive XP *increase* (a possible level bump) and `xpAfterReplay` never
// lets it fall below the stored total. The new badges are not backfilled here;
// they arrive on the next saved attempt (the earned set is a monotonic union, so
// nothing already earned changes). A fresh install is created at v5 and skips
// this. `replayXp` still reads only attempt rows, so backup restore's fallback
// call (backup.ts) picks up the new formula for free.
db.version(5).stores(storesV3).upgrade(async (tx) => {
  const attempts = await tx.table<Attempt>('attempts').toArray();
  const row = await tx.table<GamificationState>('gamification').get('state');
  await tx.table<GamificationState>('gamification').put({
    key: 'state',
    xp: xpAfterReplay(row?.xp ?? 0, attempts),
    badges: row?.badges ?? [],
    updatedAt: new Date().toISOString()
  });
});
