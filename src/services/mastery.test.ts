import { describe, expect, it } from 'vitest';
import { masteryByTopic, proficientTopics, strugglingProblems, topicTrajectory } from './mastery';
import type { Attempt, CatalogProblem, ProblemProgress, Quality } from '../types/models';

const problems: CatalogProblem[] = [
  { id: 'a', title: 'A', slug: 'a', leetcodeUrl: '', difficulty: 'easy', topics: ['Arrays'], primaryTopic: 'Arrays', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 1 },
  { id: 'b', title: 'B', slug: 'b', leetcodeUrl: '', difficulty: 'medium', topics: ['Arrays'], primaryTopic: 'Arrays', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 2 },
  { id: 'c', title: 'C', slug: 'c', leetcodeUrl: '', difficulty: 'easy', topics: ['Trees'], primaryTopic: 'Trees', neetcodeUrl: '', lists: ['nc250'], neetcodeOrder: 3 }
];

let seq = 0;
const attempt = (problemId: string, quality: Quality): Attempt => ({
  id: `x${seq}`, problemId, attemptedOn: '2026-07-19', outcome: 'solved_independently', perceivedDifficulty: 'manageable',
  helpType: null, durationMinutes: null, notes: '', quality, createdAt: `2026-07-19T00:00:${String(seq++).padStart(2, '0')}.000Z`
});

const progress = (changes: Partial<ProblemProgress>): ProblemProgress => ({
  problemId: 'a', status: 'attempted', reviewStage: 0, nextReviewDate: null, lastAttemptDate: null,
  lastQuality: null, strongAttemptCount: 0, consecutiveWeak: 0, struggling: false, updatedAt: '', ...changes
});

describe('topicTrajectory', () => {
  it('is flat with too few attempts', () => {
    expect(topicTrajectory('Arrays', [attempt('a', 'weak'), attempt('a', 'strong')], problems)).toBe('flat');
  });
  it('detects improvement', () => {
    const attempts = [attempt('a', 'weak'), attempt('a', 'weak'), attempt('b', 'strong'), attempt('b', 'strong')];
    expect(topicTrajectory('Arrays', attempts, problems)).toBe('improving');
  });
  it('detects decline', () => {
    const attempts = [attempt('a', 'strong'), attempt('a', 'strong'), attempt('b', 'weak'), attempt('b', 'weak')];
    expect(topicTrajectory('Arrays', attempts, problems)).toBe('declining');
  });
  it('is flat when quality holds steady', () => {
    const attempts = [attempt('a', 'partial'), attempt('a', 'partial'), attempt('b', 'partial'), attempt('b', 'partial')];
    expect(topicTrajectory('Arrays', attempts, problems)).toBe('flat');
  });
  it('ignores attempts from other topics', () => {
    const attempts = [attempt('c', 'weak'), attempt('c', 'weak'), attempt('a', 'strong'), attempt('a', 'strong')];
    expect(topicTrajectory('Arrays', attempts, problems)).toBe('flat');
  });
});

describe('masteryByTopic', () => {
  it('returns one cell per topic in catalog order, with counts', () => {
    const rows = [
      progress({ problemId: 'a', status: 'mastered', reviewStage: 5 }),
      progress({ problemId: 'b', status: 'solved', reviewStage: 3 })
    ];
    const cells = masteryByTopic(problems, rows);
    expect(cells.map((c) => c.topic)).toEqual(['Arrays', 'Trees']);
    const arrays = cells[0];
    expect(arrays.total).toBe(2);
    expect(arrays.attempted).toBe(2);
    expect(arrays.mastered).toBe(1);
    // (5/5 + 3/5) / 2 = 0.8
    expect(arrays.mastery).toBeCloseTo(0.8);
    const trees = cells[1];
    expect(trees).toMatchObject({ total: 1, attempted: 0, mastered: 0, mastery: 0 });
  });

  it('counts a struggling problem at its real (low) stage, not the queue 0.5', () => {
    const rows = [progress({ problemId: 'a', struggling: true, reviewStage: 0, status: 'attempted' })];
    const arrays = masteryByTopic(problems, rows)[0];
    expect(arrays.mastery).toBe(0); // (0/5 + 0) / 2, b untouched
  });
});

describe('topic proficiency (the map star)', () => {
  const core: CatalogProblem[] = [
    { ...problems[0], lists: ['nc75', 'nc150', 'nc250'] },
    { ...problems[1], lists: ['nc150', 'nc250'] },
    { ...problems[2], id: 'extra', lists: ['nc250'] }
  ];

  it('stars a topic once every core problem is at stage 3, whatever the rest of the 250 is doing', () => {
    const rows = [progress({ problemId: 'a', reviewStage: 3 }), progress({ problemId: 'b', reviewStage: 4 })];
    const cells = masteryByTopic(core, rows, 'nc250');
    expect(cells.find((cell) => cell.topic === 'Arrays')?.proficient).toBe(true);
    // The mastery ring is still honest: 3/5 and 4/5 is well short of full.
    expect(cells.find((cell) => cell.topic === 'Arrays')?.mastery).toBeLessThan(1);
  });

  it('does not star a topic with one core problem short of stage 3', () => {
    const rows = [progress({ problemId: 'a', reviewStage: 5 }), progress({ problemId: 'b', reviewStage: 2 })];
    expect(masteryByTopic(core, rows, 'nc150')[0].proficient).toBe(false);
  });

  it('asks only for the NeetCode 75 when the 75 is active', () => {
    const rows = [progress({ problemId: 'a', reviewStage: 3 })];
    expect(proficientTopics([core[0]], rows, 'nc75').has('Arrays')).toBe(true);
    expect(proficientTopics(core.slice(0, 2), rows, 'nc150').has('Arrays')).toBe(false);
  });

  it('never stars a topic whose only problems are outside the core', () => {
    expect(masteryByTopic(core, [progress({ problemId: 'extra', reviewStage: 5 })], 'nc150').find((cell) => cell.topic === 'Trees')?.proficient).toBe(false);
  });
});

describe('strugglingProblems', () => {
  it('returns only flagged problems, weakest run first', () => {
    const rows = [
      progress({ problemId: 'a', struggling: true, consecutiveWeak: 3 }),
      progress({ problemId: 'b', struggling: false, consecutiveWeak: 1 }),
      progress({ problemId: 'c', struggling: true, consecutiveWeak: 5 })
    ];
    expect(strugglingProblems(rows).map((p) => p.problemId)).toEqual(['c', 'a']);
  });
});
