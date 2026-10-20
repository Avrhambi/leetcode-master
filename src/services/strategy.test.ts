import { describe, expect, it } from 'vitest';
import { horizonFor, maxItemsFor, strategyLine, trainingStrategy } from './strategy';

describe('trainingStrategy', () => {
  it('picks the horizon from the days left', () => {
    expect(horizonFor(null)).toBe('open');
    expect(horizonFor(1)).toBe('sprint');
    expect(horizonFor(14)).toBe('sprint');
    expect(horizonFor(15)).toBe('focused');
    expect(horizonFor(60)).toBe('focused');
    expect(horizonFor(61)).toBe('steady');
  });

  it('sizes the plan from the time budget: four items with none, one per 15 minutes with one (2 to 8)', () => {
    expect(maxItemsFor(null)).toBe(4);
    expect(maxItemsFor(30)).toBe(2);
    expect(maxItemsFor(45)).toBe(3);
    expect(maxItemsFor(60)).toBe(4);
    expect(maxItemsFor(90)).toBe(6);
    expect(maxItemsFor(120)).toBe(8);
    expect(maxItemsFor(600)).toBe(8);
  });

  it('explores most and consolidates least the closer the interview is', () => {
    const sprint = trainingStrategy({ daysLeft: 10, budget: null });
    const focused = trainingStrategy({ daysLeft: 40, budget: null });
    const steady = trainingStrategy({ daysLeft: 120, budget: null });
    const open = trainingStrategy({ daysLeft: null, budget: null });
    expect(sprint.exploreWeight).toBeGreaterThan(focused.exploreWeight);
    expect(focused.exploreWeight).toBeGreaterThan(steady.exploreWeight);
    expect(open.exploreWeight).toBe(0);
    expect(sprint.maxReviewShare).toBeLessThanOrEqual(steady.maxReviewShare);
    expect(open.maxReviewShare).toBe(0.75);
    expect(sprint.maintenanceLast).toBe(true);
    expect(focused.maintenanceLast).toBe(false);
    expect(open.readinessPriority).toBe(false);
    expect(steady.readinessPriority).toBe(true);
  });

  it('tapers in the last three days and suggests mocks more often near the date', () => {
    expect(trainingStrategy({ daysLeft: 3, budget: null }).taper).toBe(true);
    expect(trainingStrategy({ daysLeft: 4, budget: null }).taper).toBe(false);
    expect(trainingStrategy({ daysLeft: null, budget: null }).taper).toBe(false);
    expect(trainingStrategy({ daysLeft: 10, budget: null }).mockEveryDays).toBeLessThan(trainingStrategy({ daysLeft: null, budget: null }).mockEveryDays);
  });

  it('fills to the budget only when there is one', () => {
    expect(trainingStrategy({ daysLeft: null, budget: 90 }).fillToBudget).toBe(true);
    expect(trainingStrategy({ daysLeft: null, budget: null }).fillToBudget).toBe(false);
  });

  it('says what it is doing in one line', () => {
    expect(strategyLine(trainingStrategy({ daysLeft: null, budget: null }))).toBe('Open-ended · no interview date: working through the set, foundations first.');
    expect(strategyLine(trainingStrategy({ daysLeft: 10, budget: null }))).toBe('Sprint · 10 days left: every pattern at least once, reviews only for real gaps.');
    expect(strategyLine(trainingStrategy({ daysLeft: 1, budget: null }))).toBe('Sprint · interview tomorrow: no new Hards, close gaps and run mock interviews.');
    expect(strategyLine(trainingStrategy({ daysLeft: 40, budget: null }))).toBe('Focused · 40 days left: the patterns closest to ready first, with room to explore the rest.');
    expect(strategyLine(trainingStrategy({ daysLeft: 120, budget: null }))).toBe('Steady · 120 days left: the patterns closest to ready first, foundations before the rest.');
  });
});
