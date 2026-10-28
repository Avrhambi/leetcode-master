import { useEffect, useMemo, useState } from 'react';
import type { Attempt, CatalogProblem, ProblemProgress } from '../types/models';
import { MOCK_PROBLEM_COUNTS } from '../services/constants';
import { topicSkills } from '../services/skill';
import { importedIds } from '../services/importKnown';
import { listTag } from '../services/coreRank';
import {
  checkTests, clockText, effectiveOutcome, mockClock, mockHistory, mockMinutes, mockSessionLine, selectMockProblems,
  type ActiveMock, type MockOutcome, type MockProblemCount, type MockProblemReport
} from '../services/mockInterview';
import { cancelMock, finishMock, startMock } from '../db/mockInterview';

interface MockInterviewProps {
  // The active set (what a mock draws from) and the unfiltered catalog (to resolve ids).
  problems: CatalogProblem[];
  allProblems: CatalogProblem[];
  progress: ProblemProgress[];
  attempts: Attempt[];
  active: ActiveMock | null;
  today: string;
}

const OUTCOME_LABELS: Record<MockOutcome, string> = {
  solved: 'All tests passed',
  partial: 'Some tests passed',
  unsolved: 'Did not get it working'
};

interface ReportDraft { outcome: MockOutcome; passed: string; total: string; usedHint: boolean }

const countValue = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

function toReport(problemId: string, draft: ReportDraft): MockProblemReport {
  return { problemId, outcome: draft.outcome, testsPassed: countValue(draft.passed), testsTotal: countValue(draft.total), usedHint: draft.usedHint };
}

