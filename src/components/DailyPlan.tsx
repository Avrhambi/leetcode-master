import { useEffect, useState } from 'react';
import type { CatalogProblem } from '../types/models';
import type { DailyPlanItem } from '../services/dailyPlan';
import { listTag } from '../services/coreRank';
import type { CadenceProfile } from '../services/cadence';
import { SESSION_BUDGET_OPTIONS } from '../services/constants';
import type { SessionBudget } from '../services/sessionTime';
import { QuickLog } from './QuickLog';

interface DailyPlanProps {
  items: DailyPlanItem[];
  completedProblemIds: Set<string>;
  profile: CadenceProfile;
  onAddExtra: (() => Promise<void>) | undefined;
  onSkip: (item: DailyPlanItem) => Promise<void>;
  onOpenProblem: (problem: CatalogProblem) => void;
  minutesOf: (item: DailyPlanItem) => number;
  // Due reviews left to clear before new problems come back (0 when not paused).
  reviewsUntilNew: number;
  // One-line "why this problem today" per item (planReason.ts).
  reasonOf: (item: DailyPlanItem) => string;
  // Latest non-empty note per problem id, shown on reviews.
  notes: Map<string, string>;
  budget: SessionBudget | null;
  onBudgetChange: (minutes: SessionBudget | null) => Promise<void>;
}

// Plan length in words: the total, how much of it is left once something is
// logged, and how it sits against the chosen budget.
function timeSummary(total: number, left: number, count: number, budget: SessionBudget | null): string {
  const remaining = left < total ? ` · about ${left} min left` : '';
  if (budget === null) return `About ${total} min${remaining}`;
  if (total > budget && count === 1) return `About ${total} min — over your ${budget} min, so today is just this one problem${remaining}`;
  if (total > budget) return `About ${total} min — more than your ${budget} min${remaining}`;
  return `About ${total} of your ${budget} min${remaining}`;
}

export function DailyPlan({ items, completedProblemIds, profile, onAddExtra, onSkip, onOpenProblem, minutesOf, reviewsUntilNew, reasonOf, notes, budget, onBudgetChange }: DailyPlanProps) {
  const [error, setError] = useState(false);
  const [extraError, setExtraError] = useState(false);
  const [budgetError, setBudgetError] = useState<SessionBudget | null | undefined>(undefined);
  useEffect(() => setError(false), [items]);
  const chooseBudget = (minutes: SessionBudget | null) => {
    setBudgetError(undefined);
    void onBudgetChange(minutes).catch(() => setBudgetError(minutes));
  };
  const total = items.reduce((sum, item) => sum + minutesOf(item), 0);
  const left = items.filter((item) => !completedProblemIds.has(item.problem.id)).reduce((sum, item) => sum + minutesOf(item), 0);
  const paused = items.length > 0 && items.every((item) => item.kind === 'review');
  const addExtra = () => {
    setExtraError(false);
    void onAddExtra?.().catch(() => setExtraError(true));
  };
  const skip = (item: DailyPlanItem) => {
    setError(false);
    void onSkip(item).catch(() => setError(true));
  };
  return <section className="daily-plan"><p className="eyebrow">Today</p><h2>Daily challenge</h2>{profile === 'returning' && <p className="welcome-back" role="status">Welcome back — easing in with reviews.</p>}{paused && reviewsUntilNew > 0 && <p className="welcome-back" role="status">Reviews are piling up, so new problems are paused. Clear {reviewsUntilNew} more {reviewsUntilNew === 1 ? 'review' : 'reviews'} and they come back.</p>}<div className="session-budget" role="group" aria-label="Time for today"><span>Time today:</span>{[null, ...SESSION_BUDGET_OPTIONS].map((option) => <button type="button" key={option ?? 'any'} aria-pressed={budget === option} onClick={() => chooseBudget(option)}>{option === null ? 'Any' : `${option} min`}</button>)}</div>{budgetError !== undefined && <p role="alert">The time budget could not be saved. <button type="button" onClick={() => chooseBudget(budgetError)}>Retry</button></p>}{items.length > 0 && <p className="plan-time">{timeSummary(total, left, items.length, budget)}</p>}<p>Solve a challenge on NeetCode (LeetCode is linked as a backup), then track how it went when you are ready.</p>{error && <p role="alert">The recommendation could not be updated. Retry.</p>}{items.length === 0 ? <p>No problems are available for today.</p> : <ol>{items.map((item) => {
    const completed = completedProblemIds.has(item.problem.id);
    return <li className={completed ? 'completed-challenge' : ''} key={`${item.kind}-${item.problem.id}`}><div className="daily-challenge-header"><div><strong>{item.reason === 'reinforce' ? 'Warm-up' : item.kind === 'review' ? 'Review' : 'New'} · {item.problem.title}</strong>{completed && <span className="challenge-status">Logged</span>}<p className="plan-reason">{reasonOf(item)}</p><p>{item.problem.primaryTopic} · {item.problem.difficulty}{listTag(item.problem) && ` · ${listTag(item.problem)}`} · ~{minutesOf(item)} min</p>{item.kind === 'review' && notes.get(item.problem.id) && <p className="review-note"><span>Your note:</span> {notes.get(item.problem.id)}</p>}<span className="solve-links"><a className="solve-button" href={item.problem.leetcodeUrl} target="_blank" rel="noreferrer">Solve on LeetCode</a><a className="solve-button" href={item.problem.neetcodeUrl} target="_blank" rel="noreferrer">Solve on NeetCode</a></span><QuickLog problem={item.problem} completed={completed} /></div><div className="daily-challenge-actions">{!completed && <button type="button" onClick={() => onOpenProblem(item.problem)}>Give feedback</button>}{!completed && <button type="button" onClick={() => skip(item)}>Skip for 24 hours</button>}</div></div></li>;
  })}</ol>}{onAddExtra && <div className="daily-extra"><p>Plan done — nice. Want to keep going?</p><button type="button" onClick={addExtra}>One more problem</button>{extraError && <p role="alert">Could not add another problem. <button type="button" onClick={addExtra}>Retry</button></p>}</div>}</section>;
}
