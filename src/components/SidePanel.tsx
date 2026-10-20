import type { CatalogProblem, ProgressStatus } from '../types/models';
import { STATUS_HINTS, STATUS_LABELS } from '../services/statusLabels';
import { listTag } from '../services/coreRank';
import type { OptionalReason, ReviewQueueSections } from '../services/dailyPlan';

// The panel opened beside the topic map, and the full-screen problem view.
//
//  - topic:  the problems of one topic (from a map node) — side panel
//  - search: problems matching the workbench search box — side panel
//  - review: every problem due for review today — the reviews the plan owes
//    first (weakest first), then the optional ones with why they can wait
//    (T22). The "work through the whole review queue" surface. Side panel.
//  - problem: one problem's detail (attempt form + history), reached from either
//    list or from the daily challenge. This one is NOT a side panel: `Workbench`
//    renders it full-bleed in place of the map, so working on a problem gets the
//    whole screen. `back` carries the list it was opened from, which the Back
//    button returns to; it is null when opened from the daily challenge, so Back
//    returns to the bare map.
export type Panel =
  | { kind: 'topic'; topic: string }
  | { kind: 'search'; query: string }
  | { kind: 'review' }
  | { kind: 'problem'; problem: CatalogProblem; back: Panel | null };

interface SidePanelProps {
  panel: Panel;
  problems: CatalogProblem[];
  progressByProblem: Map<string, ProgressStatus>;
  reviewSections: ReviewQueueSections;
  backupReminder: boolean;
  onSelectProblem: (problem: CatalogProblem, back: Panel) => void;
  onClose: () => void;
}

const OPTIONAL_REASONS: Record<OptionalReason, string> = {
  covered: 'Covered',
  parked: 'Above your level for now',
  later: 'After this topic\'s owed review'
};

function ProblemRow({ problem, status, showTopic, onSelect, note }: {
  problem: CatalogProblem;
  status: ProgressStatus;
  showTopic: boolean;
  onSelect: () => void;
  note?: string;
}) {
  return <li className="catalog-row">
    <span className="order">{problem.neetcodeOrder}</span>
    <div>
      <button className="problem-link" type="button" onClick={onSelect}><h3>{problem.title}</h3></button>
      <p>{showTopic ? `${problem.primaryTopic} · ${problem.topics.join(', ')}` : problem.topics.join(', ')}</p>
      {note && <p className="review-optional-note">{note}</p>}
    </div>
    <div className="problem-meta">
      <span className={`badge badge-difficulty ${problem.difficulty}`}>{problem.difficulty}</span>
      {listTag(problem) && <span className="badge badge-list" title={`In the NeetCode ${listTag(problem)}`}>{listTag(problem)}</span>}
      <span className={`badge badge-status status-${status}`} title={STATUS_HINTS[status]}>{STATUS_LABELS[status]}</span>
    </div>
  </li>;
}

export function SidePanel({ panel, problems, progressByProblem, reviewSections, backupReminder, onSelectProblem, onClose }: SidePanelProps) {
  // `problem` never reaches here — Workbench renders it full-screen instead.
  if (panel.kind === 'problem') return null;

  const reminder = backupReminder ? <p className="backup-reminder" role="note">It has been a while since your last backup. Export one from Settings.</p> : null;

  const statusOf = (problem: CatalogProblem) => progressByProblem.get(problem.id) ?? 'not_started';

  if (panel.kind === 'review') {
    const { owed, optional } = reviewSections;
    const noteFor = (entry: ReviewQueueSections['optional'][number]) => entry.why === 'covered' && entry.coveredBy
      ? `${OPTIONAL_REASONS.covered}: you solved ${entry.coveredBy.title} since, same pattern`
      : entry.why === 'parked' ? `${OPTIONAL_REASONS.parked}: easier problems in this topic first` : OPTIONAL_REASONS.later;
    return <aside className="topic-panel" aria-label="Review queue">
      <div className="topic-panel-head">
        <div>
          <p className="eyebrow">Review queue</p>
          <p className="topic-panel-count">{owed.length} due{owed.length > 0 ? ' · weakest first' : ''}{optional.length > 0 ? ` · ${optional.length} optional` : ''}</p>
        </div>
        <button type="button" className="topic-panel-close" onClick={onClose} aria-label="Close review queue">Close</button>
      </div>
      {reminder}
      {owed.length === 0
        ? <p className="empty-state">Nothing due for review. You are caught up.</p>
        : <ol className="catalog-list">
            {owed.map(({ problem }) => <ProblemRow
              key={problem.id}
              problem={problem}
              status={statusOf(problem)}
              showTopic
              onSelect={() => onSelectProblem(problem, panel)}
            />)}
          </ol>}
      {optional.length > 0 && <>
        <p className="eyebrow review-optional-head">Optional · the pattern is kept fresh another way</p>
        <ol className="catalog-list">
          {optional.map((entry) => <ProblemRow
            key={entry.problem.id}
            problem={entry.problem}
            status={statusOf(entry.problem)}
            showTopic
            note={noteFor(entry)}
            onSelect={() => onSelectProblem(entry.problem, panel)}
          />)}
        </ol>
      </>}
    </aside>;
  }

  if (panel.kind === 'search') {
    const query = panel.query.trim().toLowerCase();
    const matches = query === ''
      ? []
      : problems
          .filter((problem) => `${problem.title} ${problem.topics.join(' ')}`.toLowerCase().includes(query))
          .sort((a, b) => a.neetcodeOrder - b.neetcodeOrder);
    return <aside className="topic-panel" aria-label="Search results">
      <div className="topic-panel-head">
        <div>
          <p className="eyebrow">Search</p>
          <p className="topic-panel-count">{matches.length} of {problems.length}</p>
        </div>
        <button type="button" className="topic-panel-close" onClick={onClose} aria-label="Close search results">Close</button>
      </div>
      {reminder}
      {matches.length === 0
        ? <p className="empty-state">No matching problems.</p>
        : <ol className="catalog-list">
            {matches.map((problem) => <ProblemRow
              key={problem.id}
              problem={problem}
              status={statusOf(problem)}
              showTopic
              onSelect={() => onSelectProblem(problem, panel)}
            />)}
          </ol>}
    </aside>;
  }

  const topicProblems = problems
    .filter((problem) => problem.primaryTopic === panel.topic)
    .sort((a, b) => a.neetcodeOrder - b.neetcodeOrder);
  const attempted = topicProblems.filter((problem) => statusOf(problem) !== 'not_started').length;

  return <aside className="topic-panel" aria-label={`${panel.topic} problems`}>
    <div className="topic-panel-head">
      <div>
        <p className="eyebrow">{panel.topic}</p>
        <p className="topic-panel-count">{attempted} / {topicProblems.length} attempted</p>
      </div>
      <button type="button" className="topic-panel-close" onClick={onClose} aria-label="Close topic panel">Close</button>
    </div>
    {reminder}
    <ol className="catalog-list">
      {topicProblems.map((problem) => <ProblemRow
        key={problem.id}
        problem={problem}
        status={statusOf(problem)}
        showTopic={false}
        onSelect={() => onSelectProblem(problem, panel)}
      />)}
    </ol>
  </aside>;
}
