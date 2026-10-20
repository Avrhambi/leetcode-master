import { useEffect, useState } from 'react';
import { STREAK_GRACE_PER_WEEK } from '../services/constants';
import { activeDaysThisWeek, currentStreak, parseWeeklyGoal, type StreakGraceState } from '../services/streak';
import { importedIds } from '../services/importKnown';
import { finishForecast, forecastDetail, forecastText } from '../services/forecast';
import { PROBLEM_SET_LABELS } from '../services/problemSet';
import { buildGoalPlan, goalDetail, goalLineShort, readGoalSettings } from '../services/goalPlan';
import { minutesEstimator } from '../services/sessionTime';
import { backupReminderDue } from '../services/backupHealth';
import { masteryByTopic } from '../services/mastery';
import { reviewQueueSections, type DailyPlanItem } from '../services/dailyPlan';
import { strategyLine, type TrainingStrategy } from '../services/strategy';
import { readinessDetail, readinessSummary } from '../services/readiness';
import { topicSkills } from '../services/skill';
import { daysSinceLastMock, mockDue, parseActiveMock } from '../services/mockInterview';
import { MockInterview } from './MockInterview';
import { latestNotes } from '../services/reviewNotes';
import { dayWrapUp } from '../services/dayWrapUp';
import type { SessionBudget } from '../services/sessionTime';
import { TopicMap } from './TopicMap';
import { SidePanel, type Panel } from './SidePanel';
import { ProblemDetail } from './ProblemDetail';
import { DailyPlan } from './DailyPlan';
import { Overlay } from './Overlay';
import type { CadenceProfile } from '../services/cadence';
import type { AppSetting, Attempt, CatalogProblem, ProblemList, ProblemProgress, ProgressStatus } from '../types/models';

