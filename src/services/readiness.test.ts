import { describe, expect, it } from 'vitest';
import { readinessDetail, readinessGain, readinessLine, readinessSummary, topicReadiness } from './readiness';
import { catalog } from '../data/catalog';
import { problemsInSet } from './problemSet';

describe('topicReadiness', () => {
  it('is the chance of solving an unseen Medium: one half at Medium skill, rising with skill', () => {
    expect(topicReadiness(0.45)).toBeCloseTo(0.5, 5);
    expect(topicReadiness(0)).toBeLessThan(0.1);
    expect(topicReadiness(0.6)).toBeGreaterThan(0.7);
    for (let skill = 0; skill < 1; skill += 0.05) expect(topicReadiness(skill + 0.05)).toBeGreaterThan(topicReadiness(skill));
  });
});

describe('readinessGain', () => {
  it('is largest for a topic halfway to ready and small for an untouched or a ready one', () => {
    expect(readinessGain(0.4)).toBeCloseTo(1, 1);
    expect(readinessGain(0.4)).toBeGreaterThan(readinessGain(0));
    expect(readinessGain(0.4)).toBeGreaterThan(readinessGain(0.8));
    expect(readinessGain(0)).toBeGreaterThan(0);
  });
});

describe('readinessSummary', () => {
  const problems = problemsInSet(catalog, 'nc75');

  it('is near zero with no history, with every topic of the set listed', () => {
    const summary = readinessSummary(problems, new Map());
    expect(summary.overall).toBeLessThan(0.1);
    expect(summary.readyCount).toBe(0);
    expect(summary.topics.map((row) => row.topic)).toEqual([...new Set(problems.map((problem) => problem.primaryTopic))]);
  });

  it('counts a topic as ready at a 70% chance, and weighs foundations most', () => {
    const foundation = readinessSummary(problems, new Map([['Arrays & Hashing', 0.8]]));
    const advanced = readinessSummary(problems, new Map([['Bit Manipulation', 0.8]]));
    expect(foundation.readyCount).toBe(1);
    expect(foundation.topics.find((row) => row.topic === 'Arrays & Hashing')?.ready).toBe(true);
    expect(foundation.overall).toBeGreaterThan(advanced.overall);
  });

  it('words the summary and its arithmetic', () => {
    const summary = readinessSummary(problems, new Map([['Arrays & Hashing', 0.8]]));
    expect(readinessLine(summary)).toMatch(/^Interview readiness \d+% · 1 of \d+ topics ready$/);
    expect(readinessDetail(summary)).toContain('Arrays & Hashing: 91% · ready');
  });
});
