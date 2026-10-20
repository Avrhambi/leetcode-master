import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { saveProblemSet } from '../db/problemSet';
import { saveWeeklyGoal } from '../db/weeklyGoal';
import { parseWeeklyGoal } from '../services/streak';
import { WEEKLY_GOAL_OPTIONS } from '../services/constants';
import { ProblemSetPicker } from './ProblemSetPicker';
import { parseProblemSet, problemsInSet, PROBLEM_SETS } from '../services/problemSet';
import type { BackupPayload, ProblemList } from '../types/models';
import { isStoragePersistent, requestPersistentStorage } from '../pwa';
import { createBackupPayload, parseBackupFile, recordBackup, resetAndReseed, restoreBackup } from '../db/backup';
import { backupFileName, lastBackupLabel, restoreSummaryText } from '../services/backupHealth';
import { localDate } from '../services/reviews';
import { buildReminderIcs, defaultReminderDays, deployedAppUrl, isReminderTime, REMINDER_FILE_NAME, WEEKDAYS, type Weekday } from '../services/calendar';
import { REMINDER_DEFAULT_MINUTES, REMINDER_DEFAULT_TIME } from '../services/constants';
import { parseSessionBudget } from '../services/sessionTime';

type Action = 'export' | 'restore' | 'reset' | null;

async function downloadBackup(): Promise<void> {
  const payload = await createBackupPayload();
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(localDate());
  link.click();
  URL.revokeObjectURL(url);
  await recordBackup(localDate());
}

// Nothing here is stored: the days and time live in component state and the .ics is
// built on demand. The days start from the weekly goal; the length is the time budget.
function CalendarReminder({ weeklyGoal }: { weeklyGoal: number | null }) {
  const [picked, setPicked] = useState<Weekday[] | null>(null);
  const [time, setTime] = useState(REMINDER_DEFAULT_TIME);
  const [failed, setFailed] = useState(false);
  const budget = useLiveQuery(() => db.settings.get('sessionMinutes'), []);
  const budgetMinutes = parseSessionBudget(budget?.value);
  const minutes = budgetMinutes ?? REMINDER_DEFAULT_MINUTES;
  const days = picked ?? defaultReminderDays(weeklyGoal);
  const toggle = (code: Weekday) => setPicked(days.includes(code) ? days.filter((day) => day !== code) : [...days, code]);
  const download = () => {
    try {
      const text = buildReminderIcs({ days, time, startDate: localDate(), durationMinutes: minutes, appUrl: deployedAppUrl(window.location.href) });
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = REMINDER_FILE_NAME;
      link.click();
      URL.revokeObjectURL(url);
      setFailed(false);
    } catch { setFailed(true); }
  };
  return <article><h3>Add practice reminder to my calendar</h3><p>Pick the days and the time, then download a calendar file that repeats every week ({minutes} minutes{budgetMinutes ? ', your time budget' : ''}). Open it in your calendar app to add the event. Nothing is saved here; to change it later, delete the event in your calendar and download a new file.</p>
    <div className="problem-set-picker reminder-days" role="group" aria-label="Reminder days">
      {WEEKDAYS.map((day) => <button key={day.code} type="button" aria-label={day.name} aria-pressed={days.includes(day.code)} onClick={() => toggle(day.code)}>{day.label}</button>)}
    </div>
    <label className="reminder-time">Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
    <button type="button" disabled={days.length === 0 || !isReminderTime(time)} onClick={download}>Download .ics</button>
    {failed && <p role="alert">The calendar file could not be created. <button type="button" onClick={download}>Retry</button></p>}</article>;
}

