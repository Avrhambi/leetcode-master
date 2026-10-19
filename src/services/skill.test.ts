import { describe, expect, it } from 'vitest';
import { targetDifficulty, topicSkills } from './skill';
import { TOPIC_PREREQUISITES, prerequisitePenalty } from './topicGraph';
import { TOPIC_TIERS } from '../data/topicTiers';
import type { Attempt, CatalogProblem, Difficulty, Quality } from '../types/models';

const problem = (id: string, difficulty: Difficulty, topic = 'T'): CatalogProblem => ({ id, title: id, slug: id, leetcodeUrl: '', difficulty, topics: [topic], primaryTopic: topic, neetcodeOrder: 1, neetcodeUrl: '', lists: ['nc250'] });
const attempt = (problemId: string, day: number, quality: Quality, n = 0): Attempt => ({ id: `${problemId}-${day}-${n}`, problemId, attemptedOn: `2026-07-${String(day).padStart(2, '0')}`, outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: '', quality, createdAt: `2026-07-${String(day).padStart(2, '0')}T12:00:0${n}.000Z` });
const problems = [problem('e1', 'easy'), problem('e2', 'easy'), problem('m1', 'medium'), problem('m2', 'medium'), problem('m3', 'medium'), problem('h1', 'hard')];
const skillAfter = (attempts: Attempt[]) => topicSkills(attempts, problems).get('T') ?? 0;

describe('topic skill', () => {
  it('is 0 with no attempts and ignores attempts on unknown problems', () => {
    expect(skillAfter([])).toBe(0);
    expect(skillAfter([attempt('ghost', 1, 'strong')])).toBe(0);
  });
  it('unlocks Medium after two strong Easy solves, not one', () => {
    expect(targetDifficulty(skillAfter([attempt('e1', 1, 'strong')]))).toBe('easy');
    expect(targetDifficulty(skillAfter([attempt('e1', 1, 'strong'), attempt('e2', 2, 'strong')]))).toBe('medium');
  });
  it('unlocks Hard after three strong Mediums from the Medium threshold', () => {
    const attempts = [attempt('e1', 1, 'strong'), attempt('e2', 2, 'strong'), attempt('m1', 3, 'strong'), attempt('m2', 4, 'strong'), attempt('m3', 5, 'strong')];
    expect(targetDifficulty(skillAfter(attempts))).toBe('hard');
  });
  it('drops the ceiling again after failures and stays within [0, 1]', () => {
    const climb = [attempt('e1', 1, 'strong'), attempt('e2', 2, 'strong'), attempt('m1', 3, 'strong'), attempt('m2', 4, 'strong'), attempt('m3', 5, 'strong')];
    const failing = [attempt('m1', 6, 'weak'), attempt('m2', 7, 'weak'), attempt('m3', 8, 'weak')];
    expect(targetDifficulty(skillAfter([...climb, ...failing]))).not.toBe('hard');
    const many = Array.from({ length: 40 }, (_, i) => attempt('h1', 1 + (i % 28), 'weak', i % 9));
    expect(skillAfter(many)).toBe(0);
    expect(skillAfter(Array.from({ length: 60 }, (_, i) => attempt('h1', 1 + (i % 28), 'strong', i % 9)))).toBeLessThanOrEqual(1);
  });
  it('discounts same-day repeats of one problem and is order independent', () => {
    const once = skillAfter([attempt('e1', 1, 'strong')]);
    const twice = skillAfter([attempt('e1', 1, 'strong', 0), attempt('e1', 1, 'strong', 1)]);
    const spread = skillAfter([attempt('e1', 1, 'strong'), attempt('e1', 2, 'strong')]);
    expect(twice).toBeGreaterThan(once);
    expect(twice).toBeLessThan(spread);
    const list = [attempt('e1', 1, 'strong'), attempt('m1', 2, 'partial'), attempt('e2', 3, 'weak')];
    expect(skillAfter([...list].reverse())).toBe(skillAfter(list));
  });
});

describe('topic graph', () => {
  it('covers every tiered topic and only references known topics', () => {
    for (const topic of Object.keys(TOPIC_TIERS)) expect(TOPIC_PREREQUISITES).toHaveProperty(topic);
    for (const prereqs of Object.values(TOPIC_PREREQUISITES)) for (const p of prereqs) expect(TOPIC_TIERS).toHaveProperty(p);
  });
  it('is acyclic', () => {
    const state = new Map<string, 1 | 2>();
    const visit = (topic: string) => {
      expect(state.get(topic)).not.toBe(1);
      if (state.get(topic) === 2) return;
      state.set(topic, 1);
      for (const p of TOPIC_PREREQUISITES[topic] ?? []) visit(p);
      state.set(topic, 2);
    };
    Object.keys(TOPIC_PREREQUISITES).forEach(visit);
  });
  it('penalises a topic only while a prerequisite with work left is below threshold', () => {
    const work = new Set(['Arrays & Hashing', 'Two Pointers']);
    expect(prerequisitePenalty('Two Pointers', new Map(), work)).toBeLessThan(1);
    expect(prerequisitePenalty('Two Pointers', new Map([['Arrays & Hashing', 0.5]]), work)).toBe(1);
    expect(prerequisitePenalty('Two Pointers', new Map(), new Set(['Two Pointers']))).toBe(1);
    expect(prerequisitePenalty('Arrays & Hashing', new Map(), work)).toBe(1);
  });
});
