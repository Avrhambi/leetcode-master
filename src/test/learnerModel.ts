import type { CatalogProblem, Quality } from '../types/models';
import { TOPIC_TIERS } from '../data/topicTiers';

// A deterministic simulated learner, used only by the training-outcome tests to
// compare plan engines. It is a model, not data: its assumptions are written out
// here so a reader can judge the numbers the tests print.
//
//   ability    per topic, `theta` in [0, 1] on the same scale as the problem
//              ratings below (Easy 0.15, Medium 0.45, Hard 0.75).
//   solving    P(strong) = sigmoid((effective theta + memory bonus - rating) / 0.07).
//              A re-solve of a problem you attempted before gets a memory bonus that
//              fades with time (smaller after a failed attempt, when you read the
//              solution), so re-solving is easier than a fresh problem.
//   learning   each attempt moves theta towards 1 by `learnRate`, scaled by how
//              close the problem is to the learner's level (zone of proximal
//              development). A problem seen before teaches 30% of a fresh one
//              (variability of practice: transfer comes from new variants), a
//              failed attempt that ends in reading the solution teaches 60%.
//   forgetting effective theta = theta x (0.65 + 0.35 x exp(-days since the topic was
//              last practised / stability)). Stability starts at 4 days and grows
//              x1.7 when the topic is practised after at least half of it has
//              passed (spacing effect), x1.05 otherwise.
//   readiness  the chance to solve an unseen Medium of a topic today, averaged over
//              the set's topics weighted by curriculum tier (1 / 0.6 / 0.35), a
//              stand-in for how often a topic comes up in interviews.
export const PROBLEM_RATING = { easy: 0.15, medium: 0.45, hard: 0.75 } as const;
const SOLVE_SCALE = 0.07;
const PARTIAL_BAND = 0.12;
const MEMORY_BONUS = 0.25;
const SEEN_TEACHES = 0.3;
const WEAK_TEACHES = 0.6;
const ZPD_WIDTH = 0.25;
const FORGET_FLOOR = 0.65;
const TIER_WEIGHT = { 1: 1, 2: 0.6, 3: 0.35 } as const;

export interface LearnerProfile { name: string; prior: number; learnRate: number }

export const LEARNERS: Record<'beginner' | 'typical' | 'experienced', LearnerProfile> = {
  beginner: { name: 'beginner', prior: 0.05, learnRate: 0.08 },
  typical: { name: 'typical', prior: 0.15, learnRate: 0.1 },
  experienced: { name: 'experienced', prior: 0.32, learnRate: 0.12 }
};

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

function roll(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

interface TopicState { theta: number; last: number | null; stability: number }
interface ProblemMemory { last: number | null; strength: number; stability: number; attempts: number }

export class Learner {
  private readonly topics = new Map<string, TopicState>();
  private readonly memory = new Map<string, ProblemMemory>();

  constructor(private readonly profile: LearnerProfile) {}

  private topic(name: string): TopicState {
    let state = this.topics.get(name);
    if (!state) {
      state = { theta: this.profile.prior, last: null, stability: 4 };
      this.topics.set(name, state);
    }
    return state;
  }

  effectiveTheta(topicName: string, day: number): number {
    const state = this.topic(topicName);
    if (state.last === null) return state.theta;
    return state.theta * (FORGET_FLOOR + (1 - FORGET_FLOOR) * Math.exp(-(day - state.last) / state.stability));
  }

  // Probability of a strong solve, without changing any state.
  chance(problem: CatalogProblem, day: number, timePressure = 0): number {
    const memory = this.memory.get(problem.id);
    const bonus = memory?.last !== null && memory?.last !== undefined ? MEMORY_BONUS * memory.strength * Math.exp(-(day - memory.last) / memory.stability) : 0;
    return sigmoid((this.effectiveTheta(problem.primaryTopic, day) + bonus - PROBLEM_RATING[problem.difficulty] - timePressure) / SOLVE_SCALE);
  }

  attempt(problem: CatalogProblem, day: number, timePressure = 0): Quality {
    const memory = this.memory.get(problem.id) ?? { last: null, strength: 0, stability: 4, attempts: 0 };
    const p = this.chance(problem, day, timePressure);
    const value = roll(`${this.profile.name}|${problem.id}|${day}|${memory.attempts}`);
    const quality: Quality = value < p ? 'strong' : value < p + PARTIAL_BAND ? 'partial' : 'weak';

    const state = this.topic(problem.primaryTopic);
    const effective = this.effectiveTheta(problem.primaryTopic, day);
    const zpd = Math.exp(-((PROBLEM_RATING[problem.difficulty] - effective) ** 2) / (2 * ZPD_WIDTH ** 2));
    const gain = this.profile.learnRate * zpd * (memory.attempts > 0 ? SEEN_TEACHES : 1) * (quality === 'weak' ? WEAK_TEACHES : 1);
    // Practising refreshes the topic: the stored ability is what was recalled plus what was learned.
    state.theta = Math.max(state.theta, effective) + gain * (1 - Math.max(state.theta, effective));
    if (state.last !== null) state.stability = day - state.last >= state.stability * 0.5 ? Math.min(state.stability * 1.7, 180) : state.stability * 1.05;
    state.last = day;

    // Any attempt leaves a memory of the solution (a failed one ends in reading it,
    // so it is weaker); a strong recall after a spaced gap makes it last longer.
    if (quality === 'strong' && memory.last !== null && day - memory.last >= memory.stability * 0.5) memory.stability = Math.min(memory.stability * 2.2, 365);
    memory.strength = Math.max(memory.strength * Math.exp(-(day - (memory.last ?? day)) / memory.stability), quality === 'strong' ? 1 : quality === 'partial' ? 0.8 : 0.6);
    memory.last = day;
    memory.attempts += 1;
    this.memory.set(problem.id, memory);
    return quality;
  }

  // Chance to solve an unseen Medium in each topic today.
  topicReadiness(topicName: string, day: number): number {
    return sigmoid((this.effectiveTheta(topicName, day) - PROBLEM_RATING.medium) / SOLVE_SCALE);
  }

  readiness(topicNames: string[], day: number): number {
    let weighted = 0;
    let total = 0;
    for (const name of topicNames) {
      const weight = TIER_WEIGHT[TOPIC_TIERS[name] ?? 2];
      weighted += weight * this.topicReadiness(name, day);
      total += weight;
    }
    return total === 0 ? 0 : weighted / total;
  }
}
