/**
 * The success measures (F10 t-2). Pure — `computeMeasures` takes rows, so these tests state a cohort
 * exactly and read the answer back rather than asserting a mock returned what it was handed.
 *
 * The load-bearing claims: a return is a **second completed audit** and not a second visit (plan D3);
 * a referral converts on the referred leader's **first completion** and not their signup; and an
 * empty cohort yields `null`, never `0%` — "nobody has finished one yet" and "nobody came back" are
 * different facts and a dashboard that conflates them misinforms its reader.
 */

import { describe, it, expect } from 'vitest';
import { computeMeasures } from '@/lib/app/programme/admin/measures';

describe('computeMeasures — return rate', () => {
  it('counts a leader with two completed audits as a return, and one with two runs of one as not', () => {
    const measures = computeMeasures({
      completedRunUserIds: ['ada', 'ada', 'grace', 'lin'],
      referralInvites: [],
      clientCount: 3,
    });

    expect(measures.returnRate.completedAtLeastOne).toBe(3);
    expect(measures.returnRate.completedTwoOrMore).toBe(1);
    expect(measures.returnRate.rate).toBeCloseTo(1 / 3);
  });

  it('reports null rather than 0% when nobody has completed an audit', () => {
    const measures = computeMeasures({
      completedRunUserIds: [],
      referralInvites: [{ redeemedByUserId: 'ada' }],
      clientCount: 4,
    });

    expect(measures.returnRate.completedAtLeastOne).toBe(0);
    // The distinction the UI depends on: null renders "not enough data yet", 0 would render "0%",
    // which is a claim about retention that four people who have not finished cannot support.
    expect(measures.returnRate.rate).toBeNull();
  });

  it('counts each leader once however many audits they completed', () => {
    const measures = computeMeasures({
      completedRunUserIds: ['ada', 'ada', 'ada', 'ada'],
      referralInvites: [],
      clientCount: 1,
    });

    expect(measures.returnRate.completedAtLeastOne).toBe(1);
    expect(measures.returnRate.completedTwoOrMore).toBe(1);
    expect(measures.returnRate.rate).toBe(1);
    expect(measures.totals.runsCompleted).toBe(4);
  });
});

describe('computeMeasures — referral conversion', () => {
  it('converts on the referred leader completing an audit, not on their accepting the invite', () => {
    const measures = computeMeasures({
      completedRunUserIds: ['grace'],
      referralInvites: [
        { redeemedByUserId: 'grace' }, // accepted and finished
        { redeemedByUserId: 'lin' }, // accepted, never finished
        { redeemedByUserId: null }, // never accepted
      ],
      clientCount: 3,
    });

    expect(measures.referral.sent).toBe(3);
    expect(measures.referral.accepted).toBe(2);
    expect(measures.referral.completed).toBe(1);
    expect(measures.referral.acceptanceRate).toBeCloseTo(2 / 3);
    expect(measures.referral.completionRate).toBe(0.5);
  });

  it('reports null ratios when no referrals have been sent', () => {
    const measures = computeMeasures({
      completedRunUserIds: ['ada'],
      referralInvites: [],
      clientCount: 1,
    });

    expect(measures.referral.sent).toBe(0);
    expect(measures.referral.acceptanceRate).toBeNull();
    expect(measures.referral.completionRate).toBeNull();
  });

  it('does not double-count a referred leader who completed several audits', () => {
    const measures = computeMeasures({
      completedRunUserIds: ['grace', 'grace', 'grace'],
      referralInvites: [{ redeemedByUserId: 'grace' }],
      clientCount: 1,
    });

    expect(measures.referral.completed).toBe(1);
    expect(measures.referral.completionRate).toBe(1);
  });
});
