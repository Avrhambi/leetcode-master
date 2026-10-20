import type { CatalogProblem } from '../types/models';
import { tierWeight } from '../data/topicTiers';
import { READINESS_LOOKAHEAD_SKILL, READY_TOPIC_CHANCE, SKILL_DIFFICULTY_RATING, SKILL_SCALE } from './constants';

// Interview readiness (T23): what an interview actually tests is an unseen
// problem, so readiness is read from topic skill (skill.ts, replayed from the
// attempts across *different* problems of the topic), not from how many times
// each problem was re-solved. Nothing is stored.

// The chance, under the skill model's own expected-result curve, of solving an
// unseen Medium in a topic at this skill.
export function topicReadiness(skill: number): number {
  return 1 / (1 + Math.exp(-(skill - SKILL_DIFFICULTY_RATING.medium) / SKILL_SCALE));
}

// How much one more problem at the right level is expected to raise a topic's
// readiness, as a share of the largest possible step (at the curve's midpoint).
// A one-step look-ahead on the readiness curve: a topic halfway to ready gains
// the most, an untouched one less (it needs a few problems before it pays off)
// and a ready one little. The deadline plan spends new problems where this is
// highest, so a short runway is not spread thin over every topic.
export function readinessGain(skill: number): number {
  const step = topicReadiness(skill + READINESS_LOOKAHEAD_SKILL) - topicReadiness(skill);
  const best = topicReadiness(SKILL_DIFFICULTY_RATING.medium + READINESS_LOOKAHEAD_SKILL / 2) - topicReadiness(SKILL_DIFFICULTY_RATING.medium - READINESS_LOOKAHEAD_SKILL / 2);
  return step / best;
}

export interface TopicReadiness { topic: string; chance: number; ready: boolean }

export interface ReadinessSummary {
  // Tier-weighted mean chance over the set's topics, in [0, 1].
  overall: number;
  topics: TopicReadiness[];
  readyCount: number;
}

// Readiness over the topics of the active set, weighted by curriculum tier
// (foundations come up most in interviews). Topics in catalog order.
export function readinessSummary(problems: CatalogProblem[], skills: Map<string, number>): ReadinessSummary {
  const topics: string[] = [];
  for (const problem of problems) if (!topics.includes(problem.primaryTopic)) topics.push(problem.primaryTopic);
  const rows = topics.map((topic) => {
    const chance = topicReadiness(skills.get(topic) ?? 0);
    return { topic, chance, ready: chance >= READY_TOPIC_CHANCE };
  });
  const weight = rows.reduce((sum, row) => sum + tierWeight(row.topic), 0);
  const overall = weight === 0 ? 0 : rows.reduce((sum, row) => sum + tierWeight(row.topic) * row.chance, 0) / weight;
  return { overall, topics: rows, readyCount: rows.filter((row) => row.ready).length };
}

export function readinessLine(summary: ReadinessSummary): string {
  return `Interview readiness ${Math.round(summary.overall * 100)}% · ${summary.readyCount} of ${summary.topics.length} topics ready`;
}

// Where the number comes from, for the hover.
export function readinessDetail(summary: ReadinessSummary): string {
  const lines = [
    'Your estimated chance to solve an unseen Medium in each topic, from your results on different problems of that topic (mock interviews count more). Foundations weigh most.',
    ...summary.topics.map((row) => `${row.topic}: ${Math.round(row.chance * 100)}%${row.ready ? ' · ready' : ''}`)
  ];
  return lines.join('\n');
}
