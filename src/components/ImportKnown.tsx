import { useEffect, useMemo, useRef, useState } from 'react';
import { importKnownProblems, removeImportedMarks } from '../db/importKnown';
import { markableProblems, removableImportIds } from '../services/importKnown';
import { IMPORT_MAX_DAYS, IMPORT_MIN_DAYS } from '../services/constants';
import { localDate } from '../services/reviews';
import type { Attempt, CatalogProblem, ProblemProgress } from '../types/models';
import { Overlay } from './Overlay';

type Action = 'mark' | 'undo';

interface ImportKnownProps {
  // The active set's problems (the same list the map and plan use).
  problems: CatalogProblem[];
  progress: ProblemProgress[];
  attempts: Attempt[];
  onClose: () => void;
}

function TopicCheckbox({ checked, indeterminate, disabled, onChange, label }: { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <label className="import-topic-label"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />{label}</label>;
}

// One-time "Mark problems you already know" screen. A mark is a progress row only:
// no attempt, so no XP, streak or badges. Reviews arrive 7-21 days out, spread so
// they never all come due on one day.
export function ImportKnown({ problems, progress, attempts, onClose }: ImportKnownProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<Action | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  const trackedIds = useMemo(() => new Set(progress.map((row) => row.problemId)), [progress]);
  const removable = useMemo(() => removableImportIds(trackedIds, attempts.map((attempt) => attempt.problemId)), [trackedIds, attempts]);
  const topics = useMemo(() => {
    const byTopic = new Map<string, CatalogProblem[]>();
    for (const problem of [...problems].sort((a, b) => a.neetcodeOrder - b.neetcodeOrder)) {
      byTopic.set(problem.primaryTopic, [...(byTopic.get(problem.primaryTopic) ?? []), problem]);
    }
    return [...byTopic.entries()];
  }, [problems]);

  const toggle = (ids: string[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  });

  const run = async (action: Action) => {
    setBusy(true);
    setMessage('');
    try {
      if (action === 'mark') {
        const chosen = markableProblems(problems.filter((problem) => selected.has(problem.id)), trackedIds);
        const result = await importKnownProblems(chosen, localDate());
        setSelected(new Set());
        setMessage(result.written === 0
          ? 'Nothing new to mark.'
          : `Marked ${result.written} ${result.written === 1 ? 'problem' : 'problems'} as known. Their first reviews arrive between ${result.first} and ${result.last}.`);
      } else {
        const removed = await removeImportedMarks();
        setConfirmUndo(false);
        setMessage(`Removed ${removed} imported ${removed === 1 ? 'mark' : 'marks'}.`);
      }
      setFailed(null);
    } catch {
      setFailed(action);
    } finally {
      setBusy(false);
    }
  };

  const chosenCount = problems.filter((problem) => selected.has(problem.id) && !trackedIds.has(problem.id)).length;

  return <Overlay label="Mark problems you already know" onClose={onClose}>
    <section className="import-known">
      <div className="section-heading"><div><p className="eyebrow">One-time setup</p><h2>Mark problems you already know</h2></div></div>
      <p>Tick the problems you have already solved. Each one is scheduled for a single review {IMPORT_MIN_DAYS} to {IMPORT_MAX_DAYS} days from today, spread out so they do not all land on one day. Marking earns no XP, streak or badges, and a topic's difficulty still starts from your first real attempts there.</p>
      {topics.map(([topic, topicProblems]) => {
        const open = topicProblems.filter((problem) => !trackedIds.has(problem.id));
        const picked = open.filter((problem) => selected.has(problem.id)).length;
        return <div key={topic} className="import-topic" role="group" aria-label={topic}>
          <div className="import-topic-head">
            <TopicCheckbox
              label={topic}
              checked={open.length > 0 && picked === open.length}
              indeterminate={picked > 0 && picked < open.length}
              disabled={open.length === 0}
              onChange={() => toggle(open.map((problem) => problem.id), picked < open.length)}
            />
            <span className="import-count">{open.length === 0 ? 'all tracked' : `${picked} of ${open.length} selected`}</span>
          </div>
          <div className="import-problems">
            {topicProblems.map((problem) => {
              const tracked = trackedIds.has(problem.id);
              return <label key={problem.id} className={tracked ? 'is-tracked' : undefined}>
                <input type="checkbox" checked={tracked || selected.has(problem.id)} disabled={tracked} onChange={(event) => toggle([problem.id], event.target.checked)} />
                <span>{problem.title}</span>
                <span className="import-problem-meta">{tracked ? 'already tracked' : problem.difficulty}</span>
              </label>;
            })}
          </div>
        </div>;
      })}
      {message && <p role="status">{message}</p>}
      {failed && <p role="alert">{failed === 'mark' ? 'The marks could not be saved.' : 'The marks could not be removed.'} <button type="button" onClick={() => void run(failed)}>Retry</button></p>}
      {removable.length > 0 && <div className="import-undo">
        {confirmUndo
          ? <><span>Remove {removable.length} {removable.length === 1 ? 'mark' : 'marks'}? Problems with attempts are kept.</span><button type="button" onClick={() => void run('undo')} disabled={busy}>Remove</button><button type="button" onClick={() => setConfirmUndo(false)}>Cancel</button></>
          : <button type="button" onClick={() => setConfirmUndo(true)}>Remove imported marks ({removable.length})</button>}
      </div>}
      <div className="import-actions">
        <button type="button" className="primary" disabled={chosenCount === 0 || busy} onClick={() => void run('mark')}>{chosenCount === 0 ? 'Mark as known' : `Mark ${chosenCount} as known`}</button>
      </div>
    </section>
  </Overlay>;
}
