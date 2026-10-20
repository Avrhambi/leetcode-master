import { describe, expect, it } from 'vitest';
import { planAttemptUndo, type AttemptUndoSnapshot } from './attemptUndo';
import { attemptXpAwards, replayXp } from './gamification';
import { openRecommendationsToComplete } from './recommendations';
import { progressAfterAttempt, qualityFor } from './reviews';
import { quickLogInput, QUICK_LOG_CHOICES } from './quickLog';
import type { Attempt, GamificationState, ProblemProgress, RecommendationEvent } from '../types/models';

// An in-memory stand-in for the five tables `saveAttempt` writes. `save` mirrors
// saveAttempt's writes with the same pure functions; `undo` applies what
// `planAttemptUndo` decides, as `db/undoAttempt.ts` does. Vitest has no
// IndexedDB, so the Dexie wiring itself is checked in a browser; this proves the
// decision logic restores every table exactly.
interface Store { attempts: Attempt[]; progress: Map<string, ProblemProgress>; events: RecommendationEvent[]; gamification: GamificationState | undefined; }

const clone = <T,>(value: T): T => structuredClone(value);

type SaveInput = { problemId: string; attemptedOn: string; outcome: Attempt['outcome']; perceivedDifficulty: Attempt['perceivedDifficulty']; helpType: Attempt['helpType'] };

function save(store: Store, input: SaveInput, createdAt: string): AttemptUndoSnapshot {
  const now = new Date(createdAt);
  const attempt: Attempt = { id: `a-${store.attempts.length + 1}-${createdAt}`, ...input, durationMinutes: null, notes: '', quality: qualityFor(input.outcome, input.perceivedDifficulty), createdAt };
  const existing = store.progress.get(input.problemId);
  const gamificationBefore = store.gamification ? clone(store.gamification) : null;
  const alreadyToday = store.attempts.some((row) => row.problemId === input.problemId && row.attemptedOn === input.attemptedOn);
  store.attempts.push(attempt);
  store.progress.set(input.problemId, { ...progressAfterAttempt(existing, attempt.quality, input.attemptedOn, createdAt, alreadyToday, now, input.perceivedDifficulty), problemId: input.problemId });
  store.gamification = {
    key: 'state',
    xp: (store.gamification?.xp ?? 0) + (attemptXpAwards(store.attempts).get(attempt.id) ?? 0),
    badges: store.gamification?.badges ?? [],
    updatedAt: createdAt
  };
  const completedEvents: AttemptUndoSnapshot['completedEvents'] = [];
  for (const event of openRecommendationsToComplete(store.events, input.problemId, now)) {
    completedEvents.push({ id: event.id, completedAtBefore: event.completedAt, completedAtSet: now.toISOString() });
    event.completedAt = now.toISOString();
  }
  return { attemptId: attempt.id, problemId: input.problemId, createdAt, progressBefore: existing ? clone(existing) : null, completedEvents, gamificationBefore };
}

function undo(store: Store, snapshot: AttemptUndoSnapshot): boolean {
  const plan = planAttemptUndo(snapshot, store.attempts, store.events, store.gamification);
  if (!plan.ok) return false;
  store.attempts = store.attempts.filter((row) => row.id !== snapshot.attemptId);
  if (plan.progress) store.progress.set(snapshot.problemId, plan.progress);
  else store.progress.delete(snapshot.problemId);
  for (const restore of plan.eventRestores) {
    const index = store.events.findIndex((row) => row.id === restore.id);
    const rest = { ...store.events[index] };
    delete rest.completedAt;
    store.events[index] = restore.completedAt === undefined ? rest : { ...rest, completedAt: restore.completedAt };
  }
  store.gamification = plan.gamification ?? undefined;
  return true;
}

const emptyStore = (): Store => ({ attempts: [], progress: new Map(), events: [], gamification: undefined });
const copy = (store: Store): Store => clone(store);
const event = (id: string, problemId: string, over: Partial<RecommendationEvent> = {}): RecommendationEvent => ({ id, problemId, kind: 'new', recommendedAt: '2026-10-20T06:00:00.000Z', skippedUntil: null, completedAt: null, ...over });
const solved = (problemId: string, attemptedOn: string): SaveInput => ({ problemId, attemptedOn, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null });

// A believable history: three days of practice on two problems.
function history(): Store {
  const store = emptyStore();
  save(store, solved('p1', '2026-10-17'), '2026-10-17T09:00:00.000Z');
  save(store, solved('p2', '2026-10-18'), '2026-10-18T09:00:00.000Z');
  save(store, { ...solved('p1', '2026-10-19'), outcome: 'could_not_solve' }, '2026-10-19T09:00:00.000Z');
  return store;
}

