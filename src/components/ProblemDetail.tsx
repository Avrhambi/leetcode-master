import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { CatalogProblem, HelpType } from '../types/models';
import { STATUS_HINTS, STATUS_LABELS } from '../services/statusLabels';
import { listTag } from '../services/coreRank';
import { latestNotes } from '../services/reviewNotes';
import { AttemptForm } from './AttemptForm';
import { useAttemptTimer } from '../hooks/useAttemptTimer';
import { lightReviewEligible, localDate } from '../services/reviews';

const helpTypeLabels: Record<HelpType, string> = {
  small_hint: 'nudge',
  pattern_identification: 'pattern hint',
  pseudocode: 'pseudocode',
  full_code: 'full solution',
  solution_video: 'walkthrough video'
};

export function ProblemDetail({ problem, onBack, chain, nextInChain, onNext }: {
  problem: CatalogProblem;
  onBack: () => void;
  // The three below are set only when this problem was opened from the review
  // queue or today's challenge (T25): after an attempt is logged, the user can
  // jump straight to the next open problem of that list (or see that it is done)
  // without bouncing back to it. `nextInChain` is `null` once nothing is left.
  chain?: 'review' | 'plan';
  nextInChain?: CatalogProblem | null;
  onNext?: (problem: CatalogProblem) => void;
}) {
  const attempts = useLiveQuery(() => db.attempts.where('problemId').equals(problem.id).reverse().sortBy('createdAt'), [problem.id]);
  const progress = useLiveQuery(() => db.progress.get(problem.id), [problem.id]);
  const [message, setMessage] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  // Reset the post-save "Next review" prompt whenever a different problem loads
  // (the component instance is reused when chaining through the review queue).
  useEffect(() => { setJustSaved(false); setMessage(''); }, [problem.id]);
  const timer = useAttemptTimer(problem.id);
  function saved() { timer.clear(); setMessage('Attempt saved.'); setJustSaved(true); window.setTimeout(() => setMessage(''), 2000); }
  const status = progress?.status ?? 'not_started';
  const lastNote = attempts ? latestNotes(attempts).get(problem.id) : undefined;
  return <section className="problem-detail"><div className="problem-detail-nav"><button type="button" onClick={onBack}>{chain === 'plan' ? "Back to today's challenge" : 'Back'}</button>{chain && justSaved && (nextInChain
    ? <button type="button" className="next-review" onClick={() => onNext?.(nextInChain)}>{chain === 'plan' ? "Next in today's challenge" : 'Next review'}: {nextInChain.title} →</button>
    : <span className="review-cleared">{chain === 'plan' ? "Today's challenge done ✓" : 'Review queue clear ✓'}</span>)}</div><p className="eyebrow">{problem.primaryTopic}</p><h1>{problem.title}</h1><div className="badge-row"><span className={`badge badge-difficulty ${problem.difficulty}`}>{problem.difficulty}</span>{listTag(problem) && <span className="badge badge-list" title={`In the NeetCode ${listTag(problem)}`}>{listTag(problem)}</span>}<span className={`badge badge-status status-${status}`} title={STATUS_HINTS[status]}>{STATUS_LABELS[status]}</span>{progress?.struggling && <span className="badge badge-struggling">needs a different approach</span>}</div><p>{problem.topics.join(', ')}</p><p className="solve-links"><a className="solve-button" href={problem.leetcodeUrl} target="_blank" rel="noreferrer">Solve on LeetCode</a><a className="solve-button" href={problem.neetcodeUrl} target="_blank" rel="noreferrer">Solve on NeetCode</a>{timer.running
    ? <span className="timer-running" role="timer" aria-label={`Attempt timer, ${timer.minutes} minutes`}><span>Timer {timer.minutes} min</span><button type="button" onClick={timer.clear}>Discard</button></span>
    : <button type="button" className="solve-button" onClick={timer.start}>Start timer</button>}</p>{progress && <p>Next review: {progress.nextReviewDate ?? 'Mastered'}</p>}{lastNote && <p className="review-note"><span>Your last note:</span> {lastNote}</p>}{message && <p role="status">{message}</p>}<AttemptForm problemId={problem.id} onSaved={saved} lightReviewOffered={lightReviewEligible(progress, localDate())} timerMinutes={timer.minutes} /><h2>Attempt history</h2>{!attempts ? <p>Loading attempts…</p> : attempts.length === 0 ? <p>No attempts yet.</p> : <ol className="attempt-list">{attempts.map((attempt) => <li key={attempt.id}><strong>{attempt.attemptedOn}</strong> · {attempt.mock && <>mock interview{attempt.mock.testsTotal !== null && ` (${attempt.mock.testsPassed} of ${attempt.mock.testsTotal} tests)`}{attempt.mock.overTime && ', over time'} · </>}{attempt.lightReview ? 'recalled the approach' : attempt.outcome.replaceAll('_', ' ')} · {attempt.quality}{attempt.helpType && <> · looked up {helpTypeLabels[attempt.helpType]}</>}{attempt.durationMinutes !== null && <> · {attempt.durationMinutes} min</>}{attempt.notes && <p className="attempt-notes">{attempt.notes}</p>}</li>)}</ol>}</section>;
}
