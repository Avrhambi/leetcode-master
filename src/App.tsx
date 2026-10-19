import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeShelf } from './components/BadgeShelf';
import { ProblemSetPicker } from './components/ProblemSetPicker';
import { GamificationBar } from './components/GamificationBar';
import { UpdateNotice } from './components/UpdateNotice';
import { SettingsOverlay } from './components/SettingsOverlay';
import { Workbench } from './components/Workbench';
import { db } from './db/database';
import { skipRecommendation } from './db/recommendations';
import { saveProblemSet } from './db/problemSet';
import { seedCatalog } from './db/seedCatalog';
import { useDailyPlan } from './hooks/useDailyPlan';
import { useGamification } from './hooks/useGamification';
import { parseProblemSet, problemsInSet, PROBLEM_SETS } from './services/problemSet';
import { saveSessionBudget } from './db/sessionBudget';
import { streakEndingOn, weeklyStreakEndingOn } from './services/streak';
import type { ProblemList } from './types/models';

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function App() {
  const allProblems = useLiveQuery(() => db.problems.orderBy('neetcodeOrder').toArray(), []);
  const progress = useLiveQuery(() => db.progress.toArray(), []);
  const attempts = useLiveQuery(() => db.attempts.toArray(), []);
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const [seedError, setSeedError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The problem set is filtered once, here, so the plan, map, mastery counts and
  // search all see the same problems. `allProblems` only feeds the review queue.
  const storedSet = settings?.find((row) => row.key === 'problemSet')?.value;
  const problemSet = parseProblemSet(storedSet);
  const problems = useMemo(() => (allProblems ? problemsInSet(allProblems, problemSet) : undefined), [allProblems, problemSet]);

  const { plan, completedProblemIds, profile, addExtra, minutesOf, reviewsUntilNew, budget: sessionBudget } = useDailyPlan(problems, progress, attempts, allProblems);
  const gamification = useGamification();

  const seed = () => {
    setSeedError(false);
    void seedCatalog().catch(() => setSeedError(true));
  };

  useEffect(seed, []);

  if (seedError) return <main><p role="alert">The catalog could not be loaded.</p><button type="button" onClick={seed}>Retry</button></main>;
  if (!allProblems || !problems || !progress || !attempts || !settings) return <main><p>Loading catalog…</p></main>;

  const progressByProblem = new Map(progress.map((item) => [item.problemId, item.status]));
  // Grace-free streak ending today — the number that drives the XP multiplier on
  // the award path, so the ×N chip on the bar matches what an attempt would earn.
  const activeDates = new Set(attempts.map((a) => a.attemptedOn));
  const streakDays = streakEndingOn(activeDates, localDate());
  const streakWeeks = weeklyStreakEndingOn(activeDates, localDate());

  const setCounts = Object.fromEntries(PROBLEM_SETS.map((set) => [set, problemsInSet(allProblems, set).length])) as Record<ProblemList, number>;

  return <main>
    <header className="app-header">
      <div className="app-intro">
        <h1>LeetCode Master</h1>
      </div>
      {gamification && <GamificationBar snapshot={gamification} streakDays={streakDays} streakWeeks={streakWeeks} />}
      {gamification && <BadgeShelf earned={gamification.badges} problemSet={problemSet} setSize={problems.length} />}
      {storedSet === undefined && allProblems.length > 0 && <div className="problem-set-banner" role="region" aria-label="Choose a problem set">
        <span>Which list are you working through?</span>
        <ProblemSetPicker value={problemSet} counts={setCounts} unchosen onChange={(set) => void saveProblemSet(set)} />
      </div>}
      <UpdateNotice />
      <button type="button" className="settings-toggle" onClick={() => setSettingsOpen(true)}>Settings</button>
    </header>
    <Workbench
      attempts={attempts}
      problems={problems}
      allProblems={allProblems}
      progress={progress}
      progressByProblem={progressByProblem}
      settings={settings}
      problemSet={problemSet}
      streakWeeks={streakWeeks}
      planItems={plan ?? []}
      completedProblemIds={completedProblemIds}
      profile={profile}
      onAddExtra={addExtra}
      minutesOf={minutesOf}
      reviewsUntilNew={reviewsUntilNew}
      sessionBudget={sessionBudget}
      onBudgetChange={saveSessionBudget}
      onSkip={(item) => skipRecommendation(item.problem.id, item.kind)}
    />
    {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}
  </main>;
}
