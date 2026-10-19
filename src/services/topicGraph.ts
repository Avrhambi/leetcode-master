import { PREREQ_PRIORITY_PENALTY, PREREQ_SKILL_THRESHOLD } from './constants';

// Prerequisite edges between topics: topic → the topics worth knowing first.
// Soft guidance for the daily plan only; the map never locks anything.
export const TOPIC_PREREQUISITES: Record<string, string[]> = {
  'Arrays & Hashing': [],
  'Two Pointers': ['Arrays & Hashing'],
  'Sliding Window': ['Two Pointers'],
  Stack: ['Arrays & Hashing'],
  'Binary Search': ['Two Pointers'],
  'Linked List': ['Two Pointers'],
  Trees: ['Binary Search', 'Linked List'],
  'Heap / Priority Queue': ['Trees'],
  Backtracking: ['Trees'],
  Tries: ['Trees'],
  Graphs: ['Trees'],
  'Advanced Graphs': ['Graphs', 'Heap / Priority Queue'],
  '1-D Dynamic Programming': ['Backtracking'],
  '2-D Dynamic Programming': ['1-D Dynamic Programming'],
  Greedy: ['Arrays & Hashing'],
  Intervals: ['Arrays & Hashing'],
  'Math & Geometry': ['Arrays & Hashing'],
  'Bit Manipulation': ['Arrays & Hashing']
};

export function prerequisitesOf(topic: string): string[] {
  return TOPIC_PREREQUISITES[topic] ?? [];
}

// Multiplier on a topic's new-problem priority: PREREQ_PRIORITY_PENALTY if any
// prerequisite still needs work (skill below the threshold and unsolved problems
// left in the active set), otherwise 1.
export function prerequisitePenalty(topic: string, skills: Map<string, number>, topicsWithWork: Set<string>): number {
  const unmet = prerequisitesOf(topic).some((prereq) => topicsWithWork.has(prereq) && (skills.get(prereq) ?? 0) < PREREQ_SKILL_THRESHOLD);
  return unmet ? PREREQ_PRIORITY_PENALTY : 1;
}
