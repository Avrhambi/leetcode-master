import { describe, expect, it } from 'vitest';
import { QUICK_LOG_CHOICES, quickLogInput, quickLogLabel, quickLogQuality, type QuickLogChoice } from './quickLog';
import { difficultiesFor, outcomeOptions, resolvePerceivedDifficulty } from './attemptForm';
import { qualityFor } from './reviews';
import type { HelpType, Outcome, PerceivedDifficulty } from '../types/models';

const context = { problemId: 'two-sum', attemptedOn: '2026-10-20', timerMinutes: null };

// What AttemptForm.submit() hands to saveAttempt for a set of answers, built from
// the form's own exported rules. The quick log must land on the same values.
function formSubmission(outcome: Outcome, difficulty: PerceivedDifficulty, helpType: HelpType | '') {
  const helpTypeChoices = outcomeOptions[outcome].helpTypes;
  return {
    outcome,
    perceivedDifficulty: resolvePerceivedDifficulty(outcome, difficulty, helpType),
    helpType: helpTypeChoices ? (helpType as HelpType) : null
  };
}

describe('quick log buttons', () => {
  it('are the three outcome buttons, in order', () => {
    expect(QUICK_LOG_CHOICES.map(quickLogLabel)).toEqual(['Solved it', 'Needed a hint', "Couldn't solve it"]);
  });

  it.each<[QuickLogChoice, Outcome, PerceivedDifficulty, HelpType | '', 'strong' | 'partial' | 'weak']>([
    ['solved', 'solved_independently', 'manageable', '', 'strong'],
    ['hint', 'solved_with_hint', 'manageable', 'small_hint', 'partial'],
    ['could_not_solve', 'could_not_solve', 'manageable', '', 'weak']
  ])('%s saves the same attempt, with the same quality, as the form would', (choice, outcome, difficulty, helpType, quality) => {
    const input = quickLogInput(choice, context);
    const form = formSubmission(outcome, difficulty, helpType);
    expect(input.outcome).toBe(form.outcome);
    expect(input.perceivedDifficulty).toBe(form.perceivedDifficulty);
    expect(input.helpType).toBe(form.helpType);
    expect(qualityFor(input.outcome, input.perceivedDifficulty)).toBe(qualityFor(form.outcome, form.perceivedDifficulty));
    expect(qualityFor(input.outcome, input.perceivedDifficulty)).toBe(quality);
    expect(quickLogQuality(choice)).toBe(quality);
  });

  it('only uses answers the form itself offers', () => {
    for (const choice of QUICK_LOG_CHOICES) {
      const input = quickLogInput(choice, context);
      const choices = difficultiesFor(input.outcome, input.helpType ?? '');
      if (choices) expect(choices).toContain(input.perceivedDifficulty);
      const helpTypes = outcomeOptions[input.outcome].helpTypes;
      if (helpTypes) expect(helpTypes).toContain(input.helpType);
      else expect(input.helpType).toBeNull();
    }
  });

  it('fills the problem, date and an empty note, and is never a light review', () => {
    for (const choice of QUICK_LOG_CHOICES) {
      const input = quickLogInput(choice, context);
      expect(input).toMatchObject({ problemId: 'two-sum', attemptedOn: '2026-10-20', notes: '' });
      expect(input.lightReview).toBeUndefined();
    }
  });

  it('records no duration without a running timer', () => {
    expect(quickLogInput('solved', context).durationMinutes).toBeNull();
  });

  it('includes the timer minutes, kept inside the form range of 1 to 600', () => {
    expect(quickLogInput('solved', { ...context, timerMinutes: 14 }).durationMinutes).toBe(14);
    expect(quickLogInput('hint', { ...context, timerMinutes: 0 }).durationMinutes).toBe(1);
    expect(quickLogInput('hint', { ...context, timerMinutes: 9999 }).durationMinutes).toBe(600);
    expect(quickLogInput('hint', { ...context, timerMinutes: Number.NaN }).durationMinutes).toBeNull();
  });
});
