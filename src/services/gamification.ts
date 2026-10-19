import type { Attempt, ProblemProgress, Quality } from '../types/models';
import {
  STRUGGLE_THRESHOLD, XP_BY_QUALITY, XP_COMEBACK_BONUS, XP_PER_LEVEL_UNIT, XP_REPEAT_SAME_DAY_MULTIPLIER,
  XP_RETENTION_BONUS_BY_STAGE, xpConsistencyMultiplier
} from './constants';
import { progressAfterAttempt } from './reviews';
import { streakEndingOn, weeklyStreakEndingOn } from './streak';

// Pure XP and level rules. No storage, no Dexie — `db/gamification.ts` owns I/O.
// Everything here is a function of stored `Attempt` rows, so the live award path,
// the Dexie v3/v4/v5 migrations and backup restore agree by construction.

export interface GamificationSnapshot {
  xp: number;
  level: number;
  xpIntoLevel: number;   // XP earned since reaching the current level
  xpForNextLevel: number; // XP span from the current level to the next
}

// What an attempt earned beyond its base quality XP. All of it is replayed from
// the attempt history (see `stagesBeforeEach`), never read from a progress row.
export interface XpExtras {
  // Consecutive calendar weeks with 3+ active days ending on the attempt's date.
  weeklyStreak?: number;
  // Review stage of the problem BEFORE this attempt, when that review was due.
  // Only a strong or partial first-of-day attempt on a stage >= 1 review earns it.
  retentionStage?: number;
  // The strong attempt that ends a run of STRUGGLE_THRESHOLD+ weak attempts.
  comeback?: boolean;
}

// XP for one attempt. `isFirstOfDay` is false when another attempt for the same
// problem already exists on the same calendar day (a reinforcement pass).
// `streakDays` is the grace-free consecutive-active-day count ending on the
// attempt's date (see `streakEndingOn`); with `extras.weeklyStreak` the
// consistency multiplier is the better of the daily and weekly tiers.
//
// The retention and comeback bonuses are added to the base before the repeat
// factor and the multiplier, so they are only ever additive. One `Math.round`
// over the whole product: composing a round per factor would let the live award
// and the `replayXp` fold drift apart by ±1 XP per attempt.
export function xpForAttempt(quality: Quality, isFirstOfDay: boolean, streakDays: number, extras: XpExtras = {}): number {
  let base: number = XP_BY_QUALITY[quality];
  if (isFirstOfDay && quality !== 'weak' && extras.retentionStage !== undefined) {
    base += XP_RETENTION_BONUS_BY_STAGE[Math.min(extras.retentionStage, XP_RETENTION_BONUS_BY_STAGE.length - 1)] ?? 0;
  }
  if (isFirstOfDay && quality === 'strong' && extras.comeback) base += XP_COMEBACK_BONUS;
  const repeatFactor = isFirstOfDay ? 1 : XP_REPEAT_SAME_DAY_MULTIPLIER;
  return Math.round(base * repeatFactor * xpConsistencyMultiplier(streakDays, extras.weeklyStreak ?? 0));
}

// level = floor(sqrt(xp / unit)). Monotonic; level 0 at 0 XP.
export function levelForXp(xp: number): number {
  if (xp <= 0) return 0;
  return Math.floor(Math.sqrt(xp / XP_PER_LEVEL_UNIT));
}

// Total XP at the start of a given level — the inverse of `levelForXp`.
export function xpForLevel(level: number): number {
  return level * level * XP_PER_LEVEL_UNIT;
}

export function snapshotForXp(xp: number): GamificationSnapshot {
  const safeXp = Math.max(0, Math.round(xp));
  const level = levelForXp(safeXp);
  const levelStart = xpForLevel(level);
  const nextLevelStart = xpForLevel(level + 1);
  return {
    xp: safeXp,
    level,
    xpIntoLevel: safeXp - levelStart,
    xpForNextLevel: nextLevelStart - levelStart
  };
}

