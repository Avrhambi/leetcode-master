import { useEffect, useState } from 'react';
import type { CatalogProblem } from '../types/models';
import type { DailyPlanItem } from '../services/dailyPlan';
import { listTag } from '../services/coreRank';
import type { CadenceProfile } from '../services/cadence';

interface DailyPlanProps {
  items: DailyPlanItem[];
  completedProblemIds: Set<string>;
  profile: CadenceProfile;
  onAddExtra: (() => Promise<void>) | undefined;
  onSkip: (item: DailyPlanItem) => Promise<void>;
  onOpenProblem: (problem: CatalogProblem) => void;
}

export function DailyPlan({ items, completedProblemIds, profile, onAddExtra, onSkip, onOpenProblem }: DailyPlanProps) {
  const [error, setError] = useState(false);
  const [extraError, setExtraError] = useState(false);
  useEffect(() => setError(false), [items]);
  const addExtra = () => {
    setExtraError(false);
    void onAddExtra?.().catch(() => setExtraError(true));
  };
  const skip = (item: DailyPlanItem) => {
    setError(false);
    void onSkip(item).catch(() => setError(true));
  };
  return <section className="daily-plan"><p className="eyebrow">Today</p><h2>Daily challenge</h2>{profile === 'returning' && <p className="welcome-back" role="status">Welcome back — easing in with reviews.</p>}<p>Solve a challenge on NeetCode (LeetCode is linked as a backup), then track how it went when you are ready.</p>{error && <p role="alert">The recommendation could not be updated. Retry.</p>}{items.length === 0 ? <p>No problems are available for today.</p> : <ol>{items.map((item) => {
    const completed = completedProblemIds.has(item.problem.id);
    return <li className={completed ? 'completed-challenge' : ''} key={`${item.kind}-${item.problem.id}`}><div className="daily-challenge-header"><div><strong>{item.kind === 'review' ? 'Review' : 'New'} · {item.problem.title}</strong>{completed && <span className="challenge-status">Logged</span>}<p>{item.problem.primaryTopic} · {item.problem.difficulty}{listTag(item.problem) && ` · ${listTag(item.problem)}`}</p><a href={item.problem.neetcodeUrl} target="_blank" rel="noreferrer">Solve on NeetCode</a> · <a href={item.problem.leetcodeUrl} target="_blank" rel="noreferrer">LeetCode</a></div><div className="daily-challenge-actions">{!completed && <button type="button" onClick={() => onOpenProblem(item.problem)}>Give feedback</button>}{!completed && <button type="button" onClick={() => skip(item)}>Skip for 24 hours</button>}</div></div></li>;
  })}</ol>}{onAddExtra && <div className="daily-extra"><p>Plan done — nice. Want to keep going?</p><button type="button" onClick={addExtra}>One more problem</button>{extraError && <p role="alert">Could not add another problem. <button type="button" onClick={addExtra}>Retry</button></p>}</div>}</section>;
}
