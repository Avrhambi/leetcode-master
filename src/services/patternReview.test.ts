import { describe, expect, it } from 'vitest';
import { anchorFirst, coveredReviews, effectiveStages, isMaintenanceReview, isParked } from './patternReview';
import type { CatalogProblem, Difficulty, ProblemProgress } from '../types/models';

let order = 0;
const problem = (id: string, difficulty: Difficulty, primaryTopic = 'Two Pointers'): CatalogProblem => {
  order += 1;
  return { id, title: id, slug: id, leetcodeUrl: '', difficulty, topics: [primaryTopic], primaryTopic, neetcodeOrder: order, neetcodeUrl: '', lists: ['nc250'] };
};
const easy = problem('easy', 'easy');
const easy2 = problem('easy-2', 'easy');
const medium = problem('medium', 'medium');
const hard = problem('hard', 'hard');
const other = problem('other-medium', 'medium', 'Stack');
const problems = [easy, easy2, medium, hard, other];
const today = '2026-07-19';

const row = (problemId: string, changes: Partial<ProblemProgress>): ProblemProgress => ({ problemId, status: 'solved', reviewStage: 1, nextReviewDate: null, lastAttemptDate: null, lastQuality: 'strong', strongAttemptCount: 1, consecutiveWeak: 0, struggling: false, updatedAt: '', ...changes });
// Due today: solved on the 10th, scheduled for the 13th.
const due = (problemId: string, changes: Partial<ProblemProgress> = {}) => row(problemId, { lastAttemptDate: '2026-07-10', nextReviewDate: '2026-07-13', ...changes });
// Solved strongly on the 15th and not due until the 22nd.
const fresh = (problemId: string, changes: Partial<ProblemProgress> = {}) => row(problemId, { reviewStage: 2, lastAttemptDate: '2026-07-15', nextReviewDate: '2026-07-22', ...changes });

describe('coveredReviews', () => {
  it('covers a due strong review once a harder problem of the same topic was solved strongly after it and is still fresh', () => {
    const covered = coveredReviews(problems, [due('easy'), fresh('medium')], today);
    expect(covered.get('easy')?.id).toBe('medium');
  });

  it('does not cover while the would-be anchor is itself due, so two problems never cover each other', () => {
    expect(coveredReviews(problems, [due('easy'), due('medium', { lastAttemptDate: '2026-07-11', nextReviewDate: '2026-07-14' })], today).size).toBe(0);
  });

  it('only counts evidence from the same topic, solved after the review', () => {
    expect(coveredReviews(problems, [due('medium'), fresh('other-medium')], today).size).toBe(0);
    expect(coveredReviews(problems, [due('easy', { lastAttemptDate: '2026-07-16', nextReviewDate: '2026-07-19' }), fresh('medium')], today).size).toBe(0);
  });

  it('an Easy never vouches for a Medium; a Medium vouches for a Hard', () => {
    expect(coveredReviews(problems, [due('medium'), fresh('easy')], today).size).toBe(0);
    expect(coveredReviews(problems, [due('hard'), fresh('medium')], today).get('hard')?.id).toBe('medium');
    expect(coveredReviews(problems, [due('easy'), fresh('easy-2')], today).get('easy')?.id).toBe('easy-2');
  });

  it('covers a partial (hint) review only with a clean solve on a later day', () => {
    expect(coveredReviews(problems, [due('easy', { lastQuality: 'partial' }), fresh('medium')], today).get('easy')?.id).toBe('medium');
    const sameDay = fresh('medium', { lastAttemptDate: '2026-07-10' });
    expect(coveredReviews(problems, [due('easy', { lastQuality: 'partial' }), sameDay], today).size).toBe(0);
    // A partial result is never an anchor.
    expect(coveredReviews(problems, [due('easy'), fresh('medium', { lastQuality: 'partial' })], today).size).toBe(0);
  });

  it('never covers a failed or struggling problem', () => {
    expect(coveredReviews(problems, [due('easy', { lastQuality: 'weak', consecutiveWeak: 1 }), fresh('medium')], today).size).toBe(0);
    expect(coveredReviews(problems, [due('easy', { struggling: true }), fresh('medium')], today).size).toBe(0);
  });

  it('a mastered anchor vouches for its topic for 60 days after its last attempt', () => {
    const mastered = (lastAttemptDate: string) => row('medium', { status: 'mastered', reviewStage: 5, lastAttemptDate, nextReviewDate: null });
    expect(coveredReviews(problems, [due('easy'), mastered('2026-07-11')], today).size).toBe(1);
    expect(coveredReviews(problems, [due('easy', { lastAttemptDate: '2026-05-01', nextReviewDate: '2026-05-04' }), mastered('2026-05-10')], today).size).toBe(0);
  });
});

describe('effectiveStages', () => {
  it('lifts a covered problem to its anchor\'s stage and leaves the rest alone', () => {
    const stages = effectiveStages(problems, [due('easy', { reviewStage: 1 }), fresh('medium', { reviewStage: 3 }), due('other-medium', { reviewStage: 1 })], today);
    expect(stages.get('easy')).toBe(3);
    expect(stages.get('medium')).toBe(3);
    expect(stages.get('other-medium')).toBe(1);
  });
});

describe('anchorFirst and maintenance', () => {
  const entry = (p: CatalogProblem, changes: Partial<ProblemProgress> = {}) => ({ problem: p, progress: due(p.id, changes) });

  it('puts essential reviews first, then one maintenance review per topic, the hardest', () => {
    const queue = [entry(easy), entry(medium), entry(easy2, { lastQuality: 'partial' }), entry(other)];
    expect(anchorFirst(queue).map((item) => item.problem.id)).toEqual(['easy-2', 'medium', 'other-medium']);
  });

  it('a maintenance review is a strong last attempt, not a hint or a failure', () => {
    expect(isMaintenanceReview(due('easy'))).toBe(true);
    expect(isMaintenanceReview(due('easy', { lastQuality: 'partial' }))).toBe(false);
    expect(isMaintenanceReview(due('easy', { lastQuality: 'weak', consecutiveWeak: 1 }))).toBe(false);
  });
});

describe('isParked', () => {
  it('parks a failed problem harder than the topic skill\'s target difficulty, until the skill reaches it', () => {
    const failed = due('medium', { lastQuality: 'weak', consecutiveWeak: 1 });
    expect(isParked(medium, failed, new Map([['Two Pointers', 0.1]]))).toBe(true);
    expect(isParked(medium, failed, new Map([['Two Pointers', 0.3]]))).toBe(false);
    expect(isParked(hard, due('hard', { lastQuality: 'weak' }), new Map([['Two Pointers', 0.3]]))).toBe(true);
  });

  it('never parks an Easy, a hint or a success', () => {
    expect(isParked(easy, due('easy', { lastQuality: 'weak' }), new Map())).toBe(false);
    expect(isParked(medium, due('medium', { lastQuality: 'partial' }), new Map())).toBe(false);
    expect(isParked(medium, due('medium'), new Map())).toBe(false);
  });
});