// The order every replay uses: createdAt, then id, so two attempts sharing a
// timestamp always replay in the order the live path awarded them (it reads rows
// one at a time as they were inserted). Without the id tiebreak, a
// strong-then-weak same-day pair could replay weak-first and total differently.
function inLiveOrder(attempts: Attempt[]): Attempt[] {
  return [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

// What a problem looked like just before one attempt.
export interface PriorState {
  reviewStage: ProblemProgress['reviewStage'];
  // True when the attempt's date is on or after the review date that was scheduled.
  reviewDue: boolean;
  consecutiveWeak: number;
}

// Replay the review stage each attempt started from, by folding the attempts
// through `progressAfterAttempt` exactly as `saveAttempt` does. Every stage rule
// depends only on the attempt sequence (quality, perceived difficulty, dates), so
// this needs no stored progress row — which is what keeps XP reconstructible from
// the `attempts` history alone. Existing progress rows written before a rule
// change are ignored on purpose: the replay is the single definition.
export function stagesBeforeEach(attempts: Attempt[]): Map<string, PriorState> {
  const progress = new Map<string, ProblemProgress>();
  const seenToday = new Set<string>();
  const prior = new Map<string, PriorState>();
  for (const attempt of inLiveOrder(attempts)) {
    const existing = progress.get(attempt.problemId);
    prior.set(attempt.id, {
      reviewStage: existing?.reviewStage ?? 0,
      reviewDue: existing?.nextReviewDate != null && attempt.attemptedOn >= existing.nextReviewDate,
      consecutiveWeak: existing?.consecutiveWeak ?? 0
    });
    const dayKey = `${attempt.problemId} ${attempt.attemptedOn}`;
    const alreadyAttemptedToday = seenToday.has(dayKey);
    seenToday.add(dayKey);
    progress.set(attempt.problemId, {
      ...progressAfterAttempt(existing, attempt.quality, attempt.attemptedOn, attempt.createdAt, alreadyAttemptedToday, new Date(attempt.createdAt), attempt.perceivedDifficulty),
      problemId: attempt.problemId
    });
  }
  return prior;
}

// The XP each attempt earned, by attempt id. An attempt is "first of day" when no
// earlier attempt (by createdAt) exists for the same problem on the same
// `attemptedOn` date. The live path reads the new attempt's entry from this map,
// so it can never disagree with `replayXp`.
export function attemptXpAwards(attempts: Attempt[]): Map<string, number> {
  const priorStates = stagesBeforeEach(attempts);
  const seenByDay = new Set<string>();
  // Active dates accumulate as we fold forward, so the streaks for an attempt are
  // computed against exactly the dates the live path would have seen by the time
  // that attempt was saved. The attempt's own date is added BEFORE its multiplier
  // is read (day 1 of a streak = ×1.0 per the tier table).
  const activeDates = new Set<string>();
  const awards = new Map<string, number>();
  for (const attempt of inLiveOrder(attempts)) {
    const dayKey = `${attempt.problemId} ${attempt.attemptedOn}`;
    const isFirstOfDay = !seenByDay.has(dayKey);
    seenByDay.add(dayKey);
    activeDates.add(attempt.attemptedOn);
    const prior = priorStates.get(attempt.id);
    awards.set(attempt.id, xpForAttempt(attempt.quality, isFirstOfDay, streakEndingOn(activeDates, attempt.attemptedOn), {
      weeklyStreak: weeklyStreakEndingOn(activeDates, attempt.attemptedOn),
      retentionStage: prior && prior.reviewDue && prior.reviewStage >= 1 ? prior.reviewStage : undefined,
      comeback: prior !== undefined && prior.consecutiveWeak >= STRUGGLE_THRESHOLD
    }));
  }
  return awards;
}

// Replay lifetime XP from the full attempt history. Used by the Dexie v3/v4/v5
// upgrades (seed the store for existing users) and backup restore (which always
// rebuilds XP from the attempts).
export function replayXp(attempts: Attempt[]): number {
  let xp = 0;
  for (const award of attemptXpAwards(attempts).values()) xp += award;
  return xp;
}

// XP after a formula change: the replay under the new rules, never below what
// the user already holds. Every bonus is additive or a max(), so the replay is
// already >= the old total; the guard keeps that true for a hand-edited store.
export function xpAfterReplay(storedXp: number, attempts: Attempt[]): number {
  return Math.max(storedXp, replayXp(attempts));
}
