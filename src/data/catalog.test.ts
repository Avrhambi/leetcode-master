import { describe, expect, it } from 'vitest';
import { catalog, CATALOG_VERSION } from './catalog';
import { TOPIC_TIERS } from './topicTiers';
import { coreRank, listTag } from '../services/coreRank';

// The 150 ids the app shipped before the 250 catalog. Progress and attempts are keyed by
// these, so dropping or re-tagging one would orphan an existing user's data.
const LEGACY_150_IDS = [
  'contains-duplicate', 'valid-anagram', 'two-sum', 'group-anagrams',
  'top-k-frequent-elements', 'encode-and-decode-strings', 'product-of-array-except-self', 'valid-sudoku',
  'longest-consecutive-sequence', 'valid-palindrome', 'two-sum-ii-input-array-is-sorted', '3sum',
  'container-with-most-water', 'trapping-rain-water', 'best-time-to-buy-and-sell-stock', 'longest-substring-without-repeating-characters',
  'longest-repeating-character-replacement', 'permutation-in-string', 'minimum-window-substring', 'sliding-window-maximum',
  'valid-parentheses', 'min-stack', 'evaluate-reverse-polish-notation', 'generate-parentheses',
  'daily-temperatures', 'car-fleet', 'largest-rectangle-in-histogram', 'binary-search',
  'search-a-2d-matrix', 'koko-eating-bananas', 'find-minimum-in-rotated-sorted-array', 'search-in-rotated-sorted-array',
  'time-based-key-value-store', 'median-of-two-sorted-arrays', 'reverse-linked-list', 'merge-two-sorted-lists',
  'reorder-list', 'remove-nth-node-from-end-of-list', 'copy-list-with-random-pointer', 'add-two-numbers',
  'linked-list-cycle', 'find-the-duplicate-number', 'lru-cache', 'reverse-nodes-in-k-group',
  'invert-binary-tree', 'maximum-depth-of-binary-tree', 'diameter-of-binary-tree', 'balanced-binary-tree',
  'same-tree', 'subtree-of-another-tree', 'lowest-common-ancestor-of-a-binary-search-tree', 'binary-tree-level-order-traversal',
  'binary-tree-right-side-view', 'count-good-nodes-in-binary-tree', 'validate-binary-search-tree', 'kth-smallest-element-in-a-bst',
  'construct-binary-tree-from-preorder-and-inorder-traversal', 'binary-tree-maximum-path-sum', 'serialize-and-deserialize-binary-tree', 'kth-largest-element-in-a-stream',
  'last-stone-weight', 'k-closest-points-to-origin', 'kth-largest-element-in-an-array', 'task-scheduler',
  'design-twitter', 'find-median-from-data-stream', 'subsets', 'combination-sum',
  'permutations', 'subsets-ii', 'combination-sum-ii', 'word-search',
  'palindrome-partitioning', 'letter-combinations-of-a-phone-number', 'n-queens', 'implement-trie-prefix-tree',
  'design-add-and-search-words-data-structure', 'word-search-ii', 'number-of-islands', 'clone-graph',
  'max-area-of-island', 'pacific-atlantic-water-flow', 'surrounded-regions', 'rotting-oranges',
  'walls-and-gates', 'course-schedule', 'course-schedule-ii', 'redundant-connection',
  'number-of-connected-components-in-an-undirected-graph', 'graph-valid-tree', 'word-ladder', 'reconstruct-itinerary',
  'min-cost-to-connect-all-points', 'network-delay-time', 'swim-in-rising-water', 'alien-dictionary',
  'cheapest-flights-within-k-stops', 'climbing-stairs', 'min-cost-climbing-stairs', 'house-robber',
  'house-robber-ii', 'longest-palindromic-substring', 'palindromic-substrings', 'decode-ways',
  'coin-change', 'maximum-product-subarray', 'word-break', 'longest-increasing-subsequence',
  'partition-equal-subset-sum', 'unique-paths', 'longest-common-subsequence', 'best-time-to-buy-and-sell-stock-with-cooldown',
  'coin-change-ii', 'target-sum', 'interleaving-string', 'longest-increasing-path-in-a-matrix',
  'distinct-subsequences', 'edit-distance', 'burst-balloons', 'regular-expression-matching',
  'rotate-image', 'spiral-matrix', 'set-matrix-zeroes', 'happy-number',
  'plus-one', 'powx-n', 'multiply-strings', 'detect-squares',
  'single-number', 'number-of-1-bits', 'counting-bits', 'reverse-bits',
  'missing-number', 'sum-of-two-integers', 'reverse-integer', 'merge-k-sorted-lists',
  'insert-interval', 'merge-intervals', 'non-overlapping-intervals', 'meeting-rooms',
  'meeting-rooms-ii', 'minimum-interval-to-include-each-query', 'maximum-subarray', 'jump-game',
  'jump-game-ii', 'gas-station', 'hand-of-straights', 'merge-triplets-to-form-target-triplet',
  'partition-labels', 'valid-parenthesis-string'
];

describe('catalog', () => {
  it('has 250 problems with a versioned seed key', () => {
    expect(catalog).toHaveLength(250);
    expect(CATALOG_VERSION).toBe('neetcode-250-v1');
  });

  it('tags exactly 150 problems nc150 and 75 problems nc75', () => {
    expect(catalog.filter((p) => p.lists.includes('nc150'))).toHaveLength(150);
    expect(catalog.filter((p) => p.lists.includes('nc75'))).toHaveLength(75);
  });

  it('nests nc75 inside nc150 inside nc250', () => {
    for (const p of catalog) {
      expect(p.lists).toContain('nc250');
      if (p.lists.includes('nc75')) expect(p.lists).toContain('nc150');
    }
  });

  it('has unique ids, slugs and neetcode urls', () => {
    expect(new Set(catalog.map((p) => p.id)).size).toBe(250);
    expect(new Set(catalog.map((p) => p.neetcodeUrl)).size).toBe(250);
    expect(new Set(catalog.map((p) => p.neetcodeOrder)).size).toBe(250);
  });

  it('keeps every legacy id, tagged nc150', () => {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    expect(LEGACY_150_IDS).toHaveLength(150);
    for (const id of LEGACY_150_IDS) expect(byId.get(id)?.lists, id).toContain('nc150');
  });

  it('maps every primaryTopic to a tier and lists it in topics', () => {
    for (const p of catalog) {
      expect(TOPIC_TIERS[p.primaryTopic], p.id).toBeDefined();
      expect(p.topics, p.id).toContain(p.primaryTopic);
    }
  });

  it('has valid difficulties and well-formed urls', () => {
    for (const p of catalog) {
      expect(['easy', 'medium', 'hard'], p.id).toContain(p.difficulty);
      expect(p.leetcodeUrl).toBe(`https://leetcode.com/problems/${p.slug}/`);
      expect(p.neetcodeUrl).toMatch(/^https:\/\/neetcode\.io\/problems\/[a-z0-9-]+$/);
    }
  });
});

describe('coreRank', () => {
  it('ranks nc75 before nc150-only before the rest', () => {
    expect(coreRank({ lists: ['nc75', 'nc150', 'nc250'] })).toBe(0);
    expect(coreRank({ lists: ['nc150', 'nc250'] })).toBe(1);
    expect(coreRank({ lists: ['nc250'] })).toBe(2);
  });

  it('tags only the curated lists', () => {
    expect(listTag({ lists: ['nc75', 'nc150', 'nc250'] })).toBe('75');
    expect(listTag({ lists: ['nc150', 'nc250'] })).toBe('150');
    expect(listTag({ lists: ['nc250'] })).toBeNull();
  });
});
