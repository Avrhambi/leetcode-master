import type { AttemptInput } from '../db/saveAttempt';
import type { HelpType, Outcome, PerceivedDifficulty, Quality } from '../types/models';
import { ATTEMPT_DURATION_MAX_MINUTES, ATTEMPT_DURATION_MIN_MINUTES } from './constants';
import { outcomeOptions, resolvePerceivedDifficulty } from './attemptForm';
import { qualityFor } from './reviews';

// The three one-tap buttons on a plan item. Each is a preset answer to the full
// attempt form: same outcome, same "how hard", same help type, resolved through
// the form's own rules (`attemptForm.ts`) and saved through `saveAttempt`, so the
// quality, review stage and XP are exactly what the form would have produced.
export type QuickLogChoice = 'solved' | 'hint' | 'could_not_solve';

interface Preset { label: string; outcome: Outcome; difficulty: PerceivedDifficulty; helpType: HelpType | null; }

const PRESETS: Record<QuickLogChoice, Preset> = {
  solved: { label: 'Solved it', outcome: 'solved_independently', difficulty: 'manageable', helpType: null },
  hint: { label: 'Needed a hint', outcome: 'solved_with_hint', difficulty: 'manageable', helpType: 'small_hint' },
  could_not_solve: { label: "Couldn't solve it", outcome: 'could_not_solve', difficulty: 'hard', helpType: null }
};

export const QUICK_LOG_CHOICES: readonly QuickLogChoice[] = ['solved', 'hint', 'could_not_solve'];

export function quickLogLabel(choice: QuickLogChoice): string {
  return PRESETS[choice].label;
}

// The quality this button records, from the one derivation `saveAttempt` uses.
export function quickLogQuality(choice: QuickLogChoice): Quality {
  const input = quickLogInput(choice, { problemId: '', attemptedOn: '', timerMinutes: null });
  return qualityFor(input.outcome, input.perceivedDifficulty);
}

// Whole minutes in the form's 1-600 range, or null (no duration recorded).
function durationFrom(timerMinutes: number | null): number | null {
  if (timerMinutes === null || !Number.isFinite(timerMinutes)) return null;
  const rounded = Math.round(timerMinutes);
  return Math.min(ATTEMPT_DURATION_MAX_MINUTES, Math.max(ATTEMPT_DURATION_MIN_MINUTES, rounded));
}

// A complete `AttemptInput` for a button. `timerMinutes` is the running attempt
// timer's elapsed minutes for this problem (null when no timer runs). A quick
// log is never a light review: that flow stays in the full form.
export function quickLogInput(choice: QuickLogChoice, context: { problemId: string; attemptedOn: string; timerMinutes: number | null }): AttemptInput {
  const preset = PRESETS[choice];
  const helpTypeAllowed = outcomeOptions[preset.outcome].helpTypes !== undefined;
  return {
    problemId: context.problemId,
    attemptedOn: context.attemptedOn,
    outcome: preset.outcome,
    perceivedDifficulty: resolvePerceivedDifficulty(preset.outcome, preset.difficulty, preset.helpType ?? ''),
    helpType: helpTypeAllowed ? preset.helpType : null,
    durationMinutes: durationFrom(context.timerMinutes),
    notes: ''
  };
}
