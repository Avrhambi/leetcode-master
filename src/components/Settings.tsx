import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { saveProblemSet } from '../db/problemSet';
import { ProblemSetPicker } from './ProblemSetPicker';
import { parseProblemSet, problemsInSet, PROBLEM_SETS } from '../services/problemSet';
import type { ProblemList } from '../types/models';
import { isStoragePersistent } from '../pwa';
import { createBackupPayload, resetAndReseed, restoreBackup } from '../db/backup';

type Action = 'export' | 'restore' | 'reset' | null;

export function Settings() {
  const [confirmation, setConfirmation] = useState('');
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [failedAction, setFailedAction] = useState<Action>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => { void isStoragePersistent().then(setPersistent); }, []);
  const storedSet = useLiveQuery(() => db.settings.get('problemSet'), []);
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
    try {
      const payload = await createBackupPayload();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'leetcode-tracker-backup.json';
      link.click();
      URL.revokeObjectURL(url);
      succeed('Backup exported.');
    } catch (reason) { fail('export', reason); }
  };
  const importBackup = async (file: File) => {
    try { await restoreBackup(file); succeed('Backup restored.'); } catch (reason) { fail('restore', reason); }
  };
  const reset = async () => {
    try { await resetAndReseed(); setConfirmation(''); succeed('All data was reset.'); } catch (reason) { fail('reset', reason); }
  };
  const retry = () => {
    if (failedAction === 'export') void exportBackup();
    if (failedAction === 'restore' && lastFile) void importBackup(lastFile);
    if (failedAction === 'reset') void reset();
  };

  return <section className="settings"><div className="section-heading"><div><p className="eyebrow">Your data</p><h2>Settings</h2></div></div>
    <p className="settings-note">LeetCode Tracker is local-first. Your practice history stays in this browser.</p>
    <article><h3>Problem set</h3><p>Choose how much of the catalog to practise. Your history is kept when you switch; problems outside the set are hidden and not recommended, but any already due for review stay in the review queue.</p><ProblemSetPicker value={parseProblemSet(storedSet?.value)} counts={counts} onChange={(set) => void saveProblemSet(set)} /></article>
    <article><h3>Storage</h3><p role="status">{persistent === null ? 'Storage persistence is not supported by this browser.' : persistent ? 'Storage: persistent.' : 'Storage: may be cleared by the browser.'} Export a backup regularly.</p></article>
    <article><h3>Export backup</h3><p>Download all local study data as JSON.</p><button type="button" onClick={() => void exportBackup()}>Export JSON</button></article>
    <article><h3>Restore backup</h3><p>Replace local study data with a JSON backup file (up to 5 MB).</p><input aria-label="Backup JSON file" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0] ?? null; setLastFile(file); if (file) void importBackup(file); }} /></article>
    <article><h3>Reset all data</h3><p>Type <code>RESET</code> to erase study data and reseed the catalog.</p><label>Confirmation<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button type="button" disabled={confirmation !== 'RESET'} onClick={() => void reset()}>Reset all data</button></article>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={retry}>Retry</button></p>}
  </section>;
}
