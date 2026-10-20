// Curriculum weighting for daily-plan topic selection. Keyed by `primaryTopic`
// so it needs no schema change or catalog reseed.
// Tier 1 = common foundations, tier 2 = core intermediate, tier 3 = niche/advanced.
export type TopicTier = 1 | 2 | 3;

export const TOPIC_TIERS: Record<string, TopicTier> = {
  'Arrays & Hashing': 1,
  'Two Pointers': 1,
  'Sliding Window': 1,
  Stack: 1,
  'Binary Search': 1,
  'Linked List': 1,
  Trees: 1,
  'Heap / Priority Queue': 2,
  Backtracking: 2,
  Graphs: 2,
  '1-D Dynamic Programming': 2,
  Greedy: 2,
  Intervals: 2,
  Tries: 3,
  'Advanced Graphs': 3,
  '2-D Dynamic Programming': 3,
  'Math & Geometry': 3,
  'Bit Manipulation': 3
};

// Human labels for the three curriculum bands, used by the topic map.
export const TIER_LABELS: Record<TopicTier, string> = {
  1: 'Foundations',
  2: 'Intermediate',
  3: 'Advanced'
};

// Tier for a topic, defaulting to 2 for anything not in the map.
export function topicTier(topic: string): TopicTier {
  return TOPIC_TIERS[topic] ?? 2;
}

const TIER_WEIGHT: Record<TopicTier, number> = { 1: 1, 2: 0.6, 3: 0.35 };

// With an interview deadline the foundations come first and the niche topics
// last: tier 2 only overtakes tier 1 once tier 1 is well advanced.
const DEADLINE_TIER_WEIGHT: Record<TopicTier, number> = { 1: 1, 2: 0.4, 3: 0.1 };

// Topics not in the map fall back to tier 2 weighting.
export function tierWeight(topic: string, favourFoundations = false): number {
  return (favourFoundations ? DEADLINE_TIER_WEIGHT : TIER_WEIGHT)[TOPIC_TIERS[topic] ?? 2];
}
