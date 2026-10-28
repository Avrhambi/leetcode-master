import { useState, type FormEvent } from 'react';
import { localDate } from '../services/reviews';
import { difficultiesFor, difficultyLabels, helpTypeLabels, outcomeLabels, outcomeOptions, resolvePerceivedDifficulty, snapDifficultyForOutcome } from '../services/attemptForm';
import { saveAttempt } from '../db/saveAttempt';
import { ATTEMPT_DURATION_MAX_MINUTES, ATTEMPT_DURATION_MIN_MINUTES } from '../services/constants';
import type { HelpType, Outcome, PerceivedDifficulty } from '../types/models';

const outcomeOrder: Outcome[] = ['solved_independently', 'solved_with_hint', 'watched_solution', 'could_not_solve'];

export function AttemptForm({ problemId, onSaved, lightReviewOffered = false, timerMinutes = null }: { problemId: string; onSaved: () => void; lightReviewOffered?: boolean; timerMinutes?: number | null }) {
  const [attemptedOn, setAttemptedOn] = useState(localDate());
  const [outcome, setOutcome] = useState<Outcome>('solved_independently');
  const [difficulty, setDifficulty] = useState<PerceivedDifficulty>('manageable');
  const [helpType, setHelpType] = useState<HelpType | ''>('');
  // While the attempt timer runs, the duration field follows it until the user
  // types their own value.
  const [typedDuration, setTypedDuration] = useState<string | null>(null);
  const duration = typedDuration ?? (timerMinutes === null ? '' : String(timerMinutes));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  // In flight: a second click during the async save would write a second attempt (and XP award).
  const [saving, setSaving] = useState(false);

  const helpTypeChoices = outcomeOptions[outcome].helpTypes;
  const difficultyChoices = difficultiesFor(outcome, helpType);

  function changeOutcome(next: Outcome) {
    setOutcome(next);
    setHelpType('');
    setDifficulty((current) => snapDifficultyForOutcome(next, current));
  }

  function changeHelpType(next: HelpType | '') {
    setHelpType(next);
    setDifficulty((current) => snapDifficultyForOutcome(outcome, current, next));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    const durationMinutes = duration === '' ? null : Number(duration);
    if (!attemptedOn || (helpTypeChoices && !helpType) || !Number.isInteger(durationMinutes ?? 1) || (durationMinutes !== null && (durationMinutes < ATTEMPT_DURATION_MIN_MINUTES || durationMinutes > ATTEMPT_DURATION_MAX_MINUTES))) {
      setError('Please complete all required fields with a duration from 1 to 600 minutes.');
      return;
    }
    setSaving(true);
    try {
      await saveAttempt({
        problemId,
        attemptedOn,
        outcome,
        perceivedDifficulty: resolvePerceivedDifficulty(outcome, difficulty, helpType),
        helpType: helpTypeChoices ? (helpType as HelpType) : null,
        durationMinutes,
        notes: notes.trim()
      });
      onSaved();
    } catch {
      setError('The attempt could not be saved. Retry.');
    } finally {
      setSaving(false);
    }
  }

  // "I recalled the approach": a short review that skips the re-solve. If the
  // recall fails, the user re-solves and records a normal attempt below.
  async function saveLightReview() {
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      await saveAttempt({ problemId, attemptedOn: localDate(), outcome: 'solved_independently', perceivedDifficulty: 'manageable', helpType: null, durationMinutes: null, notes: notes.trim(), lightReview: true });
      onSaved();
    } catch {
      setError('The review could not be saved. Retry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="attempt-form" onSubmit={submit}>
      <h2>Record attempt</h2>
      {lightReviewOffered && (
        <div className="light-review">
          <button type="button" onClick={saveLightReview} disabled={saving}>I recalled the approach (about 5 min)</button>
          <p className="field-hint">Walk through the idea and the edge cases without coding. If you can't, re-solve it and record the attempt below. A recall counts like a solve and moves the review forward.</p>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <label>Date <input type="date" value={attemptedOn} onChange={(event) => setAttemptedOn(event.target.value)} required /></label>
      <label>Outcome
        <select value={outcome} onChange={(event) => changeOutcome(event.target.value as Outcome)}>
          {outcomeOrder.map((value) => <option key={value} value={value}>{outcomeLabels[value]}</option>)}
        </select>
      </label>
      {helpTypeChoices && (
        <label>What help did you get?
          <select value={helpType} onChange={(event) => changeHelpType(event.target.value as HelpType)} required>
            <option value="">Choose the help you used</option>
            {helpTypeChoices.map((value) => <option key={value} value={value}>{helpTypeLabels[value]}</option>)}
          </select>
        </label>
      )}
      {difficultyChoices && (
        <label>How hard was it?
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as PerceivedDifficulty)}>
            {difficultyChoices.map((value) => <option key={value} value={value}>{difficultyLabels[value]}</option>)}
          </select>
        </label>
      )}
      <label>Time spent in minutes (optional) <input type="number" min={ATTEMPT_DURATION_MIN_MINUTES} max={ATTEMPT_DURATION_MAX_MINUTES} step="1" value={duration} onChange={(event) => setTypedDuration(event.target.value)} />
        {typedDuration === null && timerMinutes !== null && <span className="field-hint">Filled from the timer. Edit it if it's off.</span>}
      </label>
      <label>Notes for your next attempt (optional) <textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <button type="submit" disabled={saving}>Save attempt</button>
    </form>
  );
}
