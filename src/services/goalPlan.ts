import type { AppSetting, Attempt, CatalogProblem, ProblemList, ProblemProgress } from '../types/models';
import { DEADLINE_DEFAULT_DAYS_PER_WEEK, DEADLINE_DEFAULT_SESSION_MINUTES, GOAL_RETRY_SHARE, INTERVIEW_MAX_DAYS, SESSION_DEFAULT_MINUTES } from './constants';
import { daysBetween } from './cadence';
import { finishForecast } from './forecast';
import { PROBLEM_SETS, PROBLEM_SET_LABELS, problemsInSet } from './problemSet';
import { localDate, progressAfterAttempt } from './reviews';
import { parseSessionBudget, type MinutesEstimator } from './sessionTime';
import { parseWeeklyGoal } from './streak';

// Goal plans (T16). Everything here is pure: `today` is passed in and nothing is
// stored beyond the two plain settings the parsers below read.

// ---- the interview date -----------------------------------------------------

export type InterviewDateReason = 'empty' | 'invalid' | 'past' | 'far';
export type InterviewDateCheck = { ok: true; date: string; daysLeft: number } | { ok: false; reason: InterviewDateReason };

function isCalendarDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  // setUTCFullYear, not Date.UTC: the latter reads years 0-99 as 1900-1999.
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

// Validates what the date field holds. The interview must be at least tomorrow
// and at most INTERVIEW_MAX_DAYS away; a date field gives '' while it is incomplete.
export function checkInterviewDate(raw: string, today: string): InterviewDateCheck {
  const value = raw.trim();
  if (value === '') return { ok: false, reason: 'empty' };
  if (!isCalendarDate(value)) return { ok: false, reason: 'invalid' };
  const daysLeft = daysBetween(today, value);
  if (daysLeft < 1) return { ok: false, reason: 'past' };
  if (daysLeft > INTERVIEW_MAX_DAYS) return { ok: false, reason: 'far' };
  return { ok: true, date: value, daysLeft };
}

export function interviewDateMessage(reason: InterviewDateReason): string {
  if (reason === 'past') return 'Pick a date after today.';
  if (reason === 'far') return `Pick a date within ${INTERVIEW_MAX_DAYS / 365} years.`;
  if (reason === 'invalid') return 'That is not a valid date.';
  return 'Pick a date.';
}

// The stored `interviewDate`. Anything unusable (a hand-edited or restored value,
// or a date that has now passed) means no deadline is active.
export function parseInterviewDate(value: string | undefined, today: string): { date: string; daysLeft: number } | null {
  const check = checkInterviewDate(value ?? '', today);
  return check.ok ? { date: check.date, daysLeft: check.daysLeft } : null;
}

// The stored `skipEasies` setting: only '1' turns it on.
export function parseSkipEasies(value: string | undefined): boolean {
  return value === '1';
}

export interface GoalSettings {
  interview: { date: string; daysLeft: number } | null;
  // A stored date that is no longer usable (it has passed), so the card can say so.
  expiredInterviewDate: string | null;
  skipEasies: boolean;
  weeklyGoalDays: number | null;
  budget: number | null;
}

export function readGoalSettings(rows: AppSetting[], today: string): GoalSettings {
  const value = (key: AppSetting['key']) => rows.find((row) => row.key === key)?.value;
  const interview = parseInterviewDate(value('interviewDate'), today);
  const stored = value('interviewDate');
  return {
    interview,
    expiredInterviewDate: !interview && stored !== undefined && isCalendarDate(stored) && daysBetween(today, stored) < 1 ? stored : null,
    skipEasies: parseSkipEasies(value('skipEasies')),
    weeklyGoalDays: parseWeeklyGoal(value('weeklyGoalDays')),
    budget: parseSessionBudget(value('sessionMinutes'))
  };
}

// ---- the arithmetic ---------------------------------------------------------

// Days after a first strong solve on which the spaced reviews fall, read off the
// real review rules so the two can never disagree (today: 3, 10, 24 and 54).
let onTimeOffsets: number[] | undefined;
export function onTimeReviewOffsets(): number[] {
  if (onTimeOffsets) return onTimeOffsets;
  const start = new Date(2026, 0, 1, 12);
  const startKey = localDate(0, start);
  const offsets: number[] = [];
  let progress: ProblemProgress | undefined;
  let at = start;
  for (let guard = 0; guard < 10; guard += 1) {
    progress = progressAfterAttempt(progress, 'strong', localDate(0, at), '', false, at);
    if (progress.nextReviewDate === null) break;
    const offset = daysBetween(startKey, progress.nextReviewDate);
    offsets.push(offset);
    at = new Date(2026, 0, 1 + offset, 12);
  }
  onTimeOffsets = offsets;
  return offsets;
}

