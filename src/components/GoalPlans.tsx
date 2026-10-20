import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { clearInterviewDate, saveInterviewGoal, saveSkipEasies } from '../db/goals';
import { saveProblemSet } from '../db/problemSet';
import { buildGoalPlan, checkInterviewDate, formatHours, goalDetail, goalLine, interviewDateMessage, readGoalSettings, recommendationText, type GoalPlan } from '../services/goalPlan';
import { INTERVIEW_MAX_DAYS } from '../services/constants';
import { parseProblemSet, problemsInSet, PROBLEM_SET_LABELS } from '../services/problemSet';
import { localDate } from '../services/reviews';
import { minutesEstimator } from '../services/sessionTime';

type Failed = { kind: 'save'; date: string } | { kind: 'clear' } | { kind: 'skip'; on: boolean } | { kind: 'use'; set: ReturnType<typeof parseProblemSet> } | null;

// "Interview deadline" and "Skip Easies" (T16). The date and the toggle are plain
// settings; the plan, hours and recommended set are derived from them on every
// render, so nothing here can drift from the history it reads.
export function GoalPlans() {
  const today = localDate();
  const data = useLiveQuery(async () => ({
    catalog: await db.problems.toArray(),
    progress: await db.progress.toArray(),
    attempts: await db.attempts.toArray(),
    settings: await db.settings.toArray()
  }), []);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState<Failed>(null);
  if (!data) return null;

  const goal = readGoalSettings(data.settings, today);
  const activeSet = parseProblemSet(data.settings.find((row) => row.key === 'problemSet')?.value);
  const check = checkInterviewDate(draft, today);
  const planFor = (daysLeft: number): GoalPlan => buildGoalPlan({
    catalog: data.catalog,
    startedIds: new Set([...data.progress.map((row) => row.problemId), ...data.attempts.map((attempt) => attempt.problemId)]),
    attempts: data.attempts,
    estimate: minutesEstimator(data.attempts, data.catalog, today),
    interview: { daysLeft },
    today,
    skipEasies: goal.skipEasies,
    weeklyGoalDays: goal.weeklyGoalDays,
    budget: goal.budget
  });
  const plan = goal.interview ? planFor(goal.interview.daysLeft) : null;
  const tomorrow = localDate(1);
  const farthest = localDate(INTERVIEW_MAX_DAYS);
  const easyCount = problemsInSet(data.catalog, activeSet).filter((problem) => problem.difficulty === 'easy').length;

  const run = (action: Failed, work: () => Promise<void>, done: string) => {
    setFailed(null);
    void work().then(() => setNotice(done), () => setFailed(action));
  };
  const save = (date: string, daysLeft: number) => {
    const recommended = planFor(daysLeft).recommended.set;
    run({ kind: 'save', date }, async () => { await saveInterviewGoal(date, recommended); setDraft(''); },
      recommended === activeSet ? `Interview date saved. ${PROBLEM_SET_LABELS[recommended]} already fits.` : `Interview date saved. Switched to the ${PROBLEM_SET_LABELS[recommended]} to fit it; you can change that in Problem set. Your history is untouched.`);
  };
  const retry = () => {
    if (failed?.kind === 'save') { const again = checkInterviewDate(failed.date, today); if (again.ok) save(again.date, again.daysLeft); }
    if (failed?.kind === 'clear') run(failed, clearInterviewDate, 'Interview date cleared.');
    if (failed?.kind === 'skip') run(failed, () => saveSkipEasies(failed.on), failed.on ? 'Easy problems are skipped.' : 'Easy problems are back.');
    if (failed?.kind === 'use') run(failed, () => saveProblemSet(failed.set), `Switched to the ${PROBLEM_SET_LABELS[failed.set]}.`);
  };

  return <div className="goal-plans">
    <article className="goal-plan"><h3>Interview deadline</h3>
      <p>Tell the app when your interview is. It works out how many hours each list needs before then, switches to the largest list that fits, and plans foundations topics first. Your history is never changed.</p>
      <label className="reminder-time">Interview date
        <input type="date" value={draft} min={tomorrow} max={farthest} onChange={(event) => { setDraft(event.target.value); setNotice(''); }} />
      </label>
      {draft !== '' && !check.ok && <p role="alert">{interviewDateMessage(check.reason)}</p>}
      <div className="goal-actions">
        <button type="button" disabled={!check.ok} onClick={() => check.ok && save(check.date, check.daysLeft)}>Save date</button>
        {goal.interview && <button type="button" className="goal-secondary" onClick={() => run({ kind: 'clear' }, clearInterviewDate, 'Interview date cleared.')}>Clear date</button>}
      </div>
      {goal.expiredInterviewDate && <p>Your interview date ({goal.expiredInterviewDate}) has passed. Clear it, or save a new one.
        {' '}<button type="button" className="goal-secondary" onClick={() => run({ kind: 'clear' }, clearInterviewDate, 'Interview date cleared.')}>Clear date</button></p>}
      {plan && goal.interview && <div className="goal-result" role="group" aria-label="Plan for the interview date">
        <p><b>{goal.interview.date}</b> · {goalLine(plan, activeSet)}</p>
        <table className="goal-table"><thead><tr><th scope="col">List</th><th scope="col">Left</th><th scope="col">New a week</th><th scope="col">Hours</th><th scope="col">Fits</th></tr></thead>
          <tbody>{plan.fits.map((fit) => <tr key={fit.set} data-active={fit.set === activeSet}>
            <th scope="row">{fit.label}{fit.set === activeSet && ' (yours)'}</th><td>{fit.remaining}</td><td>{fit.perWeek}</td><td>{formatHours(fit.totalMinutes)}</td><td>{fit.fits ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
        <p>{recommendationText(plan)} You have about {formatHours(plan.availableMinutes)} of practice before the date.</p>
        {plan.recommended.set !== activeSet && <button type="button" onClick={() => run({ kind: 'use', set: plan.recommended.set }, () => saveProblemSet(plan.recommended.set), `Switched to the ${plan.recommended.label}.`)}>Switch to the {plan.recommended.label}</button>}
        <details><summary>How this is worked out</summary><ul>{goalDetail(plan, activeSet).map((line) => <li key={line}>{line}</li>)}</ul></details>
      </div>}
    </article>
    <article><h3>Skip Easies</h3>
      <p>For experienced users: leave the Easy problems out of the plan, the map and the counts ({easyCount} in the {PROBLEM_SET_LABELS[activeSet]}). Your Easy history is kept, and any Easy that is due still shows in the review queue.</p>
      <div className="problem-set-picker goal-toggle" role="group" aria-label="Skip Easy problems">
        <button type="button" aria-pressed={!goal.skipEasies} onClick={() => run({ kind: 'skip', on: false }, () => saveSkipEasies(false), 'Easy problems are back.')}>Off</button>
        <button type="button" aria-pressed={goal.skipEasies} onClick={() => run({ kind: 'skip', on: true }, () => saveSkipEasies(true), 'Easy problems are skipped.')}>On</button>
      </div>
    </article>
    {notice && <p role="status">{notice}</p>}
    {failed && <p role="alert">That could not be saved. <button type="button" onClick={retry}>Retry</button></p>}
  </div>;
}
