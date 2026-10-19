import { describe, expect, it } from 'vitest';
import { difficultiesFor, outcomeOptions, resolvePerceivedDifficulty, snapDifficultyForOutcome } from './attemptForm';
import { qualityFor } from './reviews';

describe('outcomeOptions', () => {
  it('offers all three difficulties and no help-type for an independent solve', () => {
    expect(outcomeOptions.solved_independently.difficulties).toEqual(['easy', 'manageable', 'hard']);
    expect(outcomeOptions.solved_independently.helpTypes).toBeUndefined();
  });

  it('drops "comfortable" and requires help-type for a hinted solve', () => {
    expect(outcomeOptions.solved_with_hint.difficulties).toEqual(['manageable', 'hard']);
    expect(outcomeOptions.solved_with_hint.helpTypes).toEqual(['small_hint', 'pattern_identification', 'pseudocode']);
  });

  it('hides difficulty and offers only deeper help for watching the solution', () => {
    expect(outcomeOptions.watched_solution.difficulties).toBeUndefined();
    expect(outcomeOptions.watched_solution.helpTypes).toEqual(['full_code', 'solution_video']);
  });

  it('hides both difficulty and help-type when the user could not solve it', () => {
    expect(outcomeOptions.could_not_solve).toEqual({});
  });
});

describe('resolvePerceivedDifficulty', () => {
  it('keeps an in-range selection', () => {
    expect(resolvePerceivedDifficulty('solved_independently', 'easy')).toBe('easy');
    expect(resolvePerceivedDifficulty('solved_with_hint', 'hard')).toBe('hard');
  });

  it('snaps an out-of-range selection to the first allowed option', () => {
    // 'easy' is not offered for a hinted solve
    expect(resolvePerceivedDifficulty('solved_with_hint', 'easy')).toBe('manageable');
  });

  it("saves 'hard' when difficulty is hidden for the outcome", () => {
    expect(resolvePerceivedDifficulty('watched_solution', 'easy')).toBe('hard');
    expect(resolvePerceivedDifficulty('could_not_solve', 'manageable')).toBe('hard');
  });
});

describe('snapDifficultyForOutcome', () => {
  it('snaps an out-of-range value into the new outcome\'s range', () => {
    // 'easy' is not offered for a hinted solve
    expect(snapDifficultyForOutcome('solved_with_hint', 'easy')).toBe('manageable');
  });

  it('preserves the selection when the new outcome hides the field', () => {
    expect(snapDifficultyForOutcome('watched_solution', 'manageable')).toBe('manageable');
    expect(snapDifficultyForOutcome('could_not_solve', 'easy')).toBe('easy');
  });

  it('does not rewrite a manageable solve after switching away and back', () => {
    // solved_independently (manageable) -> could_not_solve -> solved_independently
    const afterGiveUp = snapDifficultyForOutcome('could_not_solve', 'manageable');
    const afterReturn = snapDifficultyForOutcome('solved_independently', afterGiveUp);
    expect(afterReturn).toBe('manageable');
  });

  it('keeps an in-range selection unchanged', () => {
    expect(snapDifficultyForOutcome('solved_independently', 'hard')).toBe('hard');
    expect(snapDifficultyForOutcome('solved_with_hint', 'manageable')).toBe('manageable');
  });
});

describe('the matrix keeps qualityFor consistent', () => {
  it('every allowed (outcome, difficulty) pair scores as expected', () => {
    // independent: easy/manageable -> strong, hard -> partial
    expect(qualityFor('solved_independently', 'easy')).toBe('strong');
    expect(qualityFor('solved_independently', 'manageable')).toBe('strong');
    expect(qualityFor('solved_independently', 'hard')).toBe('partial');
    // hinted: always partial regardless of the (manageable|hard) difficulty
    expect(qualityFor('solved_with_hint', 'manageable')).toBe('partial');
    expect(qualityFor('solved_with_hint', 'hard')).toBe('partial');
    // hidden-difficulty outcomes resolve to 'hard' and score weak
    expect(qualityFor('watched_solution', resolvePerceivedDifficulty('watched_solution', 'manageable'))).toBe('weak');
    expect(qualityFor('could_not_solve', resolvePerceivedDifficulty('could_not_solve', 'easy'))).toBe('weak');
  });
});

describe('difficultiesFor', () => {
  it('limits a pseudocode-assisted solve to "hard"', () => {
    expect(difficultiesFor('solved_with_hint', 'pseudocode')).toEqual(['hard']);
    expect(resolvePerceivedDifficulty('solved_with_hint', 'manageable', 'pseudocode')).toBe('hard');
    expect(snapDifficultyForOutcome('solved_with_hint', 'manageable', 'pseudocode')).toBe('hard');
  });

  it('leaves other help types and outcomes unchanged', () => {
    expect(difficultiesFor('solved_with_hint', 'small_hint')).toEqual(['manageable', 'hard']);
    expect(difficultiesFor('solved_independently', 'pseudocode')).toEqual(['easy', 'manageable', 'hard']);
    expect(difficultiesFor('watched_solution', 'full_code')).toBeUndefined();
  });
});
