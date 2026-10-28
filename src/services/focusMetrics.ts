// The main screen's metric chips (T25): at most FOCUS_CHIP_LIMIT, picked by what
// needs this user's attention now. Everything else lives in the Progress overlay.
// Pure: the caller computes the inputs (streak, readiness, goal line...) for today.

export const FOCUS_CHIP_LIMIT = 3;

export interface FocusInput {
  // No attempt and no progress row yet.
  freshStart: boolean;
  mockRunning: boolean;
  // Owed reviews have paused new problems (dailyPlan's overload rule).
  newPaused: boolean;
  reviewsUntilNew: number;
  // Day streak (with grace) and whether anything was logged today.
  streak: number;
  practicedToday: boolean;
  // The interview-deadline line, when a date is set.
  goal: { text: string; fits: boolean } | null;
  readinessPct: number;
  // The finish-forecast sentence, or null.
  forecast: string | null;
}

export interface FocusChip {
  id: 'start' | 'mock' | 'paused' | 'streak' | 'goal' | 'readiness' | 'forecast';
  text: string;
  urgent: boolean;
}

// Order is the priority: a running mock, paused new problems, a streak that
// breaks tonight, a deadline that no longer fits, then the steady numbers.
export function focusChips(input: FocusInput): FocusChip[] {
  if (input.freshStart) return [{ id: 'start', text: "Start with today's challenge", urgent: false }];
  const chips: FocusChip[] = [];
  if (input.mockRunning) chips.push({ id: 'mock', text: 'Mock interview running', urgent: true });
  if (input.newPaused) chips.push({ id: 'paused', text: `New problems paused · clear ${input.reviewsUntilNew} ${input.reviewsUntilNew === 1 ? 'review' : 'reviews'}`, urgent: true });
  if (input.streak > 0) {
    chips.push(input.practicedToday
      ? { id: 'streak', text: `${input.streak}-day streak`, urgent: false }
      : { id: 'streak', text: `${input.streak}-day streak · practise today to keep it`, urgent: true });
  }
  if (input.goal) chips.push({ id: 'goal', text: input.goal.text, urgent: !input.goal.fits });
  chips.push({ id: 'readiness', text: `Interview readiness ${input.readinessPct}%`, urgent: false });
  if (!input.goal && input.forecast) chips.push({ id: 'forecast', text: input.forecast, urgent: false });
  return chips.slice(0, FOCUS_CHIP_LIMIT);
}
