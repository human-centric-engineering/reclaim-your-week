/**
 * The entitlement gate (I14) — F6 t-1, rewritten for F8 t-2. Prisma and the config read are mocked.
 *
 * **What changed and why the old tests had to go:** F6 asserted that a first run *bootstraps a free
 * grant* for any account. That was the documented least-risky path while no invite flow existed, and it
 * is exactly what made the product self-serve in production. F8 replaces it — no live grant means
 * resolve an invite or refuse. A test asserting the bootstrap would now be asserting the bug.
 *
 * Load-bearing: an uninvited account is refused; an invite resolves once and only once; the client
 * window is what bounds the client tier (not its audit count); an expired window and an exhausted free
 * grant each refuse with the right reason.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  userFindUnique,
  grantFindMany,
  grantUpdate,
  redeemMock,
  openSignupMock,
  configMock,
  readConsentMock,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  grantFindMany: vi.fn(),
  grantUpdate: vi.fn(),
  redeemMock: vi.fn(),
  openSignupMock: vi.fn(),
  configMock: vi.fn(),
  readConsentMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    reclaimGrant: { findMany: grantFindMany, update: grantUpdate },
  },
}));
vi.mock('@/lib/app/programme/access/grants', () => ({
  redeemInviteForUser: redeemMock,
  grantOpenSignupTier: openSignupMock,
}));
vi.mock('@/lib/app/programme/config', () => ({ readReclaimAccessConfig: configMock }));
// Consent is a real gate in front of entitlement (F8 t-4) — mocked here so these tests speak about
// entitlement; the consent gate has its own file, and `consent blocks the run` is asserted below.
vi.mock('@/lib/app/programme/access/consent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/app/programme/access/consent')>();
  return { ...actual, readConsent: readConsentMock };
});

import {
  assertEntitled,
  consumeAudit,
  grantIsLive,
  EntitlementRefused,
} from '@/lib/app/programme/runs/entitlement';
import { ConsentRequiredError } from '@/lib/app/programme/access/consent';

const CONFIG = {
  clientWindowMonths: 12,
  clientMustStartWithinDays: 30,
  openSignup: false,
  policyVersion: 'draft-1',
};

const grant = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  userId: 'u1',
  tier: 'free',
  auditsGranted: 1,
  auditsUsed: 0,
  windowStartsAt: null,
  mustStartBy: null,
  sourceInviteId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  configMock.mockResolvedValue({ ...CONFIG });
  userFindUnique.mockResolvedValue({ email: 'leader@example.org' });
  grantFindMany.mockResolvedValue([]);
  redeemMock.mockResolvedValue(null);
  grantUpdate.mockResolvedValue(grant());
  readConsentMock.mockResolvedValue({
    accepted: true,
    policyVersion: 'draft-1',
    marketingOptIn: false,
  });
});

describe('assertEntitled — the door', () => {
  it('REFUSES an account with no invite and no grant (the F6 bootstrap is gone)', async () => {
    await expect(assertEntitled('u1')).rejects.toBeInstanceOf(EntitlementRefused);
    await expect(assertEntitled('u1')).rejects.toMatchObject({ reason: 'no_invite' });
    expect(openSignupMock).not.toHaveBeenCalled();
  });

  it('resolves a live invite into a grant and allows the run', async () => {
    redeemMock.mockResolvedValue('client');

    await expect(assertEntitled('u1')).resolves.toBeUndefined();

    expect(redeemMock).toHaveBeenCalledWith(
      'u1',
      'leader@example.org',
      expect.objectContaining({ clientMustStartWithinDays: 30 }),
      expect.any(Date)
    );
  });

  it('does not try to redeem when a live grant already exists', async () => {
    grantFindMany.mockResolvedValue([grant()]);

    await expect(assertEntitled('u1')).resolves.toBeUndefined();
    expect(redeemMock).not.toHaveBeenCalled();
  });

  it('opens the door for an uninvited account only when openSignup is on', async () => {
    configMock.mockResolvedValue({ ...CONFIG, openSignup: true });

    await expect(assertEntitled('u1')).resolves.toBeUndefined();
    expect(openSignupMock).toHaveBeenCalledWith('u1');
  });

  it('refuses an exhausted free grant, and says so distinctly from never having had access', async () => {
    grantFindMany.mockResolvedValue([grant({ auditsUsed: 1 })]);

    await expect(assertEntitled('u1')).rejects.toMatchObject({ reason: 'exhausted' });
  });

  it('refuses an expired client window with its own reason', async () => {
    grantFindMany.mockResolvedValue([
      grant({ tier: 'client', windowStartsAt: new Date('2020-01-01') }),
    ]);

    await expect(assertEntitled('u1')).rejects.toMatchObject({ reason: 'expired' });
  });

  it('never leaks a raw error string to the leader — every refusal carries product copy', async () => {
    grantFindMany.mockResolvedValue([grant({ auditsUsed: 1 })]);

    await expect(assertEntitled('u1')).rejects.toThrow(
      /completed the audit your invitation included/
    );
  });
});

describe('assertEntitled — consent (F8 t-4)', () => {
  it('refuses before entitlement is even considered when consent is missing', async () => {
    readConsentMock.mockResolvedValue({
      accepted: false,
      policyVersion: 'draft-1',
      marketingOptIn: false,
    });
    grantFindMany.mockResolvedValue([grant()]); // a perfectly good grant — still refused

    await expect(assertEntitled('u1')).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(redeemMock).not.toHaveBeenCalled();
  });

  it('checks consent against the CURRENT policy version from config', async () => {
    configMock.mockResolvedValue({ ...CONFIG, policyVersion: '2026-08-01' });

    await assertEntitled('u1').catch(() => undefined);

    expect(readConsentMock).toHaveBeenCalledWith('u1', '2026-08-01');
  });
});

describe('grantIsLive — the two tier shapes', () => {
  const now = new Date('2026-07-25T00:00:00Z');

  it('bounds free/standard/referral by the audit count', () => {
    expect(grantIsLive(grant(), now, CONFIG)).toBe(true);
    expect(grantIsLive(grant({ auditsUsed: 1 }), now, CONFIG)).toBe(false);
  });

  it('does NOT bound the client tier by its count — the window is the limit (Brief §8)', () => {
    const client = grant({
      tier: 'client',
      auditsUsed: 7,
      auditsGranted: 1,
      windowStartsAt: new Date('2026-07-01'),
    });
    expect(grantIsLive(client, now, CONFIG)).toBe(true);
  });

  it('closes the client window 12 months after first use', () => {
    const started = grant({ tier: 'client', windowStartsAt: new Date('2025-06-01') });
    expect(grantIsLive(started, now, CONFIG)).toBe(false);
  });

  it('honours a shortened window from config without a code change', () => {
    const started = grant({ tier: 'client', windowStartsAt: new Date('2026-05-01') });
    expect(grantIsLive(started, now, CONFIG)).toBe(true);
    expect(grantIsLive(started, now, { clientWindowMonths: 1 })).toBe(false);
  });

  it('expires an unstarted grant at mustStartBy (Brief §8: start within a month of access)', () => {
    const unstarted = grant({ tier: 'client', mustStartBy: new Date('2026-07-01') });
    expect(grantIsLive(unstarted, now, CONFIG)).toBe(false);
    expect(
      grantIsLive(grant({ tier: 'client', mustStartBy: new Date('2026-08-01') }), now, CONFIG)
    ).toBe(true);
  });
});

describe('consumeAudit', () => {
  it('increments the live grant and opens the client window on FIRST use, not at issue', async () => {
    grantFindMany.mockResolvedValue([grant({ tier: 'client', windowStartsAt: null })]);

    await consumeAudit('u1');

    const args = grantUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.auditsUsed).toEqual({ increment: 1 });
    expect(args.data.windowStartsAt).toBeInstanceOf(Date);
  });

  it('does not re-open an already-started client window', async () => {
    grantFindMany.mockResolvedValue([
      grant({ tier: 'client', windowStartsAt: new Date('2026-07-01') }),
    ]);

    await consumeAudit('u1');

    const args = grantUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data).not.toHaveProperty('windowStartsAt');
  });

  it('is a no-op when nothing is live, so completing a run never fails on bookkeeping', async () => {
    grantFindMany.mockResolvedValue([grant({ auditsUsed: 1 })]);

    await expect(consumeAudit('u1')).resolves.toBeUndefined();
    expect(grantUpdate).not.toHaveBeenCalled();
  });
});
