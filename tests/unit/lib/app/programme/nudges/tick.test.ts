/**
 * The nudge tick and the opt-out (F9 t-3). Prisma and `sendEmail` are mocked.
 *
 * `select.test.ts` pins *who* qualifies; this pins the things only the shell can get wrong — that a
 * re-run sends nothing (the promise is "at most one", and an operator must be able to re-run a cron
 * without thinking), that the send is claimed before it is attempted, and that the opt-out is
 * idempotent for a leader whose mail client pre-fetched the link.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindMany: vi.fn(),
  userFindMany: vi.fn(),
  nudgeFindMany: vi.fn(),
  nudgeUpsert: vi.fn(),
  nudgeUpdateMany: vi.fn(),
  nudgeFindUnique: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findMany: mocks.runFindMany },
    user: { findMany: mocks.userFindMany },
    reclaimNudge: {
      findMany: mocks.nudgeFindMany,
      upsert: mocks.nudgeUpsert,
      updateMany: mocks.nudgeUpdateMany,
      findUnique: mocks.nudgeFindUnique,
    },
  },
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.sendEmail }));

import { runNudgeTick, optOutByToken } from '@/lib/app/programme/nudges/tick';

const NOW = new Date('2026-07-01T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** One leader, one completed audit 100 days ago, never nudged. */
function dueLeader() {
  mocks.runFindMany.mockImplementation((args: { where: { status: string } }) =>
    Promise.resolve(
      args.where.status === 'complete'
        ? [{ id: 'run-1', userId: 'u1', completedAt: daysAgo(100), startedAt: daysAgo(120) }]
        : []
    )
  );
  mocks.userFindMany.mockResolvedValue([
    { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' },
  ]);
  mocks.nudgeFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.nudgeUpsert.mockResolvedValue({ token: 'a'.repeat(64) });
  mocks.sendEmail.mockResolvedValue({ success: true, status: 'sent' });
});

describe('runNudgeTick', () => {
  it('sends to a due leader and claims the send against the audit it is about', async () => {
    dueLeader();

    const result = await runNudgeTick(NOW);

    expect(result.sent).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    // The claim is keyed on the RUN, not on a date — which is what makes a re-run a no-op.
    expect(mocks.nudgeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        update: expect.objectContaining({ lastNudgedForRunId: 'run-1' }),
      })
    );
  });

  it('sends nothing on a re-run — the promise is at most one per audit', async () => {
    dueLeader();
    // Second run of the tick: the row now records the nudge for this audit.
    mocks.nudgeFindMany.mockResolvedValue([
      { userId: 'u1', optedOutAt: null, lastNudgedForRunId: 'run-1', token: 'x' },
    ]);

    const result = await runNudgeTick(NOW);

    expect(result.sent).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.skipped['already_nudged_for_this_audit']).toBe(1);
  });

  it('does not email an opted-out leader', async () => {
    dueLeader();
    mocks.nudgeFindMany.mockResolvedValue([
      { userId: 'u1', optedOutAt: daysAgo(5), lastNudgedForRunId: null, token: 'x' },
    ]);

    const result = await runNudgeTick(NOW);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.skipped['opted_out']).toBe(1);
  });

  it('addresses the leader by first name only, and sends an unsubscribe link', async () => {
    dueLeader();
    await runNudgeTick(NOW);

    const props = mocks.sendEmail.mock.calls[0]?.[0] as { react: { props: unknown } };
    const rendered = JSON.stringify(props.react);
    expect(rendered).toContain('Ada');
    // Not their full name — the product collects a first name on purpose (Brief §3).
    expect(rendered).not.toContain('Lovelace');
    expect(rendered).toContain('/nudges/off/');
  });

  it('counts a failed send as not sent, and does not throw', async () => {
    dueLeader();
    mocks.sendEmail.mockRejectedValue(new Error('provider down'));

    const result = await runNudgeTick(NOW);

    expect(result.sent).toBe(0);
    // But the claim stands: a provider outage must not become four emails on the next tick. "At
    // most one" is the promise; "at least one" is not.
    expect(mocks.nudgeUpsert).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when nobody has completed an audit', async () => {
    mocks.runFindMany.mockResolvedValue([]);
    const result = await runNudgeTick(NOW);
    expect(result).toEqual({ considered: 0, sent: 0, skipped: {} });
  });
});

describe('optOutByToken', () => {
  it('turns nudges off for a known token', async () => {
    mocks.nudgeUpdateMany.mockResolvedValue({ count: 1 });
    expect(await optOutByToken('tok')).toBe(true);
  });

  it('is idempotent — a second click, or a mail client prefetch, still succeeds', async () => {
    mocks.nudgeUpdateMany.mockResolvedValue({ count: 0 });
    mocks.nudgeFindUnique.mockResolvedValue({ id: 'n1' });

    // Already opted out. The leader's intent is satisfied, so this is a success, not an error page.
    expect(await optOutByToken('tok')).toBe(true);
  });

  it('reports false for a token nobody holds', async () => {
    mocks.nudgeUpdateMany.mockResolvedValue({ count: 0 });
    mocks.nudgeFindUnique.mockResolvedValue(null);
    expect(await optOutByToken('nope')).toBe(false);
  });
});