describe('planAttemptUndo', () => {
  it('restores every table exactly after the first attempt on a new problem', () => {
    const store = history();
    store.events = [event('e1', 'p3')];
    const before = copy(store);
    const snapshot = save(store, solved('p3', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    expect(store.progress.has('p3')).toBe(true);
    expect(store.events[0].completedAt).not.toBeNull();
    expect(undo(store, snapshot)).toBe(true);
    expect(store).toEqual(before);
  });

  it.each(QUICK_LOG_CHOICES)('restores every table exactly after a %s quick log on a review', (choice) => {
    const store = history();
    store.events = [event('e1', 'p1', { kind: 'review' }), event('e2', 'p2')];
    const before = copy(store);
    const input = quickLogInput(choice, { problemId: 'p1', attemptedOn: '2026-10-20', timerMinutes: 12 });
    const snapshot = save(store, input, '2026-10-20T09:00:00.000Z');
    expect(store.attempts).toHaveLength(before.attempts.length + 1);
    expect(undo(store, snapshot)).toBe(true);
    expect(store).toEqual(before);
    expect(store.gamification?.xp).toBe(replayXp(store.attempts));
  });

  it('restores a second same-day pass (reinforcement) exactly', () => {
    const store = history();
    save(store, solved('p1', '2026-10-20'), '2026-10-20T08:00:00.000Z');
    const before = copy(store);
    const snapshot = save(store, { ...solved('p1', '2026-10-20'), outcome: 'solved_with_hint', helpType: 'small_hint' }, '2026-10-20T09:00:00.000Z');
    expect(undo(store, snapshot)).toBe(true);
    expect(store).toEqual(before);
  });

  it('puts back a completion stamp that was absent rather than null', () => {
    const store = history();
    const legacy: RecommendationEvent = { id: 'e1', problemId: 'p3', kind: 'new', recommendedAt: '2026-10-20T06:00:00.000Z', skippedUntil: null };
    store.events = [clone(legacy)];
    const before = copy(store);
    const snapshot = save(store, solved('p3', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    expect(undo(store, snapshot)).toBe(true);
    expect(store.events[0]).toEqual(legacy);
    expect('completedAt' in store.events[0]).toBe(false);
    expect(store).toEqual(before);
  });

  it('drops the gamification row when the undone attempt was the very first', () => {
    const store = emptyStore();
    const snapshot = save(store, solved('p1', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    expect(store.gamification?.xp).toBeGreaterThan(0);
    expect(undo(store, snapshot)).toBe(true);
    expect(store).toEqual(emptyStore());
  });

  it('never un-earns a badge, and keeps the XP equal to the replay of what remains', () => {
    const store = history();
    store.gamification = { ...store.gamification!, badges: ['first-solve'] };
    const snapshot = save(store, solved('p3', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    store.gamification = { ...store.gamification!, badges: ['first-solve', 'streak-3'] }; // earned by this save
    expect(undo(store, snapshot)).toBe(true);
    expect(store.gamification?.badges).toEqual(['first-solve', 'streak-3']);
    expect(store.gamification?.xp).toBe(replayXp(store.attempts));
  });

  it('leaves a completion stamp alone when something else overwrote it', () => {
    const store = history();
    store.events = [event('e1', 'p3')];
    const snapshot = save(store, solved('p3', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    store.events[0].completedAt = '2026-10-20T09:30:00.000Z';
    const plan = planAttemptUndo(snapshot, store.attempts, store.events, store.gamification);
    expect(plan).toMatchObject({ ok: true, eventRestores: [] });
  });

  it('refuses, and writes nothing, when the attempt is already gone', () => {
    const store = history();
    const snapshot = save(store, solved('p3', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    expect(undo(store, snapshot)).toBe(true);
    const after = copy(store);
    expect(planAttemptUndo(snapshot, store.attempts, store.events, store.gamification)).toEqual({ ok: false, reason: 'gone' });
    expect(undo(store, snapshot)).toBe(false);
    expect(store).toEqual(after);
  });

  it('refuses when a later attempt for the same problem exists', () => {
    const store = history();
    const snapshot = save(store, solved('p1', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    save(store, { ...solved('p1', '2026-10-20'), outcome: 'could_not_solve' }, '2026-10-20T09:00:05.000Z');
    const after = copy(store);
    expect(planAttemptUndo(snapshot, store.attempts, store.events, store.gamification)).toEqual({ ok: false, reason: 'superseded' });
    expect(undo(store, snapshot)).toBe(false);
    expect(store).toEqual(after);
  });

  it('still undoes when only a different problem was logged afterwards, and re-derives XP across both', () => {
    const store = history();
    const snapshot = save(store, solved('p1', '2026-10-20'), '2026-10-20T09:00:00.000Z');
    save(store, solved('p2', '2026-10-20'), '2026-10-20T09:00:05.000Z');
    expect(undo(store, snapshot)).toBe(true);
    expect(store.attempts.map((row) => row.id)).not.toContain(snapshot.attemptId);
    expect(store.gamification?.xp).toBe(replayXp(store.attempts));
    // The other problem's progress row is untouched by this undo.
    expect(store.progress.get('p2')?.lastAttemptDate).toBe('2026-10-20');
  });
});
