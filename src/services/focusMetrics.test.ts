import { describe, expect, it } from 'vitest';
import { FOCUS_CHIP_LIMIT, focusChips, type FocusInput } from './focusMetrics';

const base: FocusInput = {
  freshStart: false,
  mockRunning: false,
  newPaused: false,
  reviewsUntilNew: 0,
  streak: 0,
  practicedToday: false,
  goal: null,
  readinessPct: 40,
  forecast: 'At this pace you finish the NeetCode 150 in about 20 weeks.'
};
const ids = (input: Partial<FocusInput>) => focusChips({ ...base, ...input }).map((chip) => chip.id);

describe('focusChips', () => {
  it('gives a brand-new user one hint and nothing else', () => {
    expect(focusChips({ ...base, freshStart: true })).toEqual([{ id: 'start', text: "Start with today's challenge", urgent: false }]);
  });

  it('shows readiness and the forecast when nothing is urgent', () => {
    expect(ids({})).toEqual(['readiness', 'forecast']);
  });

  it('puts the urgent things first and never shows more than the limit', () => {
    const chips = focusChips({ ...base, mockRunning: true, newPaused: true, reviewsUntilNew: 3, streak: 5, goal: { text: '30 h left', fits: false } });
    expect(chips).toHaveLength(FOCUS_CHIP_LIMIT);
    expect(chips.map((chip) => chip.id)).toEqual(['mock', 'paused', 'streak']);
    expect(chips.every((chip) => chip.urgent)).toBe(true);
    expect(chips[1].text).toBe('New problems paused · clear 3 reviews');
  });

  it('flags a streak only while today is still unlogged', () => {
    expect(focusChips({ ...base, streak: 4 })[0]).toEqual({ id: 'streak', text: '4-day streak · practise today to keep it', urgent: true });
    expect(focusChips({ ...base, streak: 4, practicedToday: true })[0]).toEqual({ id: 'streak', text: '4-day streak', urgent: false });
  });

  it('shows a deadline in place of the forecast, urgent only when it no longer fits', () => {
    expect(ids({ goal: { text: '12 h a week', fits: true } })).toEqual(['goal', 'readiness']);
    expect(focusChips({ ...base, goal: { text: '30 h a week', fits: false } })[0].urgent).toBe(true);
  });
});
