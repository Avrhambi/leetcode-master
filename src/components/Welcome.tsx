import { useState } from 'react';
import { finishOnboarding } from '../db/onboarding';
import { DEFAULT_PROBLEM_SET } from '../services/problemSet';
import type { ProblemList } from '../types/models';
import { ProblemSetPicker } from './ProblemSetPicker';

interface WelcomeProps {
  counts: Record<ProblemList, number>;
  // After the last step: open "mark problems you already know", or just start.
  onDone: (markKnown: boolean) => void;
}

const STEPS = ['Welcome', 'Your list', 'Head start'] as const;

// First-run welcome (T25), shown once to someone with no history: what the app
// does, which list to work through, and an optional head start from problems
// already solved. Rendered inside `Overlay`; closing it early keeps the default list.
export function Welcome({ counts, onDone }: WelcomeProps) {
  const [step, setStep] = useState(0);
  const [set, setSet] = useState<ProblemList>(DEFAULT_PROBLEM_SET);
  const [failed, setFailed] = useState<boolean | null>(null);

  const finish = (markKnown: boolean) => {
    setFailed(null);
    void finishOnboarding(set).then(() => onDone(markKnown), () => setFailed(markKnown));
  };

  return <section className="welcome" aria-label="Welcome">
    <ol className="welcome-steps" aria-label="Steps">
      {STEPS.map((label, index) => <li key={label} data-current={index === step} data-done={index < step}>{label}</li>)}
    </ol>
    {step === 0 && <>
      <h2>Practise interview problems, one day at a time</h2>
      <ul className="welcome-points">
        <li><b>Today's challenge</b> picks a few problems for the time you have. Solve one, then tell the app how it went.</li>
        <li><b>Reviews</b> bring a problem back just before you would forget the pattern.</li>
        <li><b>The route</b> shows each topic filling up as you go. Pick a stop to see its problems.</li>
      </ul>
      <p className="welcome-note">Everything stays in this browser. Export a backup from Settings now and then.</p>
      <div className="welcome-actions"><button type="button" onClick={() => setStep(1)}>Get started</button></div>
    </>}
    {step === 1 && <>
      <h2>Which list are you working through?</h2>
      <p>You can change it any time in Settings. The 150 is a good default.</p>
      <ProblemSetPicker value={set} counts={counts} onChange={setSet} />
      <div className="welcome-actions"><button type="button" className="welcome-secondary" onClick={() => setStep(0)}>Back</button><button type="button" onClick={() => setStep(2)}>Next</button></div>
    </>}
    {step === 2 && <>
      <h2>Already solved some of them?</h2>
      <p>Mark the ones you know and the plan skips ahead. They come back as reviews in a week or two, so nothing is lost.</p>
      <div className="welcome-actions">
        <button type="button" className="welcome-secondary" onClick={() => setStep(1)}>Back</button>
        <button type="button" className="welcome-secondary" onClick={() => finish(true)}>Mark problems I know</button>
        <button type="button" onClick={() => finish(false)}>Start practising</button>
      </div>
      {failed !== null && <p role="alert">Your choice could not be saved. <button type="button" onClick={() => finish(failed)}>Retry</button></p>}
    </>}
  </section>;
}
