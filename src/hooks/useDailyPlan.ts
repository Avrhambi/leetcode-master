import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { persistRecommendations } from '../db/recommendations';
import { dueReviewQueue, selectDailyPlan, selectExtraProblem, type DailyPlanItem } from '../services/dailyPlan';
import { cadenceFor, type CadenceProfile } from '../services/cadence';
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
  const recommendationEvents = useLiveQuery(() => db.recommendationEvents.toArray(), []);
  const [dayRefresh, setDayRefresh] = useState(0);

  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => setDayRefresh((value) => value + 1), nextMidnight.getTime() - Date.now());
    return () => window.clearTimeout(timeout);
  }, [dayRefresh]);

  const planInput = problems && progress && attempts && allProblems && recommendationEvents
    ? { problems, progress, recommendationEvents, attempts, skillProblems: allProblems }
    : undefined;
  const plan = planInput ? selectDailyPlan(planInput) : undefined;

  useEffect(() => {
    if (plan) void persistRecommendations(plan);
    // `dayRefresh` is a dep so the plan is re-persisted after a midnight rollover.
  }, [plan, dayRefresh]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const completedProblemIds = new Set(
    (recommendationEvents ?? [])
      .filter((event) => event.completedAt !== null && event.completedAt !== undefined && new Date(event.completedAt) >= startOfToday)
      .map((event) => event.problemId)
  );

  const profile = cadenceFor(attempts ?? [], localDay()).profile;
  const allLogged = plan !== undefined && plan.length > 0 && plan.every((item) => completedProblemIds.has(item.problem.id));
  const offerExtra = planInput !== undefined && plan !== undefined && allLogged
    && (profile === 'regular' || dueReviewQueue(planInput.problems, planInput.progress).length === 0);
  const addExtra = offerExtra ? async () => {
    const extra = selectExtraProblem(planInput, plan);
    if (extra) await persistRecommendations([{ problem: extra, kind: 'new' }]);
  } : undefined;

  return { plan, completedProblemIds, profile, addExtra };
}
