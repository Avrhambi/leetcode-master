import type { Attempt, CatalogProblem, Difficulty } from '../types/models';
import {
  SKILL_DIFFICULTY_RATING,
  SKILL_HARD_THRESHOLD,
  SKILL_K,
  SKILL_MOCK_WEIGHT,
  SKILL_MEDIUM_THRESHOLD,
  SKILL_QUALITY_RESULT,
  SKILL_REPEAT_SAME_DAY_MULTIPLIER,
  SKILL_SCALE
} from './constants';

// Per-topic skill in [0, 1], replayed deterministically from the attempts
// history. It is never stored, so it cannot drift, and it does not depend on how
// many problems the active set has in a topic. Topics with no attempts are 0.
export function topicSkills(attempts: Attempt[], problems: CatalogProblem[], imported: ReadonlySet<string> = new Set()): Map<string, number> {
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const skills = new Map<string, number>();
  const seenToday = new Set<string>();
  // Imported marks ("already know") count as one strong result each, before any
  // attempt, in catalog order so the result never depends on tick order.
  const marks = problems.filter((problem) => imported.has(problem.id)).sort((a, b) => a.neetcodeOrder - b.neetcodeOrder || a.id.localeCompare(b.id));
  for (const problem of marks) {
    const skill = skills.get(problem.primaryTopic) ?? 0;
    const expected = 1 / (1 + Math.exp(-(skill - SKILL_DIFFICULTY_RATING[problem.difficulty]) / SKILL_SCALE));
    skills.set(problem.primaryTopic, Math.min(1, Math.max(0, skill + SKILL_K * (SKILL_QUALITY_RESULT.strong - expected))));
  }
  const ordered = [...attempts].sort((a, b) => a.attemptedOn.localeCompare(b.attemptedOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const attempt of ordered) {
    const problem = problemById.get(attempt.problemId);
    if (!problem) continue;
    const topic = problem.primaryTopic;
    const skill = skills.get(topic) ?? 0;
    const expected = 1 / (1 + Math.exp(-(skill - SKILL_DIFFICULTY_RATING[problem.difficulty]) / SKILL_SCALE));
    const dayKey = `${attempt.problemId}|${attempt.attemptedOn}`;
    // A mock interview result is timed, unseen and unaided: stronger evidence (T24).
    const weight = (seenToday.has(dayKey) ? SKILL_REPEAT_SAME_DAY_MULTIPLIER : 1) * (attempt.mock ? SKILL_MOCK_WEIGHT : 1);
    seenToday.add(dayKey);
    const next = skill + SKILL_K * weight * (SKILL_QUALITY_RESULT[attempt.quality] - expected);
    skills.set(topic, Math.min(1, Math.max(0, next)));
  }
  return skills;
}

// The difficulty new problems in a topic should aim at for a given skill.
export function targetDifficulty(skill: number): Difficulty {
  return skill >= SKILL_HARD_THRESHOLD ? 'hard' : skill >= SKILL_MEDIUM_THRESHOLD ? 'medium' : 'easy';
}
