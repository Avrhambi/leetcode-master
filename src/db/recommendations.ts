import { db } from './database';
import type { DailyPlanItem } from '../services/dailyPlan';

// `planResetAt` (see db/sessionBudget.ts): an item recommended today but before
// the reset counts as not yet recommended, so the re-planned item gets its own row.
export async function persistRecommendations(items: DailyPlanItem[], now = new Date(), planResetAt: string | null = null): Promise<void> {
  const recommendedAt = now.toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const since = planResetAt !== null && planResetAt > dayStart ? planResetAt : dayStart;
  await db.transaction('rw', db.recommendationEvents, async () => {
    for (const item of items) {
      const existing = await db.recommendationEvents.filter((event) => event.problemId === item.problem.id && event.kind === item.kind).last();
      if (!existing || existing.recommendedAt < since) await db.recommendationEvents.add({ id: crypto.randomUUID(), problemId: item.problem.id, kind: item.kind, recommendedAt, skippedUntil: null, completedAt: null });
    }
  });
}

export async function skipRecommendation(problemId: string, kind: DailyPlanItem['kind'], now = new Date()): Promise<void> {
  const skippedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await db.recommendationEvents.add({ id: crypto.randomUUID(), problemId, kind, recommendedAt: now.toISOString(), skippedUntil, completedAt: null });
}

