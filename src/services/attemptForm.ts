import type { HelpType, Outcome, PerceivedDifficulty } from '../types/models';

// Outcome and help-type labels shown in the form. 'pseudocode' is offered only
// after a hinted solve (watching a solution means seeing code or a video), so
// no two outcomes list the same help.
export const outcomeLabels: Record<Outcome, string> = {
  solved_independently: 'Solved it without any help',
  solved_with_hint: 'Solved it with a hint',
  watched_solution: 'Read or watched the solution',
  could_not_solve: 'Did not solve it'
};

export const difficultyLabels: Record<PerceivedDifficulty, string> = {
  easy: 'Easy: I saw the approach right away',
  manageable: 'Manageable: it took some thinking',
  hard: 'Hard: I barely got there'
};

export const helpTypeLabels: Record<HelpType, string> = {
  small_hint: 'A small nudge',
  pattern_identification: 'Which pattern or technique to use',
  pseudocode: 'The approach written as pseudocode',
  full_code: 'The full solution code',
  solution_video: 'A video walkthrough'
};

// Which secondary answers make sense for each outcome. An outcome with no
// `difficulties` hides the "how hard did it feel" field (and 'hard' is saved,
// since these outcomes are already weak); an outcome with no `helpTypes` hides
// the help-type field.
export const outcomeOptions: Record<Outcome, { difficulties?: PerceivedDifficulty[]; helpTypes?: HelpType[] }> = {
  solved_independently: { difficulties: ['easy', 'manageable', 'hard'] },
  solved_with_hint: { difficulties: ['manageable', 'hard'], helpTypes: ['small_hint', 'pattern_identification', 'pseudocode'] },
  watched_solution: { helpTypes: ['full_code', 'solution_video'] },
  could_not_solve: {}
};

// Difficulty choices once the help is known. Being handed the whole approach as
// pseudocode cannot feel "manageable", so that pair is not offered.
export function difficultiesFor(outcome: Outcome, helpType: HelpType | '' = ''): PerceivedDifficulty[] | undefined {
  const allowed = outcomeOptions[outcome].difficulties;
  if (allowed && outcome === 'solved_with_hint' && helpType === 'pseudocode') return ['hard'];
  return allowed;
}

// The perceivedDifficulty to persist for a save. When the field is hidden for
// this outcome we store 'hard' (still maps to 'weak', and matches "this was a
// struggle"); otherwise we snap an out-of-range selection to the first allowed
// option.
export function resolvePerceivedDifficulty(outcome: Outcome, selected: PerceivedDifficulty, helpType: HelpType | '' = ''): PerceivedDifficulty {
  const allowed = difficultiesFor(outcome, helpType);
  if (!allowed) return 'hard';
  return allowed.includes(selected) ? selected : allowed[0];
}

// The difficulty value to hold in form state after the outcome changes. Unlike
// the save-path resolution, this preserves the user's selection when the new
// outcome hides the field — so switching away and back does not silently rewrite
// a "manageable" solve into "a real struggle". Only an out-of-range value (e.g.
// 'easy' after switching to solved_with_hint) is snapped into range.
export function snapDifficultyForOutcome(outcome: Outcome, selected: PerceivedDifficulty, helpType: HelpType | '' = ''): PerceivedDifficulty {
  const allowed = difficultiesFor(outcome, helpType);
  if (!allowed || allowed.includes(selected)) return selected;
  return allowed[0];
}
