import type { CatalogProblem } from '../types/models';
import type { DueReview, OptionalReason, ReviewQueueSections } from '../services/dailyPlan';
import { daysBetween } from '../services/cadence';
import { listTag } from '../services/coreRank';

interface ReviewQueueProps {
  sections: ReviewQueueSections;
  today: string;
  backupReminder: boolean;
  onStart: (problem: CatalogProblem) => void;
  onClose: () => void;
}

const OPTIONAL_REASONS: Record<OptionalReason, string> = {
  covered: 'Covered',
  parked: 'Above your level for now',
  later: 'After this topic\'s owed review'
};

function dueWords(nextReviewDate: string | null, today: string): string {
  if (nextReviewDate === null) return 'Due';
  const days = daysBetween(nextReviewDate, today);
  if (days <= 0) return 'Due today';
  return `Due ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function Row({ entry, today, note, onStart }: { entry: DueReview; today: string; note?: string; onStart: () => void }) {
  const { problem } = entry;
  const extraTopics = problem.topics.filter((topic) => topic !== problem.primaryTopic);
  return <li className="review-row">
    <div className="review-row-main">
      <button type="button" className="problem-link" onClick={onStart}><h3>{problem.title}</h3></button>
      <p>{problem.primaryTopic}{extraTopics.length > 0 && ` · ${extraTopics.join(', ')}`}{note && <span className="review-optional-note"> · {note}</span>}</p>
    </div>
    <span className={`badge badge-difficulty ${problem.difficulty}`}>{problem.difficulty}</span>
    {listTag(problem) && <span className="badge badge-list" title={`In the NeetCode ${listTag(problem)}`}>{listTag(problem)}</span>}
    <span className="review-row-due">{dueWords(entry.progress.nextReviewDate, today)}</span>
    <button type="button" className="review-row-start" onClick={onStart}>Start</button>
  </li>;
}

// The review queue as its own full-width screen (T25), in place of the map like
// the problem view: the reviews the plan owes first (weakest first), then the
// optional ones, collapsed, with why each can wait (T22). Start opens the
// problem in review mode, whose "Next review →" walks the rest of the queue.
export function ReviewQueue({ sections, today, backupReminder, onStart, onClose }: ReviewQueueProps) {
  const { owed, optional } = sections;
  const noteFor = (entry: ReviewQueueSections['optional'][number]) => entry.why === 'covered' && entry.coveredBy
    ? `${OPTIONAL_REASONS.covered}: you solved ${entry.coveredBy.title} since, same pattern`
    : entry.why === 'parked' ? `${OPTIONAL_REASONS.parked}: easier problems in this topic first` : OPTIONAL_REASONS.later;
  return <section className="review-queue" aria-label="Review queue">
    <div className="review-queue-head">
      <div>
        <p className="eyebrow">Review queue</p>
        <h2>{owed.length === 0 ? 'All caught up' : `${owed.length} ${owed.length === 1 ? 'review' : 'reviews'} due`}</h2>
        <p className="topic-panel-count">{owed.length > 0 ? 'Weakest first. ' : ''}{optional.length > 0 ? `${optional.length} more can wait.` : ''}</p>
      </div>
      <button type="button" className="topic-panel-close" onClick={onClose}>Back to the map</button>
    </div>
    {backupReminder && <p className="backup-reminder" role="note">It has been a while since your last backup. Export one from Settings.</p>}
    {owed.length === 0
      ? <p className="empty-state">Nothing due for review. You are caught up.</p>
      : <ol className="review-list">{owed.map((entry) => <Row key={entry.problem.id} entry={entry} today={today} onStart={() => onStart(entry.problem)} />)}</ol>}
    {optional.length > 0 && <details className="review-optional">
      <summary>Optional · {optional.length} kept fresh another way</summary>
      <ol className="review-list">{optional.map((entry) => <Row key={entry.problem.id} entry={entry} today={today} note={noteFor(entry)} onStart={() => onStart(entry.problem)} />)}</ol>
    </details>}
  </section>;
}
