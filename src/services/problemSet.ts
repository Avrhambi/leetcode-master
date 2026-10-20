import type { CatalogProblem, ProblemList } from '../types/models';

// The user's chosen scope. One 250-row catalog; each row's `lists` says which
// sets it belongs to, and nc75 ⊂ nc150 ⊂ nc250 (enforced by catalog.test.ts).
export const PROBLEM_SETS: readonly ProblemList[] = ['nc75', 'nc150', 'nc250'];

// What a fresh install and an existing user with no stored choice both get: the
// 150 is the set existing users were already working through.
export const DEFAULT_PROBLEM_SET: ProblemList = 'nc150';

export const PROBLEM_SET_LABELS: Record<ProblemList, string> = {
  nc75: 'NeetCode 75',
  nc150: 'NeetCode 150',
  nc250: 'NeetCode 250'
};

// Tolerant of a missing, hand-edited or future-build value: anything that is not
// a known set reads as the default, so a restored backup can never wedge the app.
export function parseProblemSet(value: string | undefined): ProblemList {
  return PROBLEM_SETS.find((set) => set === value) ?? DEFAULT_PROBLEM_SET;
}

// The one filter. The app applies it where the catalog is read from Dexie so the
// plan, map, mastery counts, search and badge inputs all see the same problems.
// The review queue deliberately gets the *unfiltered* catalog: an out-of-set
// problem the user already attempted keeps coming due, so retention never
// silently stops when they narrow the set.
//
// `skipEasies` (T16, for experienced users) drops the Easy problems from the same
// view, so the plan, map and counts all follow. It is a view only: stored progress
// and attempts are never touched, and the review queue still gets everything.
export function problemsInSet(problems: CatalogProblem[], set: ProblemList, skipEasies = false): CatalogProblem[] {
  return problems.filter((problem) => problem.lists.includes(set) && !(skipEasies && problem.difficulty === 'easy'));
}
