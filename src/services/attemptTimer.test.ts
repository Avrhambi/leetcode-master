import { describe, expect, it } from 'vitest';
import { elapsedMinutes, parseTimerStart, timerStorageKey } from './attemptTimer';

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

describe('elapsedMinutes', () => {
  it('rounds to whole minutes', () => {
    expect(elapsedMinutes(NOW - 12 * MIN, NOW)).toBe(12);
    expect(elapsedMinutes(NOW - (12 * MIN + 29_000), NOW)).toBe(12);
    expect(elapsedMinutes(NOW - (12 * MIN + 30_000), NOW)).toBe(13);
  });

  it('never logs less than 1 minute', () => {
    expect(elapsedMinutes(NOW, NOW)).toBe(1);
    expect(elapsedMinutes(NOW - 10_000, NOW)).toBe(1);
    expect(elapsedMinutes(NOW + MIN, NOW)).toBe(1);
  });

  it('clamps to the form maximum of 600 minutes', () => {
    expect(elapsedMinutes(NOW - 600 * MIN, NOW)).toBe(600);
    expect(elapsedMinutes(NOW - 700 * MIN, NOW)).toBe(600);
  });
});

describe('parseTimerStart', () => {
  it('accepts a recent start', () => {
    expect(parseTimerStart(String(NOW - 5 * MIN), NOW)).toBe(NOW - 5 * MIN);
  });

  it('drops a start older than 12 hours but keeps one just inside it', () => {
    expect(parseTimerStart(String(NOW - 12 * HOUR), NOW)).toBe(NOW - 12 * HOUR);
    expect(parseTimerStart(String(NOW - 12 * HOUR - 1), NOW)).toBeNull();
  });

  it('drops a start in the future, junk and missing values', () => {
    expect(parseTimerStart(String(NOW + 1), NOW)).toBeNull();
    expect(parseTimerStart('soon', NOW)).toBeNull();
    expect(parseTimerStart('NaN', NOW)).toBeNull();
    expect(parseTimerStart('Infinity', NOW)).toBeNull();
    expect(parseTimerStart('', NOW)).toBeNull();
    expect(parseTimerStart(null, NOW)).toBeNull();
    expect(parseTimerStart(undefined, NOW)).toBeNull();
  });
});

describe('timerStorageKey', () => {
  it('is per problem', () => {
    expect(timerStorageKey('a')).not.toBe(timerStorageKey('b'));
    expect(timerStorageKey('a')).toContain('a');
  });
});
