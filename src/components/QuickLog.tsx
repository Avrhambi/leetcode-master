import { useEffect, useState } from 'react';
import type { CatalogProblem } from '../types/models';
import { useAttemptTimer } from '../hooks/useAttemptTimer';
import { saveAttempt } from '../db/saveAttempt';
import { saveAttemptNote, undoAttempt } from '../db/undoAttempt';
import { localDate } from '../services/reviews';
import { QUICK_LOG_CHOICES, quickLogInput, quickLogLabel, type QuickLogChoice } from '../services/quickLog';
import type { AttemptUndoSnapshot } from '../services/attemptUndo';
import { QUICK_LOG_UNDO_SECONDS } from '../services/constants';

type Failure = { kind: 'save'; choice: QuickLogChoice } | { kind: 'undo' } | { kind: 'note' } | { kind: 'refused' };

// Three one-tap outcome buttons on a plan item, then "Logged · add a note" and
// a short Undo. Saving goes through `saveAttempt` (one transaction); the attempt
// timer's minutes ride along if one is running for this problem.
export function QuickLog({ problem, completed }: { problem: CatalogProblem; completed: boolean }) {
  const timer = useAttemptTimer(problem.id);
  const [snapshot, setSnapshot] = useState<AttemptUndoSnapshot | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  // The Undo window closes by itself; the note stays open for the page's life.
  useEffect(() => {
    if (!undoOpen) return undefined;
    const id = window.setTimeout(() => setUndoOpen(false), QUICK_LOG_UNDO_SECONDS * 1000);
    return () => window.clearTimeout(id);
  }, [undoOpen, snapshot]);

  async function log(choice: QuickLogChoice) {
    setBusy(true);
    setFailure(null);
    try {
      const saved = await saveAttempt(quickLogInput(choice, { problemId: problem.id, attemptedOn: localDate(), timerMinutes: timer.minutes }));
      timer.clear();
      setSnapshot(saved);
      setUndoOpen(true);
      setNote('');
      setNoteOpen(false);
      setNoteSaved(false);
    } catch {
      setFailure({ kind: 'save', choice });
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!snapshot) return;
    setBusy(true);
    setFailure(null);
    try {
      if (await undoAttempt(snapshot)) {
        setSnapshot(null);
        setUndoOpen(false);
        setNoteOpen(false);
      } else {
        setUndoOpen(false);
        setFailure({ kind: 'refused' });
      }
    } catch {
      setFailure({ kind: 'undo' });
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!snapshot) return;
    setBusy(true);
    setFailure(null);
    try {
      await saveAttemptNote(snapshot.attemptId, note);
      setNoteOpen(false);
      setNoteSaved(true);
    } catch {
      setFailure({ kind: 'note' });
    } finally {
      setBusy(false);
    }
  }

  const retry = () => {
    if (failure?.kind === 'save') void log(failure.choice);
    else if (failure?.kind === 'undo') void undo();
    else if (failure?.kind === 'note') void saveNote();
  };
  const alert = failure && (failure.kind === 'refused'
    ? <p role="alert">Can't undo: something else was logged for this problem since.</p>
    : <p role="alert">{failure.kind === 'save' ? 'The attempt could not be saved.' : failure.kind === 'undo' ? 'The undo could not be saved.' : 'The note could not be saved.'} <button type="button" onClick={retry}>Retry</button></p>);

  if (snapshot && completed) {
    return <div className="quick-log-done">
      <p className="quick-log-status" role="status">Logged · {noteSaved ? 'note saved' : <button type="button" className="quick-log-link" onClick={() => setNoteOpen(true)}>add a note</button>}{undoOpen && <> <button type="button" className="quick-log-undo" disabled={busy} onClick={() => void undo()}>Undo</button></>}</p>
      {noteOpen && <form className="quick-log-note" onSubmit={(event) => { event.preventDefault(); void saveNote(); }}>
        <label>Note for your next attempt <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} autoFocus /></label>
        <span className="quick-log-note-actions"><button type="submit" disabled={busy || note.trim() === ''}>Save note</button><button type="button" disabled={busy} onClick={() => setNoteOpen(false)}>Cancel</button></span>
      </form>}
      {alert}
    </div>;
  }
  if (completed) return null;
  return <div className="quick-log">
    <div role="group" aria-label={`Log ${problem.title}`} className="quick-log-buttons">
      {QUICK_LOG_CHOICES.map((choice) => <button type="button" key={choice} disabled={busy} onClick={() => void log(choice)}>{quickLogLabel(choice)}</button>)}
    </div>
    {timer.running && <p className="quick-log-timer">Timer running: {timer.minutes} min will be logged.</p>}
    {alert}
  </div>;
}
