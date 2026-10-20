import { FORECAST_MIN_NEW_PROBLEMS, FORECAST_WINDOW_DAYS } from './constants';
import { daysBetween } from './cadence';
import type { Attempt } from '../types/models';

// "At this pace you finish the set in about N weeks", from the user's own recent
// rate. Pure: `today` is passed in, nothing is stored.
export interface FinishForecast {
  // Problems in the set with no attempt yet.
  remaining: number;
  // New problems per week with any practice, over the window; null with too little history.
  newPerActiveWeek: number | null;
  // Weeks of practice to attempt `remaining` at that rate; null when there is no rate or nothing left.
  weeks: number | null;
  // New problems behind the rate, for the explanation.
  newInWindow: number;
}

// Monday-start week key of a YYYY-MM-DD date, as a day number (UTC, DST-proof).
function weekKey(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const weekday = (new Date(utc).getUTCDay() + 6) % 7;
  return utc / 86_400_000 - weekday;
}

export function finishForecast(setProblemIds: string[], attempts: Pick<Attempt, 'problemId' | 'attemptedOn'>[], today: string): FinishForecast {
  const firstAttempt = new Map<string, string>();
  for (const attempt of attempts) {
    const known = firstAttempt.get(attempt.problemId);
    if (known === undefined || attempt.attemptedOn < known) firstAttempt.set(attempt.problemId, attempt.attemptedOn);
  }
  const inWindow = (date: string) => date <= today && daysBetween(date, today) < FORECAST_WINDOW_DAYS;

  const newInWindow = [...firstAttempt.values()].filter(inWindow).length;
  const activeWeeks = new Set(attempts.filter((attempt) => inWindow(attempt.attemptedOn)).map((attempt) => weekKey(attempt.attemptedOn))).size;
  const remaining = setProblemIds.filter((id) => !firstAttempt.has(id)).length;

  const newPerActiveWeek = newInWindow >= FORECAST_MIN_NEW_PROBLEMS && activeWeeks > 0 ? newInWindow / activeWeeks : null;
  const weeks = newPerActiveWeek !== null && remaining > 0 ? Math.max(1, Math.ceil(remaining / newPerActiveWeek)) : null;
  return { remaining, newPerActiveWeek, weeks, newInWindow };
}

// The sentence shown to the user; null while there is nothing honest to say.
export function forecastText(setLabel: string, forecast: FinishForecast): string | null {
  if (forecast.remaining === 0) return `You have attempted every problem in the ${setLabel}.`;
  if (forecast.weeks === null) return null;
  return `At this pace you finish the ${setLabel} in about ${forecast.weeks} ${forecast.weeks === 1 ? 'week' : 'weeks'}.`;
}

// The hover explanation: where the number comes from, and that it counts weeks you practise.
export function forecastDetail(forecast: FinishForecast): string {
  if (forecast.newPerActiveWeek === null) return '';
  const rate = Math.round(forecast.newPerActiveWeek * 10) / 10;
  return `${forecast.remaining} left at ${rate} new problems a week you practise (your last ${FORECAST_WINDOW_DAYS / 7} weeks). Weeks you skip add to this.`;
}