interface WorkbenchProps {
  attempts: Attempt[];
  problems: CatalogProblem[];
  // Unfiltered catalog — only the review queue and the interview-deadline hours read it, so out-of-set problems
  // the user already attempted keep coming due.
  allProblems: CatalogProblem[];
  progress: ProblemProgress[];
  progressByProblem: Map<string, ProgressStatus>;
  settings: AppSetting[];
  problemSet: ProblemList;
  // Consecutive calendar weeks with 3+ active days, shown beside the daily streak.
  streakWeeks: number;
  planItems: DailyPlanItem[];
  completedProblemIds: Set<string>;
  profile: CadenceProfile;
  onAddExtra: (() => Promise<void>) | undefined;
  onSkip: (item: DailyPlanItem) => Promise<void>;
  minutesOf: (item: DailyPlanItem) => number;
  reviewsUntilNew: number;
  reasonOf: (item: DailyPlanItem) => string;
  sessionBudget: SessionBudget | null;
  onBudgetChange: (minutes: SessionBudget | null) => Promise<void>;
  strategy: TrainingStrategy;
}

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Grace state lives in `settings` rows but is never spent down (see
// services/streak.ts); when absent the allowance is simply the default and
// grace usage is re-derived from the active dates each render.
function graceStateFrom(settings: AppSetting[]): StreakGraceState {
  const byKey = new Map(settings.map((row) => [row.key, row.value]));
  const remaining = Number(byKey.get('streakGraceRemaining'));
  return {
    graceRemaining: Number.isFinite(remaining) ? remaining : STREAK_GRACE_PER_WEEK,
    graceRefreshedOn: byKey.get('streakGraceRefreshedOn') ?? ''
  };
}

// The single screen: XP strip, a search box, the tiered topic map (with the
// bare-minimum stats above it and a side panel for a topic's problems, the
// search results, or one problem's detail), today's plan, badge shelf.
export function Workbench({ attempts, problems, allProblems, progress, progressByProblem, settings, problemSet, streakWeeks, planItems, completedProblemIds, profile, onAddExtra, onSkip, minutesOf, reviewsUntilNew, reasonOf, sessionBudget, onBudgetChange, strategy }: WorkbenchProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [mockOpen, setMockOpen] = useState(false);

  // 200 ms debounce (CLAUDE.md convention for search).
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // A non-empty query drives the panel into search mode; clearing it closes the
  // search panel but leaves a topic or problem panel alone.
  useEffect(() => {
    if (search !== '') {
      setPanel({ kind: 'search', query: search });
    } else {
      setPanel((current) => (current?.kind === 'search' ? null : current));
    }
  }, [search]);

  const today = localDate();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const weekStart = localDate(sevenDaysAgo);

  // Reviews owed (T22): pattern-covered, parked and second-in-topic reviews are optional.
  const reviewSections = reviewQueueSections(allProblems, progress, attempts);
  const dueReviews = reviewSections.owed.length;
  // Interview readiness (T23): chance on an unseen Medium per topic, from skill.
  const readiness = readinessSummary(problems, topicSkills(attempts, allProblems, importedIds(progress.map((row) => row.problemId), attempts.map((attempt) => attempt.problemId))));
  // Mock interviews (T24): the running one (a setting) and whether one is due.
  const activeMock = parseActiveMock(settings.find((row) => row.key === 'activeMock')?.value, new Date());
  const mockIsDue = mockDue(attempts, allProblems, today, strategy.mockEveryDays);
  const lastMock = daysSinceLastMock(attempts, today);
  const mockNudge = activeMock ? 'A mock interview is running.' : mockIsDue ? (lastMock === null ? 'Ready for a first mock interview? It shows how you do on unseen problems against the clock.' : `Time for a mock interview: the last one was ${lastMock} ${lastMock === 1 ? 'day' : 'days'} ago.`) : null;
  const attemptsThisWeek = attempts.filter((attempt) => attempt.attemptedOn >= weekStart && attempt.attemptedOn <= today).length;
  const activeDates = new Set(attempts.map((attempt) => attempt.attemptedOn));
  const backupReminder = backupReminderDue(settings.find((row) => row.key === 'lastBackupOn')?.value, [...activeDates], today);
  const { streak, graceDaysUsed } = currentStreak(activeDates, graceStateFrom(settings));
  const weeklyGoal = parseWeeklyGoal(settings.find((row) => row.key === 'weeklyGoalDays')?.value);
  const daysThisWeek = activeDaysThisWeek(activeDates, today);
  const forecast = finishForecast(problems.map((problem) => problem.id), attempts, today, importedIds(progress.map((row) => row.problemId), attempts.map((attempt) => attempt.problemId)));
  const forecastLine = forecastText(PROBLEM_SET_LABELS[problemSet], forecast);

  // Interview deadline (T16): hours the active set needs before the date, from the same
  // minute estimates as the plan. Nothing is stored; the hover holds the arithmetic.
  const goalSettings = readGoalSettings(settings, today);
  const goalPlan = goalSettings.interview ? buildGoalPlan({
    catalog: allProblems,
    startedIds: new Set([...progress.map((row) => row.problemId), ...attempts.map((attempt) => attempt.problemId)]),
    attempts,
    estimate: minutesEstimator(attempts, allProblems, today),
    interview: goalSettings.interview,
    today,
    skipEasies: goalSettings.skipEasies,
    weeklyGoalDays: goalSettings.weeklyGoalDays,
    budget: goalSettings.budget
  }) : null;

  // Items still open today — the count on the challenge trigger, so an untouched
  // challenge is visible without opening the modal.
  const openChallenges = planItems.filter((item) => !completedProblemIds.has(item.problem.id)).length;

  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const strugglingTopics = new Set(
    progress
      .filter((row) => row.struggling)
      .map((row) => problemById.get(row.problemId)?.primaryTopic)
      .filter((topic): topic is string => topic !== undefined)
  );

  // The map's selected node: lit for an open topic panel, and still lit while a
  // problem opened from that topic panel is showing.
  const selectedTopic =
    panel?.kind === 'topic' ? panel.topic
      : panel?.kind === 'problem' && panel.back?.kind === 'topic' ? panel.back.topic
      : null;

  const toggleTopic = (topic: string) => {
    // Clear any search so its pending debounce is cancelled and the box does not
    // sit populated over a topic panel.
    setSearchInput('');
    setPanel((current) => (current?.kind === 'topic' && current.topic === topic ? null : { kind: 'topic', topic }));
  };

  const closePanel = () => {
    setPanel(null);
    setSearchInput('');
  };

  return <section className={`workbench${panel?.kind === 'problem' ? ' is-focused' : ''}`} aria-label="Practice workbench">
    <div className="workbench-stats" aria-label="Progress summary">
      <span><b>{streak}</b> day streak{graceDaysUsed > 0 && <> · <span className="grace-note">{graceDaysUsed} grace {graceDaysUsed === 1 ? 'day' : 'days'}</span></>}</span>
      <span title="Consecutive weeks with 3+ active days"><b>{streakWeeks}</b> {streakWeeks === 1 ? 'week' : 'weeks'} consistent</span>
      {weeklyGoal !== null && <span className="weekly-goal" data-met={daysThisWeek >= weeklyGoal} title="Days you practised this week (Monday start) against your weekly goal"><b>{daysThisWeek}</b> / {weeklyGoal} days this week{daysThisWeek >= weeklyGoal && ' · goal met'}</span>}
      <span><b>{attemptsThisWeek}</b> attempts · 7 days</span>
      <span className="readiness-line" title={readinessDetail(readiness)}>Interview readiness <b>{Math.round(readiness.overall * 100)}%</b> · {readiness.readyCount} of {readiness.topics.length} topics ready</span>
      {forecastLine && <span className="finish-forecast" title={forecastDetail(forecast)}>{forecastLine}</span>}
      {goalPlan && <span className="goal-line" data-fits={goalPlan.fits.find((fit) => fit.set === problemSet)?.fits ?? true} title={goalDetail(goalPlan, problemSet).join('\n')}>{goalLineShort(goalPlan, problemSet)}</span>}
      <button
        type="button"
        className="review-trigger"
        data-open={dueReviews > 0}
        aria-pressed={panel?.kind === 'review'}
        onClick={() => {
          setSearchInput('');
          setPanel((current) => (current?.kind === 'review' ? null : { kind: 'review' }));
        }}
      >
        <b>{dueReviews}</b> for review
      </button>
      <button
        type="button"
        className="challenge-trigger mock-trigger"
        data-due={activeMock !== null || mockIsDue}
        onClick={() => setMockOpen(true)}
      >
        {activeMock ? 'Mock running' : 'Mock interview'}
      </button>
      <button
        type="button"
        className="challenge-trigger"
        data-open={openChallenges > 0}
        onClick={() => setChallengeOpen(true)}
      >
        Today's challenge{openChallenges > 0 && <span className="challenge-count">{openChallenges}</span>}
      </button>
    </div>

    <input
      type="search"
      className="workbench-search"
      value={searchInput}
      onChange={(event) => setSearchInput(event.target.value)}
      placeholder="Search problems"
      aria-label="Search problems"
    />

    {/* A problem takes the whole screen: it is the one place real work happens,
        and the map is not useful while you are working. It replaces the map
        region rather than opening in an overlay, so `panel.back` still carries
        the list to return to. */}
    {panel?.kind === 'problem'
      ? <div className="workbench-focus">
          {(() => {
            const fromReview = panel.back?.kind === 'review';
            const nextInReview = fromReview
              ? [...reviewSections.owed, ...reviewSections.optional].find((entry) => entry.problem.id !== panel.problem.id)?.problem ?? null
              : null;
            return <ProblemDetail
              problem={panel.problem}
              onBack={() => setPanel(panel.back)}
              reviewMode={fromReview}
              nextInReview={nextInReview}
              onNextReview={(next) => setPanel({ kind: 'problem', problem: next, back: { kind: 'review' } })}
            />;
          })()}
        </div>
      : <div className={`workbench-map${panel ? ' has-panel' : ''}`}>
          <TopicMap
            cells={masteryByTopic(problems, progress, problemSet, today)}
            strugglingTopics={strugglingTopics}
            selectedTopic={selectedTopic}
            onSelectTopic={toggleTopic}
          />
          {panel && <SidePanel
            panel={panel}
            problems={problems}
            progressByProblem={progressByProblem}
            reviewSections={reviewSections}
            backupReminder={backupReminder}
            onSelectProblem={(problem, back) => setPanel({ kind: 'problem', problem, back })}
            onClose={closePanel}
          />}
        </div>}

    {challengeOpen && <Overlay label="Today's challenge" onClose={() => setChallengeOpen(false)}>
      <DailyPlan
        items={planItems}
        completedProblemIds={completedProblemIds}
        profile={profile}
        onAddExtra={onAddExtra}
        onSkip={onSkip}
        minutesOf={minutesOf}
        reviewsUntilNew={reviewsUntilNew}
        reasonOf={reasonOf}
        notes={latestNotes(attempts)}
        budget={sessionBudget}
        onBudgetChange={onBudgetChange}
        strategyLine={strategyLine(strategy)}
        mockNudge={mockNudge}
        onOpenMock={() => { setChallengeOpen(false); setMockOpen(true); }}
        today={localDate()}
        wrapUp={dayWrapUp({ today: localDate(), planProblemIds: planItems.map((item) => item.problem.id), completedProblemIds, attempts, progress, catalogIds: new Set(allProblems.map((problem) => problem.id)), optionalIds: new Set(reviewSections.optional.map((entry) => entry.problem.id)) })}
        onOpenProblem={(problem) => {
          setChallengeOpen(false);
          setPanel({ kind: 'problem', problem, back: null });
        }}
      />
    </Overlay>}

    {mockOpen && <Overlay label="Mock interview" onClose={() => setMockOpen(false)}>
      <MockInterview problems={problems} allProblems={allProblems} progress={progress} attempts={attempts} active={activeMock} today={today} />
    </Overlay>}

  </section>;
}