export interface SetFit {
  set: ProblemList;
  label: string;
  // Problems in the set (with Easies skipped when that is on) the user has not started.
  remaining: number;
  // New problems to start per week to finish them all before the interview.
  perWeek: number;
  newMinutes: number;
  // Reviews of those new problems that fall before the interview, and their minutes:
  // one pattern review ladder per topic plus a re-solve for the share of first
  // attempts that need one (T22).
  reviews: number;
  reviewMinutes: number;
  totalMinutes: number;
  fits: boolean;
}

export interface GoalPlan {
  daysLeft: number;
  weeksLeft: number;
  daysPerWeek: number;
  sessionMinutes: number;
  daysAssumed: boolean;
  minutesAssumed: boolean;
  // Minutes of practice the user has before the interview at that pace.
  availableMinutes: number;
  // The user's own recent new problems per practised week (T14), or null with too little history.
  yourPace: number | null;
  fits: SetFit[];
  // The largest set that fits, else the smallest set.
  recommended: SetFit;
  anyFits: boolean;
}

export interface GoalInput {
  // The unfiltered catalog.
  catalog: CatalogProblem[];
  // Problems with a progress row or an attempt: already started, so not left to do.
  startedIds: Set<string>;
  attempts: Pick<Attempt, 'problemId' | 'attemptedOn'>[];
  estimate: MinutesEstimator;
  interview: { daysLeft: number };
  today: string;
  skipEasies: boolean;
  weeklyGoalDays: number | null;
  budget: number | null;
}

function fitFor(set: ProblemList, input: GoalInput, weeksLeft: number, availableMinutes: number): SetFit {
  const todo = problemsInSet(input.catalog, set, input.skipEasies)
    .filter((problem) => !input.startedIds.has(problem.id))
    .sort((left, right) => left.neetcodeOrder - right.neetcodeOrder);
  const offsets = onTimeReviewOffsets();
  const window = input.interview.daysLeft;
  const rank = { easy: 0, medium: 1, hard: 2 } as const;
  let newMinutes = 0;
  let reviewMinutes = 0;
  let retries = 0;
  // Per topic: the day its first problem starts and its hardest problem (the anchor).
  const topics = new Map<string, { start: number; anchor: CatalogProblem }>();
  todo.forEach((problem, index) => {
    // The problems are started one after another, spread evenly over the time left.
    const startDay = (window * (index + 0.5)) / todo.length;
    newMinutes += input.estimate('new', problem.difficulty);
    // A first attempt that needs a hint or fails comes back once as a re-solve.
    if (startDay + 1 < window) {
      retries += GOAL_RETRY_SHARE;
      reviewMinutes += GOAL_RETRY_SHARE * input.estimate('review', problem.difficulty);
    }
    const topic = topics.get(problem.primaryTopic);
    if (!topic) topics.set(problem.primaryTopic, { start: startDay, anchor: problem });
    else if (rank[problem.difficulty] > rank[topic.anchor.difficulty]) topic.anchor = problem;
  });
  // The pattern itself is reviewed once per rung of the ladder, through its anchor.
  let anchorReviews = 0;
  for (const { start, anchor } of topics.values()) {
    const count = offsets.filter((offset) => start + offset < window).length;
    anchorReviews += count;
    reviewMinutes += count * input.estimate('review', anchor.difficulty);
  }
  const reviews = anchorReviews + Math.round(retries);
  const totalMinutes = Math.round(newMinutes + reviewMinutes);
  return {
    set,
    label: PROBLEM_SET_LABELS[set],
    remaining: todo.length,
    perWeek: todo.length === 0 ? 0 : Math.ceil(todo.length / weeksLeft),
    newMinutes: Math.round(newMinutes),
    reviews,
    reviewMinutes: Math.round(reviewMinutes),
    totalMinutes,
    fits: totalMinutes <= availableMinutes
  };
}

