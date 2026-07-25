/**
 * Entitlement gate (F6 t-1, I14). Prisma is mocked, so no DB. Load-bearing: a first run bootstraps a
 * free grant and is allowed; an exhausted or expired grant refuses the run; completion consumes one.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { findManyMock, createMock, updateMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimGrant: { findMany: findManyMock, create: createMock, update: updateMock } },
}));

import {
  assertEntitled,
  consumeAudit,
  EntitlementError,
} from '@/lib/app/programme/runs/entitlement';

const grant = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'g1',
  userId: 'u1',
  tier: 'free',
  auditsGranted: 1,
  auditsUsed: 0,
  windowStartsAt: null,
  mustStartBy: null,
  createdAt: new Date('2026-01-01'),
  ...over,
});

beforeEach(() => {
  findManyMock.mockReset();
  createMock.mockReset().mockResolvedValue(grant());
  updateMock.mockReset().mockResolvedValue(grant());
});

describe('assertEntitled', () => {
  it('bootstraps a free-tier grant on first run and allows it', async () => {
    findManyMock.mockResolvedValue([]);
    await expect(assertEntitled('u1')).resolves.toBeUndefined();
    expect(createMock).toHaveBeenCalledWith({
      data: { userId: 'u1', tier: 'free', auditsGranted: 1, auditsUsed: 0 },
    });
  });

  it('allows a run when a grant has audits remaining', async () => {
    findManyMock.mockResolvedValue([grant({ auditsGranted: 1, auditsUsed: 0 })]);
    await expect(assertEntitled('u1')).resolves.toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuses when the free grant is exhausted (one complete audit used)', async () => {
    findManyMock.mockResolvedValue([grant({ auditsGranted: 1, auditsUsed: 1 })]);
    await expect(assertEntitled('u1')).rejects.toBeInstanceOf(EntitlementError);
  });

  it('refuses a client grant whose 12-month window has expired', async () => {
    findManyMock.mockResolvedValue([
      grant({
        tier: 'client',
        auditsGranted: 4,
        auditsUsed: 1,
        windowStartsAt: new Date('2024-01-01'),
      }),
    ]);
    await expect(assertEntitled('u1')).rejects.toBeInstanceOf(EntitlementError);
  });

  it('refuses an unstarted client grant past its mustStartBy deadline', async () => {
    findManyMock.mockResolvedValue([
      grant({
        tier: 'client',
        auditsUsed: 0,
        windowStartsAt: null,
        mustStartBy: new Date('2020-01-01'),
      }),
    ]);
    await expect(assertEntitled('u1')).rejects.toBeInstanceOf(EntitlementError);
  });
});

describe('consumeAudit', () => {
  it('increments auditsUsed on the live grant', async () => {
    findManyMock.mockResolvedValue([grant({ auditsGranted: 1, auditsUsed: 0 })]);
    await consumeAudit('u1');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        data: expect.objectContaining({ auditsUsed: { increment: 1 } }),
      })
    );
  });

  it('starts the client window on first use', async () => {
    findManyMock.mockResolvedValue([
      grant({ tier: 'client', auditsGranted: 4, auditsUsed: 0, windowStartsAt: null }),
    ]);
    await consumeAudit('u1');
    const call = updateMock.mock.calls[0][0];
    expect(call.data.windowStartsAt).toBeInstanceOf(Date);
  });

  it('is a no-op when there is no live grant to consume', async () => {
    findManyMock.mockResolvedValue([grant({ auditsGranted: 1, auditsUsed: 1 })]);
    await consumeAudit('u1');
    expect(updateMock).not.toHaveBeenCalled();
  });
});
