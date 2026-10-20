import { describe, expect, it } from 'vitest';
import { finishForecast, forecastDetail, forecastText } from './forecast';

const attempt = (problemId: string, attemptedOn: string) => ({ problemId, attemptedOn });
const ids = (count: number) => Array.from({ length: count }, (_, index) => `p${index}`);

describe('finishForecast', () => {
  // 2026-10-19 is a Monday. Two weeks of practice, 6 new problems each: 6 per active week.
  const twoWeeks = [
    ...ids(6).map((id, index) => attempt(id, `2026-10-${String(5 + (index % 3)).padStart(2, '0')}`)),
    ...ids(12).slice(6).map((id, index) => attempt(id, `2026-10-${String(12 + (index % 3)).padStart(2, '0')}`))
  ];

  it('projects remaining problems at the new-problems-per-active-week rate', () => {
    const forecast = finishForecast(ids(60), twoWeeks, '2026-10-14');
    expect(forecast.newPerActiveWeek).toBe(6);
    expect(forecast.remaining).toBe(48);
    expect(forecast.weeks).toBe(8);
  });

  it('rounds partial weeks up', () => {
    expect(finishForecast(ids(15), twoWeeks, '2026-10-14').weeks).toBe(1);
    expect(finishForecast(ids(20), twoWeeks, '2026-10-14').weeks).toBe(2);
  });

  it('does not count weeks without practice against the rate', () => {
    // Same 12 new problems, but a fully idle week sits between the two practice weeks.
    const gap = twoWeeks.map((row) => (row.attemptedOn >= '2026-10-12' ? attempt(row.problemId, row.attemptedOn.replace('2026-10-1', '2026-10-2')) : row));
    expect(finishForecast(ids(60), gap, '2026-10-24').newPerActiveWeek).toBe(6);
  });

  it('only counts the first attempt on a problem as new', () => {
    const reviews = [...twoWeeks, attempt('p0', '2026-10-13'), attempt('p1', '2026-10-13')];
    expect(finishForecast(ids(60), reviews, '2026-10-14').newInWindow).toBe(12);
  });

  it('ignores problems first attempted before the window', () => {
    const old = ids(6).map((id) => attempt(id, '2026-01-05'));
    const forecast = finishForecast(ids(60), [...old, ...twoWeeks.slice(6, 9)], '2026-10-14');
    expect(forecast.newInWindow).toBe(3);
    expect(forecast.newPerActiveWeek).toBeNull();
    expect(forecast.weeks).toBeNull();
    expect(forecast.remaining).toBe(60 - 6 - 3);
  });

  it('has no rate with too little history, and none with no history', () => {
    expect(finishForecast(ids(60), twoWeeks.slice(0, 4), '2026-10-14').weeks).toBeNull();
    expect(finishForecast(ids(60), [], '2026-10-14')).toEqual({ remaining: 60, newPerActiveWeek: null, weeks: null, newInWindow: 0 });
  });

  it('counts only problems of the given set as remaining', () => {
    expect(finishForecast(ids(8), twoWeeks, '2026-10-14').remaining).toBe(0);
  });

  it('reads attempts after today as not yet happened', () => {
    expect(finishForecast(ids(60), [...twoWeeks, attempt('p40', '2026-10-30')], '2026-10-14').newInWindow).toBe(12);
  });
});

describe('forecastText', () => {
  const base = { remaining: 40, newPerActiveWeek: 5, weeks: 8, newInWindow: 10 };

  it('states the finish time in weeks', () => {
    expect(forecastText('NeetCode 75', base)).toBe('At this pace you finish the NeetCode 75 in about 8 weeks.');
    expect(forecastText('NeetCode 75', { ...base, weeks: 1 })).toBe('At this pace you finish the NeetCode 75 in about 1 week.');
  });

  it('says nothing without a rate, and congratulates a finished set', () => {
    expect(forecastText('NeetCode 75', { ...base, newPerActiveWeek: null, weeks: null })).toBeNull();
    expect(forecastText('NeetCode 75', { ...base, remaining: 0, weeks: null })).toBe('You have attempted every problem in the NeetCode 75.');
  });

  it('explains the rate in the detail', () => {
    expect(forecastDetail(base)).toContain('40 left at 5 new problems a week you practise');
    expect(forecastDetail({ ...base, newPerActiveWeek: null })).toBe('');
  });
});
