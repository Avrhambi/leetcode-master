import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { persistRecommendations } from '../db/recommendations';
import { dueReviewQueue, reviewsUntilNewProblems, selectDailyPlan, selectExtraProblem, type DailyPlanItem } from '../services/dailyPlan';
import { itemMinutes, minutesEstimator, parseSessionBudget, type SessionBudget } from '../services/sessionTime';
import { cadenceFor, type CadenceProfile } from '../services/cadence';
import { planReasoner } from '../services/planReason';
import { REVIEW_OVERLOAD_DUE } from '../services/constants';
import { parseInterviewDate } from '../services/goalPlan';
import type { Attempt, CatalogProblem, ProblemProgress } from '../types/models';

function localDay(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export interface UseDailyPlanResult {
  // `undefined` while the plan cannot yet be computed (inputs still loading).
  plan: DailyPlanItem[] | undefined;
  // Problem ids whose daily recommendation was completed today — drives the
  // "Solved" badge on the plan without touching the plan array itself.
  completedProblemIds: Set<string>;
  // How often the user practises (drives the banner for a returning user).
  profile: CadenceProfile;
  // Present only when "One more problem" is on offer: every item is logged and
  // the user is either regular or has no reviews left due.
  addExtra: (() => Promise<void>) | undefined;
  // Expected minutes for one plan item (calibrated from durations logged before today).
  minutesOf: (item: DailyPlanItem) => number;
  // Due reviews still to clear before new problems come back (0 when not paused).
  reviewsUntilNew: number;
  // The one-line "why this problem today" for a plan item (see planReason.ts).
  reasonOf: (item: DailyPlanItem) => string;
  // The stored time budget (`null` = none).
  budget: SessionBudget | null;
}

// Owns the adaptive daily plan: selection, the once-per-day persistence of the
// chosen recommendations, and the midnight rollover. Extracted from App so the
// component stays a layout shell. `problems` and `progress` are passed in (App
// already live-queries them for the other screens) so this hook only adds the
// `recommendationEvents` subscription, which nothing else needs.
//
// `selectDailyPlan` is intentionally not memoised — it returns a fresh array each
// call, and the `persistRecommendations` effect below is a no-op once the day's
// recommendations are already stored (it only tops up new problems if the stored
// set is short). The `dayRefresh` counter forces a fresh selection at midnight.
export function useDailyPlan(
  problems: CatalogProblem[] | undefined,
  progress: ProblemProgress[] | undefined,
  attempts: Attempt[] | undefined,
  allProblems: CatalogProblem[] | undefined
): UseDailyPlanResult {
  // Events, the budget and its reset time are read in one live query so a plan
  // is never computed from a mix of old and new values.
  const snapshot = useLiveQuery(async () => ({
    recommendationEvents: await db.recommendationEvents.toArray(),
    budget: parseSessionBudget((await db.settings.get('sessionMinutes'))?.value),
    planResetAt: (await db.settings.get('planResetAt'))?.value ?? null,
    interviewDate: (await db.settings.get('interviewDate'))?.value
  }), []);
  const recommendationEvents = snapshot?.recommendationEvents;
  const sessionMinutes = snapshot?.budget ?? null;
  const planResetAt = snapshot?.planResetAt ?? null;
  // An active interview deadline weights new problems towards the foundations (T16).
  const favourFoundations = parseInterviewDate(snapshot?.interviewDate, localDay()) !== null;
  const [dayRefresh, setDayRefresh] = useState(0);

  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => setDayRefresh((value) => value + 1), nextMidnight.getTime() - Date.now());
    return () => window.clearTimeout(timeout);
  }, [dayRefresh]);

  const planInput = problems && progress && attempts && allProblems && recommendationEvents
    ? { problems, progress, recommendationEvents, attempts, skillProblems: allProblems, sessionMinutes, planResetAt, favourFoundations }
    : undefined;
  const plan = planInput ? selectDailyPlan(planInput) : undefined;

  useEffect(() => {
    if (plan) void persistRecommendations(plan, new Date(), planResetAt);
    // `dayRefresh` is a dep so the plan is re-persisted after a midnight rollover.
  }, [plan, dayRefresh, planResetAt]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const completedProblemIds = new Set(
    (recommendationEvents ?? [])
      .filter((event) => event.completedAt !== null && event.completedAt !== undefined && new Date(event.completedAt) >= startOfToday)
      .map((event) => event.problemId)
  );

  const profile = cadenceFor(attempts ?? [], localDay()).profile;
  const allLogged = plan !== undefined && plan.length > 0 && plan.every((item) => completedProblemIds.has(item.problem.id));
  // Not under review overload: new problems are paused until the backlog clears.
  const dueCount = planInput ? dueReviewQueue(planInput.problems, planInput.progress).length : 0;
  const offerExtra = planInput !== undefined && plan !== undefined && allLogged
    && dueCount < REVIEW_OVERLOAD_DUE && (profile === 'regular' || dueCount === 0);
  const addExtra = offerExtra ? async () => {
    const extra = selectExtraProblem(planInput, plan);
    if (extra) await persistRecommendations([{ problem: extra, kind: 'new' }], new Date(), planResetAt);
  } : undefined;

  const estimate = minutesEstimator(attempts ?? [], allProblems ?? [], localDay());
  const minutesOf = (item: DailyPlanItem) => itemMinutes(item, estimate);
  const reviewsUntilNew = planInput ? reviewsUntilNewProblems(planInput) : 0;

  const reasonOf = planReasoner({ plan: plan ?? [], problems: problems ?? [], allProblems: allProblems ?? [], progress: progress ?? [], attempts: attempts ?? [], profile, reviewsUntilNew, today: localDay() });

  return { plan, completedProblemIds, profile, addExtra, minutesOf, reviewsUntilNew, reasonOf, budget: sessionMinutes };
}
