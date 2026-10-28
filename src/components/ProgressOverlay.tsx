import type { ReactNode } from 'react';
import type { GamificationView } from '../hooks/useGamification';
import type { ReadinessSummary } from '../services/readiness';
import type { ProblemList } from '../types/models';
import { BadgeShelf } from './BadgeShelf';
import { GamificationBar } from './GamificationBar';

interface ProgressOverlayProps {
  gamification: GamificationView;
  streakDays: number;
  streakWeeks: number;
  streak: number;
  graceDaysUsed: number;
  attemptsThisWeek: number;
  weeklyGoal: { days: number; goal: number } | null;
  readiness: ReadinessSummary;
  forecast: { text: string; detail: string } | null;
  goal: { text: string; detail: string[]; fits: boolean } | null;
  mockLines: string[];
  problemSet: ProblemList;
  setSize: number;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

// Everything the main screen leaves out (T25): level and XP, the full set of
// numbers, readiness per topic, the deadline arithmetic, past mocks and the
// badge grid. Rendered inside `Overlay`.
export function ProgressOverlay({ gamification, streakDays, streakWeeks, streak, graceDaysUsed, attemptsThisWeek, weeklyGoal, readiness, forecast, goal, mockLines, problemSet, setSize }: ProgressOverlayProps) {
  return <section className="progress-overlay" aria-label="Progress">
    <p className="eyebrow">Your progress</p>
    <h2>Progress</h2>
    <GamificationBar snapshot={gamification} streakDays={streakDays} streakWeeks={streakWeeks} />
    <dl className="progress-stats">
      <Stat label="Day streak">{streak}{graceDaysUsed > 0 && <span className="grace-note"> · {graceDaysUsed} grace {graceDaysUsed === 1 ? 'day' : 'days'}</span>}</Stat>
      <Stat label="Weeks consistent (3+ days)">{streakWeeks}</Stat>
      <Stat label="Attempts, last 7 days">{attemptsThisWeek}</Stat>
      {weeklyGoal && <Stat label="Days this week">{weeklyGoal.days} / {weeklyGoal.goal}{weeklyGoal.days >= weeklyGoal.goal && ' · goal met'}</Stat>}
      <Stat label="Interview readiness">{Math.round(readiness.overall * 100)}% · {readiness.readyCount} of {readiness.topics.length} topics ready</Stat>
    </dl>
    {goal && <div className="progress-block"><h3>Interview deadline</h3><p data-fits={goal.fits}>{goal.text}</p><ul>{goal.detail.map((line) => <li key={line}>{line}</li>)}</ul></div>}
    {forecast && <div className="progress-block"><h3>Finish forecast</h3><p>{forecast.text}</p>{forecast.detail && <p className="field-hint">{forecast.detail}</p>}</div>}
    <details className="progress-block">
      <summary>Readiness by topic</summary>
      <ul className="progress-topics">{readiness.topics.map((row) => <li key={row.topic} data-ready={row.ready}><span>{row.topic}</span><span>{Math.round(row.chance * 100)}%</span></li>)}</ul>
    </details>
    {mockLines.length > 0 && <div className="progress-block"><h3>Past mock interviews</h3><ul>{mockLines.map((line, index) => <li key={index}>{line}</li>)}</ul></div>}
    <h3>Badges</h3>
    <BadgeShelf earned={gamification.badges} problemSet={problemSet} setSize={setSize} />
  </section>;
}
