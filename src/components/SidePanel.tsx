import type { CatalogProblem, ProgressStatus } from '../types/models';
import { STATUS_HINTS, STATUS_LABELS } from '../services/statusLabels';
import { listTag } from '../services/coreRank';

// The panel opened beside the topic map, and the full-screen views.
//
//  - topic:  the problems of one topic (from a map node) — side panel
//  - search: problems matching the workbench search box — side panel
//  - review: every problem due for review today (T22) — rendered full-screen
//    by `ReviewQueue.tsx` in place of the map since T25, not as a side panel.
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
  backupReminder: boolean;
  onSelectProblem: (problem: CatalogProblem, back: Panel) => void;
  onClose: () => void;
}

function ProblemRow({ problem, status, showTopic, onSelect }: {
  problem: CatalogProblem;
  status: ProgressStatus;
  showTopic: boolean;
  onSelect: () => void;
}) {
  // The primary topic once, then any others (the topics list repeats it).
  const extraTopics = problem.topics.filter((topic) => topic !== problem.primaryTopic);
  return <li className="catalog-row">
    <span className="order">{problem.neetcodeOrder}</span>
    <div>
      <button className="problem-link" type="button" onClick={onSelect}><h3>{problem.title}</h3></button>
      <p>{showTopic ? [problem.primaryTopic, ...extraTopics].join(' · ') : problem.topics.join(', ')}</p>
    </div>
    <div className="problem-meta">
      <span className={`badge badge-difficulty ${problem.difficulty}`}>{problem.difficulty}</span>
      {listTag(problem) && <span className="badge badge-list" title={`In the NeetCode ${listTag(problem)}`}>{listTag(problem)}</span>}
      <span className={`badge badge-status status-${status}`} title={STATUS_HINTS[status]}>{STATUS_LABELS[status]}</span>
    </div>
  </li>;
}

export function SidePanel({ panel, problems, progressByProblem, backupReminder, onSelectProblem, onClose }: SidePanelProps) {
  // `problem` and `review` never reach here — Workbench renders them full-screen.
  if (panel.kind === 'problem' || panel.kind === 'review') return null;

  const reminder = backupReminder ? <p className="backup-reminder" role="note">It has been a while since your last backup. Export one from Settings.</p> : null;

  const statusOf = (problem: CatalogProblem) => progressByProblem.get(problem.id) ?? 'not_started';

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