// The mock interview: pick, run against one clock, report. The running mock lives
// in the `activeMock` setting, so this screen can be closed and reopened (or the
// page reloaded) without losing the clock. The clock is read here, once a second,
// only while a mock runs; everything it feeds is pure (mockInterview.ts).
export function MockInterview({ problems, allProblems, progress, attempts, active, today }: MockInterviewProps) {
  const [count, setCount] = useState<MockProblemCount>(2);
  const [seed, setSeed] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [reporting, setReporting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ReportDraft>>({});
  const [failure, setFailure] = useState<'start' | 'save' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const skills = useMemo(() => topicSkills(attempts, allProblems, importedIds(progress.map((row) => row.problemId), attempts.map((attempt) => attempt.problemId))), [attempts, allProblems, progress]);
  const proposal = useMemo(() => selectMockProblems({ problems, progress, attempts, skills, count, today, seed }), [problems, progress, attempts, skills, count, today, seed]);
  const byId = new Map(allProblems.map((problem) => [problem.id, problem]));
  const history = mockHistory(attempts).slice(0, 5);

  async function run(kind: 'start' | 'save' | 'cancel', action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      return true;
    } catch {
      setFailure(kind);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const start = () => void run('start', async () => {
    await startMock(proposal.map((problem) => problem.id), mockMinutes(proposal));
    setSaved(null);
    setReporting(false);
    setDrafts({});
    setNow(new Date());
  });

  const cancel = () => void run('cancel', async () => {
    await cancelMock();
    setConfirmCancel(false);
    setReporting(false);
  });

  if (!active) {
    return <section className="mock-interview" aria-label="Mock interview">
      <p className="eyebrow">Practice under interview conditions</p>
      <h2>Mock interview</h2>
      {saved && <p className="mock-saved" role="status">{saved}</p>}
      <p>Problems you have not seen, at your interview level, one clock for all of them. Open each on NeetCode or LeetCode, solve it, then report how it went: the results go into your plan like any attempt, and count more toward your readiness.</p>
      <div className="session-budget" role="group" aria-label="Number of problems">
        <span>Problems:</span>
        {MOCK_PROBLEM_COUNTS.map((option) => <button type="button" key={option} aria-pressed={count === option} onClick={() => { setCount(option); setSeed(0); }}>{option === 1 ? '1 problem · 30 min' : '2 problems · 60–90 min'}</button>)}
      </div>
      {proposal.length === 0
        ? <p>No problems are available for a mock right now.</p>
        : <>
            <ol className="mock-proposal">
              {proposal.map((problem) => <li key={problem.id}>{problem.primaryTopic} · {problem.difficulty}</li>)}
            </ol>
            <p className="plan-time">Time limit: {mockMinutes(proposal)} min{proposal.length === 2 && (mockMinutes(proposal) === 60 ? ' (two Easies)' : ' (a Medium or Hard takes longer)')}. Titles are revealed when the clock starts.</p>
            <div className="mock-actions">
              <button type="button" className="solve-button" disabled={busy} onClick={start}>Start the clock</button>
              <button type="button" disabled={busy} onClick={() => setSeed((value) => value + 1)}>Different problems</button>
            </div>
          </>}
      {failure === 'start' && <p role="alert">The mock could not be started. <button type="button" onClick={start}>Retry</button></p>}
      {history.length > 0 && <>
        <h3>Past mocks</h3>
        <ul className="mock-history">{history.map((session) => <li key={session.sessionId}>{mockSessionLine(session)}</li>)}</ul>
      </>}
    </section>;
  }

  const clock = mockClock(active, now);
  const mockProblems = active.problemIds.map((id) => byId.get(id)).filter((problem): problem is CatalogProblem => problem !== undefined);
  const draftOf = (id: string): ReportDraft => drafts[id] ?? { outcome: 'solved', passed: '', total: '', usedHint: false };
  const setDraft = (id: string, change: Partial<ReportDraft>) => setDrafts((current) => ({ ...current, [id]: { ...draftOf(id), ...change } }));
  const invalid = mockProblems.some((problem) => checkTests(countValue(draftOf(problem.id).passed), countValue(draftOf(problem.id).total)) !== null);

  const save = () => void run('save', async () => {
    const reports = mockProblems.map((problem) => toReport(problem.id, draftOf(problem.id)));
    await finishMock(active, reports, clock.overTime);
    const solved = reports.filter((report) => effectiveOutcome(report) === 'solved' && !report.usedHint && !clock.overTime).length;
    setSaved(`Mock saved: ${solved} of ${reports.length} solved cleanly. Anything you missed comes back as a review.`);
    setReporting(false);
    setDrafts({});
  });

  return <section className="mock-interview" aria-label="Mock interview">
    <p className="eyebrow">Mock interview running</p>
    <h2>{clock.overTime ? "Time's up" : 'Mock interview'}</h2>
    <p className="mock-clock" data-over={clock.overTime} role="timer" aria-live="off" aria-label={clock.overTime ? 'Time is up' : `${clockText(clock.remainingSeconds)} left`}>
      {clock.overTime ? `+${clockText(clock.elapsedSeconds - active.minutes * 60)}` : clockText(clock.remainingSeconds)}
      <span> of {active.minutes} min</span>
    </p>
    {!reporting && <>
      <ol className="mock-problems">
        {mockProblems.map((problem) => <li key={problem.id}>
          <strong>{problem.title}</strong>
          <p>{problem.primaryTopic} · {problem.difficulty}{listTag(problem) && ` · ${listTag(problem)}`}</p>
          <span className="solve-links"><a className="solve-button" href={problem.neetcodeUrl} target="_blank" rel="noreferrer">Solve on NeetCode</a><a className="solve-button" href={problem.leetcodeUrl} target="_blank" rel="noreferrer">Solve on LeetCode</a></span>
        </li>)}
      </ol>
      <div className="mock-actions">
        <button type="button" className="solve-button" onClick={() => setReporting(true)}>{clock.overTime ? 'Report results' : "I'm done, report results"}</button>
        {!confirmCancel
          ? <button type="button" onClick={() => setConfirmCancel(true)}>Cancel mock</button>
          : <span className="mock-confirm">Discard this mock? Nothing is saved. <button type="button" disabled={busy} onClick={cancel}>Discard</button> <button type="button" onClick={() => setConfirmCancel(false)}>Keep going</button></span>}
      </div>
      {failure === 'cancel' && <p role="alert">The mock could not be discarded. <button type="button" onClick={cancel}>Retry</button></p>}
    </>}
    {reporting && <form className="mock-report" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <p>{clock.overTime ? 'The clock ran out, so a full solve counts as a solve over time.' : 'Report each problem as it stood when you stopped.'} Test counts are optional; when you give them they decide the result (all = solved, at least half = partial).</p>
      {mockProblems.map((problem) => {
        const draft = draftOf(problem.id);
        const testsError = checkTests(countValue(draft.passed), countValue(draft.total));
        return <fieldset key={problem.id}>
          <legend>{problem.title}</legend>
          <div className="mock-outcomes" role="radiogroup" aria-label={`Result for ${problem.title}`}>
            {(Object.keys(OUTCOME_LABELS) as MockOutcome[]).map((outcome) => <label key={outcome}>
              <input type="radio" name={`outcome-${problem.id}`} checked={draft.outcome === outcome} onChange={() => setDraft(problem.id, { outcome })} /> {OUTCOME_LABELS[outcome]}
            </label>)}
          </div>
          <div className="mock-tests">
            <label>Tests passed <input type="number" inputMode="numeric" min={0} value={draft.passed} onChange={(event) => setDraft(problem.id, { passed: event.target.value })} /></label>
            <label>of <input type="number" inputMode="numeric" min={1} value={draft.total} onChange={(event) => setDraft(problem.id, { total: event.target.value })} /></label>
          </div>
          {testsError && <p className="field-error">Enter both numbers, with passed no more than the total.</p>}
          <label className="mock-hint"><input type="checkbox" checked={draft.usedHint} onChange={(event) => setDraft(problem.id, { usedHint: event.target.checked })} /> I used a hint</label>
        </fieldset>;
      })}
      <div className="mock-actions">
        <button type="submit" className="solve-button" disabled={busy || invalid}>Save results</button>
        <button type="button" onClick={() => setReporting(false)}>Back to the problems</button>
      </div>
      {failure === 'save' && <p role="alert">The results could not be saved. <button type="button" onClick={save}>Retry</button></p>}
    </form>}
  </section>;
}
