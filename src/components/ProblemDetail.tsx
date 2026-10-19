import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CatalogProblem, HelpType } from '../types/models';
import { STATUS_HINTS, STATUS_LABELS } from '../services/statusLabels';
import { listTag } from '../services/coreRank';
import { AttemptForm } from './AttemptForm';

const helpTypeLabels: Record<HelpType, string> = {
  small_hint: 'nudge',
  pattern_identification: 'pattern hint',
  pseudocode: 'pseudocode',
  full_code: 'full solution',
  solution_video: 'walkthrough video'
};

export function ProblemDetail({ problem, onBack, reviewMode, nextInReview, onNextReview }: {
  problem: CatalogProblem;
  onBack: () => void;
  // The three below are set only when this problem was opened from the review
  // queue: after an attempt is logged, the user can jump straight to the next
  // still-due problem (or see that the queue is clear) without bouncing back to
  // the list. `nextInReview` is `null` once nothing else is due.
  reviewMode?: boolean;
  nextInReview?: CatalogProblem | null;
  onNextReview?: (problem: CatalogProblem) => void;
}) {
  const attempts = useLiveQuery(() => db.attempts.where('problemId').equals(problem.id).reverse().sortBy('createdAt'), [problem.id]);
  const progress = useLiveQuery(() => db.progress.get(problem.id), [problem.id]);
  const [message, setMessage] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  // Reset the post-save "Next review" prompt whenever a different problem loads
  // (the component instance is reused when chaining through the review queue).
  useEffect(() => { setJustSaved(false); setMessage(''); }, [problem.id]);
  function saved() { setMessage('Attempt saved.'); setJustSaved(true); window.setTimeout(() => setMessage(''), 2000); }
  const status = progress?.status ?? 'not_started';
  return <section className="problem-detail"><div className="problem-detail-nav"><button type="button" onClick={onBack}>Back</button>{reviewMode && justSaved && (nextInReview
    ? <button type="button" className="next-review" onClick={() => onNextReview?.(nextInReview)}>Next review: {nextInReview.title} →</button>
    : <span className="review-cleared">Review queue clear ✓</span>)}</div><p className="eyebrow">{problem.primaryTopic}</p><h1>{problem.title}</h1><div className="badge-row"><span className={`badge badge-difficulty ${problem.difficulty}`}>{problem.difficulty}</span>{listTag(problem) && <span className="badge badge-list" title={`In the NeetCode ${listTag(problem)}`}>{listTag(problem)}</span>}<span className={`badge badge-status status-${status}`} title={STATUS_HINTS[status]}>{STATUS_LABELS[status]}</span>{progress?.struggling && <span className="badge badge-struggling">needs a different approach</span>}</div><p>{problem.topics.join(', ')}</p><p className="solve-links"><a className="solve-button" href={problem.leetcodeUrl} target="_blank" rel="noreferrer">Solve on LeetCode</a><a className="solve-button" href={problem.neetcodeUrl} target="_blank" rel="noreferrer">Solve on NeetCode</a></p>{progress && <p>Next review: {progress.nextReviewDate ?? 'Mastered'}</p>}{message && <p role="status">{message}</p>}<AttemptForm problemId={problem.id} onSaved={saved} /><h2>Attempt history</h2>{!attempts ? <p>Loading attempts…</p> : attempts.length === 0 ? <p>No attempts yet.</p> : <ol className="attempt-list">{attempts.map((attempt) => <li key={attempt.id}><strong>{attempt.attemptedOn}</strong> · {attempt.outcome.replaceAll('_', ' ')} · {attempt.quality}{attempt.helpType && <> · looked up {helpTypeLabels[attempt.helpType]}</>}{attempt.durationMinutes !== null && <> · {attempt.durationMinutes} min</>}{attempt.notes && <p className="attempt-notes">{attempt.notes}</p>}</li>)}</ol>}</section>;
}
