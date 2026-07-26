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
import { computeMeasures, buildTimeline, quarterOf } from '@/lib/app/programme/admin/measures';

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

describe('the quarterly timeline (post-v1 P9)', () => {
  const NOW = new Date('2026-08-15T00:00:00.000Z'); // 2026 Q3
  const at = (iso: string) => new Date(iso);

  it('labels a date by calendar quarter', () => {
    expect(quarterOf(at('2026-01-04T00:00:00Z'))).toBe('2026 Q1');
    expect(quarterOf(at('2026-03-31T23:59:59Z'))).toBe('2026 Q1');
    expect(quarterOf(at('2026-04-01T00:00:00Z'))).toBe('2026 Q2');
    expect(quarterOf(at('2026-12-31T00:00:00Z'))).toBe('2026 Q4');
  });

  it('counts a return in the quarter the leader came BACK, not the one they first finished', () => {
    // The whole point of the timeline: "do people come back" is a direction, and the direction is
    // only visible if the second audit lands in the quarter it happened.
    const timeline = buildTimeline({
      completedRunUserIds: ['ada', 'ada'],
      completions: [
        { userId: 'ada', completedAt: at('2026-02-10T00:00:00Z') }, // Q1 — their first
        { userId: 'ada', completedAt: at('2026-07-10T00:00:00Z') }, // Q3 — the return
      ],
      clientCount: 1,
      now: NOW,
    });

    const q1 = timeline.find((p) => p.period === '2026 Q1');
    const q3 = timeline.find((p) => p.period === '2026 Q3');
    expect(q1).toMatchObject({ completions: 1, returns: 0 });
    expect(q3).toMatchObject({ completions: 1, returns: 1 });
  });

  it('does not treat two leaders’ first audits as returns', () => {
    const timeline = buildTimeline({
      completedRunUserIds: ['ada', 'grace'],
      completions: [
        { userId: 'ada', completedAt: at('2026-07-01T00:00:00Z') },
        { userId: 'grace', completedAt: at('2026-07-02T00:00:00Z') },
      ],
      clientCount: 2,
      now: NOW,
    });

    expect(timeline.find((p) => p.period === '2026 Q3')).toMatchObject({
      completions: 2,
      returns: 0,
    });
  });

  it('orders a leader’s completions by date, whatever order the rows arrive in', () => {
    // Prisma gives no ordering guarantee here, and "was this their first?" depends entirely on it.
    const timeline = buildTimeline({
      completedRunUserIds: ['ada', 'ada'],
      completions: [
        { userId: 'ada', completedAt: at('2026-07-10T00:00:00Z') }, // later row, arrives first
        { userId: 'ada', completedAt: at('2026-02-10T00:00:00Z') },
      ],
      clientCount: 1,
      now: NOW,
    });

    expect(timeline.find((p) => p.period === '2026 Q1')?.returns).toBe(0);
    expect(timeline.find((p) => p.period === '2026 Q3')?.returns).toBe(1);
  });

  it('spans eight quarters ending in the current one, oldest first', () => {
    const timeline = buildTimeline({
      completedRunUserIds: ['ada'],
      completions: [{ userId: 'ada', completedAt: at('2026-07-01T00:00:00Z') }],
      clientCount: 1,
      now: NOW,
    });

    expect(timeline).toHaveLength(8);
    expect(timeline[0]?.period).toBe('2024 Q4');
    expect(timeline[7]?.period).toBe('2026 Q3');
  });

  it('drops activity older than the window rather than misfiling it', () => {
    const timeline = buildTimeline({
      completedRunUserIds: ['ada'],
      completions: [{ userId: 'ada', completedAt: at('2019-01-01T00:00:00Z') }],
      clientCount: 1,
      now: NOW,
    });

    expect(timeline.every((p) => p.completions === 0)).toBe(true);
  });

  it('counts referrals in the quarter they were sent', () => {
    const timeline = buildTimeline({
      completedRunUserIds: [],
      referralsSentAt: [at('2026-07-04T00:00:00Z'), at('2026-07-20T00:00:00Z')],
      clientCount: 1,
      now: NOW,
    });

    expect(timeline.find((p) => p.period === '2026 Q3')?.referralsSent).toBe(2);
  });

  it('returns an empty timeline when nothing has happened at all', () => {
    expect(buildTimeline({ completedRunUserIds: [], clientCount: 0, now: NOW })).toEqual([]);
  });

  it('is reachable from computeMeasures without changing the headline figures', () => {
    const measures = computeMeasures({
      completedRunUserIds: ['ada', 'ada'],
      completions: [
        { userId: 'ada', completedAt: at('2026-02-10T00:00:00Z') },
        { userId: 'ada', completedAt: at('2026-07-10T00:00:00Z') },
      ],
      referralInvites: [],
      clientCount: 1,
      now: NOW,
    });

    expect(measures.returnRate).toMatchObject({ completedAtLeastOne: 1, completedTwoOrMore: 1 });
    expect(measures.timeline.find((p) => p.period === '2026 Q3')?.returns).toBe(1);
  });
});