export function Settings({ onImportKnown }: { onImportKnown?: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [failedAction, setFailedAction] = useState<Action>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // A validated file waiting for the user to confirm replacing their data.
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [summary, setSummary] = useState('');
  const [persistent, setPersistent] = useState<boolean | null | undefined>(undefined);
  useEffect(() => { void isStoragePersistent().then((current) => (current === false ? requestPersistentStorage() : current)).then(setPersistent); }, []);
  const persistenceText = persistent === undefined ? '' : persistent === null ? 'Storage persistence is not supported by this browser.' : persistent ? 'Storage: persistent.' : 'Storage: may be cleared by the browser.';
  const storedSet = useLiveQuery(() => db.settings.get('problemSet'), []);
  const storedGoal = useLiveQuery(() => db.settings.get('weeklyGoalDays'), []);
  const weeklyGoal = parseWeeklyGoal(storedGoal?.value);
  const [goalError, setGoalError] = useState<number | null | undefined>(undefined);
  const chooseGoal = (days: number | null) => { setGoalError(undefined); void saveWeeklyGoal(days).catch(() => setGoalError(days)); };
  const lastBackup = useLiveQuery(() => db.settings.get('lastBackupOn'), []);
  const catalogRows = useLiveQuery(() => db.problems.toArray(), []);
  const counts = Object.fromEntries(PROBLEM_SETS.map((set) => [set, catalogRows ? problemsInSet(catalogRows, set).length : 0])) as Record<ProblemList, number>;

  const succeed = (text: string) => {
    setFailedAction(null);
    setError('');
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2000);
  };
  const fail = (action: Exclude<Action, null>, reason: unknown) => {
    setMessage('');
    setFailedAction(action);
    setError(reason instanceof Error ? reason.message : 'That action could not be completed.');
  };
  const exportBackup = async () => {
    try { await downloadBackup(); succeed('Backup exported.'); } catch (reason) { fail('export', reason); }
  };
  const chooseBackup = async (file: File) => {
    setSummary('');
    try { setPending(await parseBackupFile(file)); setFailedAction(null); setError(''); } catch (reason) { setPending(null); fail('restore', reason); }
  };
  const confirmRestore = async () => {
    if (!pending) return;
    try {
      const result = await restoreBackup(pending);
      setPending(null);
      setLastFile(null);
      setFailedAction(null);
      setError('');
      setSummary(restoreSummaryText(result));
    } catch (reason) { fail('restore', reason); }
  };
  const downloadCurrent = async () => {
    try { await downloadBackup(); succeed('Current data downloaded.'); } catch (reason) { fail('export', reason); }
  };
  const reset = async () => {
    try { await resetAndReseed(); setConfirmation(''); succeed('All data was reset.'); } catch (reason) { fail('reset', reason); }
  };
  const retry = () => {
    if (failedAction === 'export') void exportBackup();
    if (failedAction === 'restore') { if (pending) void confirmRestore(); else if (lastFile) void chooseBackup(lastFile); }
    if (failedAction === 'reset') void reset();
  };

  return <section className="settings"><div className="section-heading"><div><p className="eyebrow">Your data</p><h2>Settings</h2></div></div>
    <p className="settings-note">LeetCode Master is local-first. Your practice history stays in this browser.</p>
    <article><h3>Problem set</h3><p>Choose how much of the catalog to practise. Your history is kept when you switch; problems outside the set are hidden and not recommended, but any already due for review stay in the review queue.</p><ProblemSetPicker value={parseProblemSet(storedSet?.value)} counts={counts} onChange={(set) => void saveProblemSet(set)} /></article>
    <article><h3>Weekly goal</h3><p>Pick how many days a week you want to practise. Your progress shows beside the weekly streak. It is a target for you; it never changes your plan or your XP.</p>
      <div className="problem-set-picker" role="group" aria-label="Practice days per week">
        <button type="button" aria-pressed={weeklyGoal === null} onClick={() => chooseGoal(null)}>Off</button>
        {WEEKLY_GOAL_OPTIONS.map((days) => <button key={days} type="button" aria-pressed={weeklyGoal === days} onClick={() => chooseGoal(days)}>{days} {days === 1 ? 'day' : 'days'}</button>)}
      </div>
      {goalError !== undefined && <p role="alert">The goal could not be saved. <button type="button" onClick={() => chooseGoal(goalError)}>Retry</button></p>}</article>
    <CalendarReminder weeklyGoal={weeklyGoal} />
    <article><h3>Storage</h3><p role="status">{persistenceText} Export a backup regularly. {lastBackupLabel(lastBackup?.value, localDate())}.</p></article>
    <article><h3>Export backup</h3><p>Download all local study data as JSON.</p><button type="button" onClick={() => void exportBackup()}>Export JSON</button></article>
    <article><h3>Restore backup</h3><p>Replace local study data with a JSON backup file (up to 5 MB).</p><input aria-label="Backup JSON file" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0] ?? null; setLastFile(file); setPending(null); if (file) void chooseBackup(file); }} />
      {pending && <div role="group" aria-label="Confirm restore"><p>This file has {pending.attempts.length} attempts. Restoring replaces everything stored in this browser.</p>
        <button type="button" onClick={() => void downloadCurrent()}>Download current data first</button>{' '}
        <button type="button" onClick={() => void confirmRestore()}>Replace my data</button>{' '}
        <button type="button" onClick={() => setPending(null)}>Cancel</button></div>}
      {summary && <p role="status">{summary}</p>}</article>
    {onImportKnown && <article><h3>Import prior history</h3><p>Already solved some of the list? Mark those problems as known so they come back for review instead of as new. Marking earns no XP, streak or badges.</p><button type="button" onClick={onImportKnown}>Mark problems you already know</button></article>}
    <article><h3>Reset all data</h3><p>Type <code>RESET</code> to erase study data and reseed the catalog.</p><label>Confirmation<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button type="button" disabled={confirmation !== 'RESET'} onClick={() => void reset()}>Reset all data</button></article>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={retry}>Retry</button></p>}
  </section>;
}
