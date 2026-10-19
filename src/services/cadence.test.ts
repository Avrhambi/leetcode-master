import { describe, expect, it } from 'vitest';
import { cadenceFor, daysBetween } from './cadence';

const day = (offset: number) => {
  const date = new Date(Date.UTC(2026, 6, 1 + offset));
  return date.toISOString().slice(0, 10);
};
const on = (...offsets: number[]) => offsets.map((offset) => ({ attemptedOn: day(offset) }));
const today = day(60);

describe('daysBetween', () => {
  it('counts calendar days across month and year ends', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });
});

describe('cadenceFor', () => {
  it('is new with no history and with under a week of history', () => {
    expect(cadenceFor([], today).profile).toBe('new');
    expect(cadenceFor(on(56, 57, 58, 59), today).profile).toBe('new');
  });

  it('ignores today so the profile is stable across the day', () => {
    const before = cadenceFor(on(30, 31, 32, 33, 34, 35, 36, 37, 58), today);
    const after = cadenceFor([...on(30, 31, 32, 33, 34, 35, 36, 37, 58), { attemptedOn: today }], today);
    expect(after).toEqual(before);
  });

  it('a daily newcomer is regular once past the first week, not after 16 days', () => {
    expect(cadenceFor(on(51, 52, 53, 54, 55, 56, 57, 58, 59), today).profile).toBe('regular');
  });

  it('is regular at 16+ active days in the last 28 (4+ a week)', () => {
    const sixteen = Array.from({ length: 16 }, (_, index) => 59 - index);
    expect(cadenceFor(on(...sixteen), today).profile).toBe('regular');
    expect(cadenceFor(on(...sixteen.slice(0, 15), 20), today).profile).toBe('occasional');
  });

  it('is occasional for a steady 2-3 days a week', () => {
    const twoAWeek = [59, 56, 52, 49, 45, 42, 38, 35, 31];
    const result = cadenceFor(on(...twoAWeek), today);
    expect(result.profile).toBe('occasional');
    expect(result.activeDaysLast28).toBe(8);
  });

  it('is returning after a 7+ day gap, whatever came before', () => {
    const daily = Array.from({ length: 40 }, (_, index) => 52 - index);
    const result = cadenceFor(on(...daily), today);
    expect(result.profile).toBe('returning');
    expect(result.daysSinceLastActive).toBe(8);
    expect(cadenceFor(on(...daily.map((offset) => offset + 3)), today).profile).toBe('regular');
  });

  it('a 6-day gap is not yet returning', () => {
    expect(cadenceFor(on(30, 31, 32, 33, 34, 35, 36, 37, 54), today).daysSinceLastActive).toBe(6);
    expect(cadenceFor(on(30, 31, 32, 33, 34, 35, 36, 37, 54), today).profile).toBe('occasional');
  });
});
