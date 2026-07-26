/**
 * Who gets a quarterly nudge (F9 t-3). Pure — the rules are stated exactly, not inferred from a query.
 *
 * This is the one place the product emails someone unprompted, so these assertions are the I16
 * guarantee in executable form: **at most one nudge per audit cycle ever**, never mid-audit, never
 * after opting out. "Gentle and quarterly rather than frequent" (Brief §2) is a property of the
 * selection, not of the copy.
 */

import { describe, it, expect } from 'vitest';
import { decideNudge, decideNudges, type NudgeCandidate } from '@/lib/app/programme/nudges/select';

const NOW = new Date('2026-07-01T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function candidate(overrides: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    userId: 'u1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    lastCompletedRunId: 'run-1',
    lastCompletedAt: daysAgo(100),
    hasRunInProgress: false,
    optedOut: false,
    lastNudgedForRunId: null,
    ...overrides,
  };
}

describe('decideNudge', () => {
  it('sends to a leader a quarter past their last completed audit', () => {
    expect(decideNudge(candidate(), NOW)).toMatchObject({ send: true, reason: 'due' });
  });

  it('does not send before the cadence is up', () => {
    expect(decideNudge(candidate({ lastCompletedAt: daysAgo(30) }), NOW)).toMatchObject({
      send: false,
      reason: 'too_soon',
    });
  });

  it('never sends to someone who opted out, however overdue they are', () => {
    expect(
      decideNudge(candidate({ optedOut: true, lastCompletedAt: daysAgo(900) }), NOW)
    ).toMatchObject({ send: false, reason: 'opted_out' });
  });

  it('never sends to someone mid-audit', () => {
    // They do not need reminding to start one; they need leaving alone to finish it.
    expect(decideNudge(candidate({ hasRunInProgress: true }), NOW)).toMatchObject({
      send: false,
      reason: 'audit_in_progress',
    });
  });

  it('sends at most ONE nudge per audit — not one per quarter forever', () => {
    // Already nudged about this audit. A year later, still no second nudge: the next one is due
    // after their NEXT audit. This is the difference between a cadence and a campaign.
    const nudged = candidate({ lastNudgedForRunId: 'run-1', lastCompletedAt: daysAgo(400) });
    expect(decideNudge(nudged, NOW)).toMatchObject({
      send: false,
      reason: 'already_nudged_for_this_audit',
    });
  });

  it('becomes due again once they complete a NEW audit', () => {
    const afterSecondAudit = candidate({
      lastCompletedRunId: 'run-2',
      lastNudgedForRunId: 'run-1',
      lastCompletedAt: daysAgo(100),
    });
    expect(decideNudge(afterSecondAudit, NOW)).toMatchObject({ send: true, reason: 'due' });
  });

  it('reports the most meaningful reason when several apply', () => {
    // Opted out AND mid-audit AND too soon. An operator needs to know they opted out.
    const messy = candidate({
      optedOut: true,
      hasRunInProgress: true,
      lastCompletedAt: daysAgo(1),
    });
    expect(decideNudge(messy, NOW).reason).toBe('opted_out');
  });

  it('does not send once the audit is long past — the copy says "about three months"', () => {
    // Without an upper bound, the first tick after this ships would mail every dormant leader a note
    // claiming their audit was about three months ago. Past the window the honest thing is silence.
    expect(decideNudge(candidate({ lastCompletedAt: daysAgo(500) }), NOW)).toMatchObject({
      send: false,
      reason: 'too_long_ago',
    });
  });

  it('honours a coach-set window at both ends', () => {
    // Both ends come from `Module.config` (`nudgeAfterDays` / `nudgeUntilDays`), read by the tick —
    // so this is a capability the product has, not one the test invents.
    const c = candidate({ lastCompletedAt: daysAgo(40) });
    expect(decideNudge(c, NOW, 30, 200).send).toBe(true);
    expect(decideNudge(c, NOW, 60, 200).send).toBe(false);
    expect(decideNudge(c, NOW, 30, 35).send).toBe(false);
  });
});

describe('decideNudges', () => {
  it('decides a cohort independently', () => {
    const decisions = decideNudges(
      [
        candidate({ userId: 'due' }),
        candidate({ userId: 'out', optedOut: true }),
        candidate({ userId: 'busy', hasRunInProgress: true }),
      ],
      NOW
    );

    expect(decisions.filter((d) => d.send).map((d) => d.candidate.userId)).toEqual(['due']);
  });
});
