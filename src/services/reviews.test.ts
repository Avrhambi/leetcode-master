import { describe, expect, it } from 'vitest';
import { localDate, progressAfterAttempt, qualityFor, reviewDate } from './reviews';
import type { ProblemProgress, Quality } from '../types/models';

const progress = (changes: Partial<ProblemProgress> = {}): ProblemProgress => ({
  problemId: 'one', status: 'attempted', reviewStage: 0, nextReviewDate: null, lastAttemptDate: null,
  lastQuality: null, strongAttemptCount: 0, consecutiveWeak: 0, struggling: false, updatedAt: '', ...changes
});

describe('attempt quality', () => {
  it('classifies outcome and perceived difficulty', () => {
    expect(qualityFor('solved_independently', 'easy')).toBe('strong');
    expect(qualityFor('solved_independently', 'hard')).toBe('partial');
    expect(qualityFor('solved_with_hint', 'manageable')).toBe('partial');
    expect(qualityFor('watched_solution', 'easy')).toBe('weak');
    expect(qualityFor('could_not_solve', 'easy')).toBe('weak');
  });
});

describe('review progress', () => {
  const today = new Date(2026, 6, 19);
  it('uses local calendar dates for stages', () => {
    expect(localDate(1, today)).toBe('2026-07-20');
    expect(reviewDate(0, today)).toBe('2026-07-20');
    expect(reviewDate(1, today)).toBe('2026-07-22');
    expect(reviewDate(4, today)).toBe('2026-08-18');
    expect(reviewDate(5, today)).toBeNull();
  });
  it('resets weak attempts and drops partial attempts one stage', () => {
    const existing = progress({ status: 'mastered', reviewStage: 5, lastQuality: 'strong', strongAttemptCount: 3 });
    expect(progressAfterAttempt(existing, 'weak', '2026-07-19', 'now', false, today)).toMatchObject({ status: 'attempted', reviewStage: 0, nextReviewDate: '2026-07-20', strongAttemptCount: 3, consecutiveWeak: 1 });
    expect(progressAfterAttempt(existing, 'partial', '2026-07-19', 'now', false, today)).toMatchObject({ status: 'solved', reviewStage: 4, nextReviewDate: '2026-08-18' });
  });
  it('caps strong attempts at mastery', () => {
    const existing = progress({ status: 'solved', reviewStage: 4, nextReviewDate: '2026-08-18', lastQuality: 'strong', strongAttemptCount: 2 });
    expect(progressAfterAttempt(existing, 'strong', '2026-07-19', 'now', false, today)).toMatchObject({ status: 'mastered', reviewStage: 5, nextReviewDate: null, strongAttemptCount: 3 });
  });

  describe('once-per-day stage guard', () => {
    it('freezes stage and next review when an attempt already exists for that day', () => {
      const existing = progress({ status: 'solved', reviewStage: 2, nextReviewDate: '2026-07-26', lastQuality: 'strong' });
      const result = progressAfterAttempt(existing, 'strong', '2026-07-19', 'now', true, today);
      expect(result.reviewStage).toBe(2);
      expect(result.nextReviewDate).toBe('2026-07-26');
      // soft signals still move
      expect(result.lastQuality).toBe('strong');
      expect(result.strongAttemptCount).toBe(1);
    });
    it('does not re-advance the stage when a weak second pass follows a strong one', () => {
      const existing = progress({ status: 'solved', reviewStage: 3, nextReviewDate: '2026-08-02', lastQuality: 'strong' });
      const result = progressAfterAttempt(existing, 'weak', '2026-07-19', 'now', true, today);
      expect(result.reviewStage).toBe(3);
      expect(result.nextReviewDate).toBe('2026-08-02');
      // status frozen too: a same-day weak pass must not flip a scheduled review
      // back to 'attempted' (which would re-enter the new-problem pool)
      expect(result.status).toBe('solved');
      expect(result.lastQuality).toBe('weak');
      expect(result.consecutiveWeak).toBe(1);
    });
    it('advances normally for a genuinely new day (not already attempted)', () => {
      const existing = progress({ status: 'solved', reviewStage: 2, nextReviewDate: '2026-07-26', lastQuality: 'strong' });
      const result = progressAfterAttempt(existing, 'strong', '2026-07-19', 'now', false, today);
      expect(result.reviewStage).toBe(3);
    });
    it('a backdated attempt for an already-covered earlier day is guarded the same way', () => {
      // caller passes alreadyAttemptedToday computed from that earlier date, not wall-clock
      const existing = progress({ status: 'solved', reviewStage: 4, nextReviewDate: '2026-08-18', lastQuality: 'strong' });
      const result = progressAfterAttempt(existing, 'strong', '2026-07-10', 'now', true, today);
      expect(result.reviewStage).toBe(4);
      expect(result.nextReviewDate).toBe('2026-08-18');
    });
  });

  describe('struggling-problem de-escalation', () => {
    const run = (existing: ProblemProgress, qualities: Quality[]) =>
      qualities.reduce((acc, q) => progressAfterAttempt(acc, q, '2026-07-19', 'now', false, today), existing);

    it('flags struggling after 3 consecutive weak attempts', () => {
      const result = run(progress(), ['weak', 'weak', 'weak']);
      expect(result.consecutiveWeak).toBe(3);
      expect(result.struggling).toBe(true);
    });
    it('backs off the next review date once struggling, instead of always tomorrow', () => {
      const twoWeak = run(progress(), ['weak', 'weak']);
      expect(twoWeak.nextReviewDate).toBe('2026-07-20'); // still tomorrow at count 2
      const threeWeak = progressAfterAttempt(twoWeak, 'weak', '2026-07-19', 'now', false, today);
      expect(threeWeak.nextReviewDate).toBe('2026-07-21'); // +2 days
      const fourWeak = progressAfterAttempt(threeWeak, 'weak', '2026-07-19', 'now', false, today);
      expect(fourWeak.nextReviewDate).toBe('2026-07-23'); // +4 days
      const fiveWeak = progressAfterAttempt(fourWeak, 'weak', '2026-07-19', 'now', false, today);
      expect(fiveWeak.nextReviewDate).toBe('2026-07-26'); // +7 days, then held
      const sixWeak = progressAfterAttempt(fiveWeak, 'weak', '2026-07-19', 'now', false, today);
      expect(sixWeak.nextReviewDate).toBe('2026-07-26'); // ladder clamped
    });
    it('a strong attempt clears struggling and resets the weak run', () => {
      const struggling = run(progress(), ['weak', 'weak', 'weak']);
      const recovered = progressAfterAttempt(struggling, 'strong', '2026-07-19', 'now', false, today);
      expect(recovered.struggling).toBe(false);
      expect(recovered.consecutiveWeak).toBe(0);
    });
    it('a partial attempt does not clear struggling but stops the weak run', () => {
      const struggling = run(progress(), ['weak', 'weak', 'weak']);
      const partial = progressAfterAttempt(struggling, 'partial', '2026-07-19', 'now', false, today);
      expect(partial.consecutiveWeak).toBe(0);
      expect(partial.struggling).toBe(true);
    });
  });

  describe('T11 stage rules', () => {
    // Stage 2 reviewed on 07-01, scheduled for 07-08 (7-day interval).
    const scheduled = progress({ status: 'solved', reviewStage: 2, lastAttemptDate: '2026-07-01', nextReviewDate: '2026-07-08', lastQuality: 'strong', strongAttemptCount: 2 });

    it('a strong recall on time advances one stage', () => {
      expect(progressAfterAttempt(scheduled, 'strong', '2026-07-08', 'now', false, today).reviewStage).toBe(3);
    });
    it('a strong recall at least 2x the scheduled interval late advances two stages', () => {
      expect(progressAfterAttempt(scheduled, 'strong', '2026-07-15', 'now', false, today)).toMatchObject({ reviewStage: 4, nextReviewDate: '2026-08-18' });
      expect(progressAfterAttempt(scheduled, 'strong', '2026-07-14', 'now', false, today).reviewStage).toBe(3); // 13 days < 14
    });
    it('late-recall credit is capped at stage 5 and gives mastered', () => {
      const four = progress({ ...scheduled, reviewStage: 4, lastAttemptDate: '2026-06-01', nextReviewDate: '2026-07-01' });
      expect(progressAfterAttempt(four, 'strong', '2026-08-01', 'now', false, today)).toMatchObject({ reviewStage: 5, status: 'mastered', nextReviewDate: null });
    });
    it('late recall needs a scheduled interval; weak and partial attempts get no credit', () => {
      expect(progressAfterAttempt(progress({ reviewStage: 2 }), 'strong', '2026-07-19', 'now', false, today).reviewStage).toBe(3);
      expect(progressAfterAttempt(scheduled, 'partial', '2026-07-30', 'now', false, today).reviewStage).toBe(1);
      expect(progressAfterAttempt(scheduled, 'weak', '2026-07-30', 'now', false, today).reviewStage).toBe(0);
    });
    it('the same-day freeze still wins over late-recall credit', () => {
      expect(progressAfterAttempt(scheduled, 'strong', '2026-07-30', 'now', true, today).reviewStage).toBe(2);
    });
    it('a partial attempt drops one stage, never below 1', () => {
      expect(progressAfterAttempt(progress({ reviewStage: 3 }), 'partial', '2026-07-19', 'now', false, today)).toMatchObject({ reviewStage: 2, nextReviewDate: '2026-07-26' });
      expect(progressAfterAttempt(progress({ reviewStage: 1 }), 'partial', '2026-07-19', 'now', false, today).reviewStage).toBe(1);
      expect(progressAfterAttempt(undefined, 'partial', '2026-07-19', 'now', false, today).reviewStage).toBe(1);
    });
    it('a confident first solve starts at stage 2 and reviews in 7 days', () => {
      expect(progressAfterAttempt(undefined, 'strong', '2026-07-19', 'now', false, today, 'easy')).toMatchObject({ reviewStage: 2, status: 'solved', nextReviewDate: '2026-07-26' });
    });
    it('only a first, easy, strong solve counts as confident', () => {
      expect(progressAfterAttempt(undefined, 'strong', '2026-07-19', 'now', false, today, 'manageable').reviewStage).toBe(1);
      expect(progressAfterAttempt(undefined, 'strong', '2026-07-19', 'now', false, today).reviewStage).toBe(1);
      expect(progressAfterAttempt(undefined, 'partial', '2026-07-19', 'now', false, today, 'easy').reviewStage).toBe(1);
      const later = progress({ status: 'solved', reviewStage: 1, lastAttemptDate: '2026-07-18', nextReviewDate: '2026-07-21', lastQuality: 'strong' });
      expect(progressAfterAttempt(later, 'strong', '2026-07-19', 'now', false, today, 'easy').reviewStage).toBe(2);
      const afterWeak = progress({ reviewStage: 0, lastAttemptDate: '2026-07-18', nextReviewDate: '2026-07-19', lastQuality: 'weak', consecutiveWeak: 1 });
      expect(progressAfterAttempt(afterWeak, 'strong', '2026-07-19', 'now', false, today, 'easy').reviewStage).toBe(1);
    });
  });
});