export function buildGoalPlan(input: GoalInput): GoalPlan {
  const weeksLeft = input.interview.daysLeft / 7;
  const daysPerWeek = input.weeklyGoalDays ?? DEADLINE_DEFAULT_DAYS_PER_WEEK;
  const sessionMinutes = input.budget ?? DEADLINE_DEFAULT_SESSION_MINUTES;
  const availableMinutes = Math.round(weeksLeft * daysPerWeek * sessionMinutes);
  const fits = PROBLEM_SETS.map((set) => fitFor(set, input, weeksLeft, availableMinutes));
  const recommended = [...fits].reverse().find((fit) => fit.fits) ?? fits[0];
  return {
    daysLeft: input.interview.daysLeft,
    weeksLeft,
    daysPerWeek,
    sessionMinutes,
    daysAssumed: input.weeklyGoalDays === null,
    minutesAssumed: input.budget === null,
    availableMinutes,
    yourPace: finishForecast([], input.attempts, input.today).newPerActiveWeek,
    fits,
    recommended,
    anyFits: fits.some((fit) => fit.fits)
  };
}

// ---- wording ----------------------------------------------------------------

export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 6) / 10;
  return `${hours} h`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function timeAssumption(plan: GoalPlan): string {
  const days = `${plan.daysPerWeek} ${plan.daysPerWeek === 1 ? 'day' : 'days'} a week${plan.daysAssumed ? ' (assumed)' : ''}`;
  return `${days} × ${plan.sessionMinutes} min${plan.minutesAssumed ? ' (assumed)' : ''}`;
}

export function fitOf(plan: GoalPlan, set: ProblemList): SetFit {
  return plan.fits.find((fit) => fit.set === set) ?? plan.recommended;
}

// The one-line summary for the set the user is on.
export function goalLine(plan: GoalPlan, set: ProblemList): string {
  const fit = fitOf(plan, set);
  const head = `Interview in ${plural(plan.daysLeft, 'day')}: `;
  if (fit.remaining === 0) return `${head}you have started every problem in the ${fit.label}.`;
  const body = `${fit.label} is about ${formatHours(fit.totalMinutes)} of practice (${plural(fit.remaining, 'problem')} left, ${fit.perWeek} new a week).`;
  return `${head}${body} ${fit.fits ? 'That fits your time.' : `More than the ${formatHours(plan.availableMinutes)} you have at ${timeAssumption(plan)}.`}`;
}

// The compact version for the workbench stats row; the hover carries `goalDetail`.
export function goalLineShort(plan: GoalPlan, set: ProblemList): string {
  const fit = fitOf(plan, set);
  const head = `Interview in ${plural(plan.daysLeft, 'day')}`;
  if (fit.remaining === 0) return `${head} · every ${fit.label} problem started`;
  return `${head} · ${fit.label} ≈ ${formatHours(fit.totalMinutes)}, ${fit.perWeek} new a week · ${fit.fits ? 'fits your time' : 'over your time'}`;
}

// Where the number comes from, line by line: shown in a hover title and, in full,
// in Settings, so a phone user sees it too.
export function goalDetail(plan: GoalPlan, set: ProblemList): string[] {
  const fit = fitOf(plan, set);
  const offsets = onTimeReviewOffsets();
  const lines = [
    `${plural(fit.remaining, 'new problem')} at your minutes per problem (${SESSION_DEFAULT_MINUTES.new.easy}, ${SESSION_DEFAULT_MINUTES.new.medium}, ${SESSION_DEFAULT_MINUTES.new.hard} for Easy, Medium, Hard until you have logged three durations of a kind) = ${formatHours(fit.newMinutes)}.`,
    `${plural(fit.reviews, 'review')} before the interview: each topic's pattern reviewed ${offsets.join(', ')} days after its first problem, plus a re-solve for about ${Math.round(GOAL_RETRY_SHARE * 100)}% of first attempts (hints and misses); each counted as a full re-solve, problems started evenly over the time left = ${formatHours(fit.reviewMinutes)}.`,
    `Total ${formatHours(fit.totalMinutes)}.`,
    `Time you have: ${plan.weeksLeft.toFixed(1)} weeks × ${timeAssumption(plan)} = ${formatHours(plan.availableMinutes)}.`
  ];
  if (plan.daysAssumed || plan.minutesAssumed) lines.push('Set a weekly goal and a time budget to use your own numbers instead of the assumed ones.');
  lines.push(plan.yourPace === null ? 'Not enough history yet to compare with your own pace.' : `Your recent pace is ${Math.round(plan.yourPace * 10) / 10} new problems a week${plan.yourPace < fit.perWeek ? `, below the ${fit.perWeek} this needs` : ''}.`);
  lines.push('Reviews already scheduled for problems you have started are not counted.');
  return lines;
}

// Which set to suggest, in words.
export function recommendationText(plan: GoalPlan): string {
  if (!plan.anyFits) return `Even the ${plan.recommended.label} is more than your time allows. Add days or longer sessions, or move the date.`;
  return `${plan.recommended.label} is the largest set that fits.`;
}
