import type { CatalogProblem } from '../types/models';

// "Core first" ordering key: 0 = NeetCode 75, 1 = NeetCode 150 only, 2 = the rest of the 250.
export function coreRank(problem: Pick<CatalogProblem, 'lists'>): 0 | 1 | 2 {
  if (problem.lists.includes('nc75')) return 0;
  return problem.lists.includes('nc150') ? 1 : 2;
}

// Small "75" / "150" tag for the narrowest curated list a problem belongs to; null for the rest of the 250.
export function listTag(problem: Pick<CatalogProblem, 'lists'>): '75' | '150' | null {
  const rank = coreRank(problem);
  return rank === 0 ? '75' : rank === 1 ? '150' : null;
}
