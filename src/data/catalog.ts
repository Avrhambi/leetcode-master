import rawCatalog from './neetcode250.json';
import type { CatalogProblem, Difficulty, ProblemList } from '../types/models';

interface CatalogRow { title: string; slug: string; neetcodeSlug: string; difficulty: Difficulty; topics: string[]; primaryTopic: string; lists: ProblemList[]; }

const rows = rawCatalog as CatalogRow[];

// `id` stays the LeetCode slug so progress and attempts written against the old
// 150-problem catalog keep resolving. `neetcodeSlug` differs from it and can't be derived.
export const catalog: CatalogProblem[] = rows.map(({ neetcodeSlug, ...row }, index) => ({
  ...row,
  id: row.slug,
  leetcodeUrl: `https://leetcode.com/problems/${row.slug}/`,
  neetcodeUrl: `https://neetcode.io/problems/${neetcodeSlug}`,
  neetcodeOrder: index + 1
}));

export const CATALOG_VERSION = 'neetcode-250-v1';
