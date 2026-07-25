/**
 * Consent (F8 t-4). Prisma is mocked.
 *
 * This is the compliance artifact, so the tests are about evidence rather than UX: consent is to a
 * **version** (an older acceptance does not satisfy a newer policy), a double-submit updates rather
 * than writing a second ambiguous record, and `marketingOptIn` is never set as a side effect of
 * accepting terms (reconciliation 7 — list membership is a separate fact from having an account).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { consentFindMany, consentCreate, consentUpdateMany } = vi.hoisted(() => ({
  consentFindMany: vi.fn(),
  consentCreate: vi.fn(),
  consentUpdateMany: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimConsent: {
      findMany: consentFindMany,
      create: consentCreate,
      updateMany: consentUpdateMany,
    },
  },
}));

import {
  readConsent,
  recordConsent,
  ConsentRequiredError,
} from '@/lib/app/programme/access/consent';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  userId: 'u1',
  policyVersion: 'draft-1',
  marketingOptIn: false,
  acceptedAt: new Date('2026-07-01'),
  ...over,
});

const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

beforeEach(() => {
  vi.clearAllMocks();
  consentFindMany.mockResolvedValue([]);
  consentCreate.mockResolvedValue(row());
  consentUpdateMany.mockResolvedValue({ count: 1 });
});

describe('readConsent', () => {
  it('reports not-accepted when the user has never consented', async () => {
    expect(await readConsent('u1', 'draft-1')).toEqual({
      accepted: false,
      policyVersion: 'draft-1',
      marketingOptIn: false,
    });
  });

  it('accepts only the CURRENT version — an older acceptance does not carry forward', async () => {
    consentFindMany.mockResolvedValue([row({ policyVersion: 'draft-1' })]);

    expect((await readConsent('u1', 'draft-1')).accepted).toBe(true);
    expect((await readConsent('u1', '2026-09-01')).accepted).toBe(false);
  });

  it('carries the most recent marketing preference forward across versions', async () => {
    consentFindMany.mockResolvedValue([
      row({
        policyVersion: '2026-09-01',
        marketingOptIn: true,
        acceptedAt: new Date('2026-09-02'),
      }),
      row({ policyVersion: 'draft-1', marketingOptIn: false }),
    ]);

    // Not yet accepted the newest policy, but their standing preference is remembered so the form
    // reflects it rather than silently resetting it to "no".
    const state = await readConsent('u1', '2026-10-01');
    expect(state.accepted).toBe(false);
    expect(state.marketingOptIn).toBe(true);
  });
});

describe('recordConsent', () => {
  it('records the version, the timestamp, and the marketing choice as its own field', async () => {
    await recordConsent('u1', 'draft-1', false);

    const args = consentCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data).toEqual({ userId: 'u1', policyVersion: 'draft-1', marketingOptIn: false });
  });

  it('never infers marketing consent from accepting terms', async () => {
    await recordConsent('u1', 'draft-1', false);

    const args = consentCreate.mock.calls[0]?.[0] as { data: { marketingOptIn: boolean } };
    expect(args.data.marketingOptIn).toBe(false);
  });

  it('updates in place on a double-submit rather than writing a second record', async () => {
    consentCreate.mockRejectedValue(uniqueViolation);

    await recordConsent('u1', 'draft-1', true);

    const args = consentUpdateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(args.where).toEqual({ userId: 'u1', policyVersion: 'draft-1' });
    expect(args.data).toEqual({ marketingOptIn: true });
  });

  it('re-throws a real database error instead of swallowing it as a duplicate', async () => {
    consentCreate.mockRejectedValue(new Error('connection lost'));

    await expect(recordConsent('u1', 'draft-1', false)).rejects.toThrow('connection lost');
    expect(consentUpdateMany).not.toHaveBeenCalled();
  });
});

describe('ConsentRequiredError', () => {
  it('carries the version the leader must accept, and answers 403 like an entitlement refusal', () => {
    const error = new ConsentRequiredError('draft-1');
    expect(error.policyVersion).toBe('draft-1');
    expect(error.message).toMatch(/accept the terms/i);
  });
});
