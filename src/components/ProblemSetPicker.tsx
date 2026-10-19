import { PROBLEM_SETS, PROBLEM_SET_LABELS } from '../services/problemSet';
import type { ProblemList } from '../types/models';

interface ProblemSetPickerProps {
  value: ProblemList;
  counts: Record<ProblemList, number>;
  onChange: (set: ProblemList) => void;
  // True until the user has made a choice, so the first-launch banner can show
  // that nothing is selected yet instead of silently implying the default.
  unchosen?: boolean;
}

// A one-line segmented control, shared by the first-launch banner and Settings.
export function ProblemSetPicker({ value, counts, onChange, unchosen = false }: ProblemSetPickerProps) {
  return <div className="problem-set-picker" role="group" aria-label="Problem set">
    {PROBLEM_SETS.map((set) => <button
      key={set}
      type="button"
      aria-pressed={!unchosen && value === set}
      onClick={() => onChange(set)}
    >{PROBLEM_SET_LABELS[set]} <span className="problem-set-count">{counts[set]}</span></button>)}
  </div>;
}
