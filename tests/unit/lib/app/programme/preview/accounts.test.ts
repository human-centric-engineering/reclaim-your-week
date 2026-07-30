/**
 * The preview-account registry (F19). Prisma is mocked — no DB.
 *
 * Small module, but two of its behaviours are load-bearing and neither is obvious from reading it:
 *
 *   - **`excludeIds([])` is `undefined`, not `{ notIn: [] }`.** This filter is added to five hot cohort
 *     queries. Prisma drops an undefined field, so an install with no preview accounts emits exactly
 *     the SQL it emitted before F19 — which is every production install until somebody makes one.
 *   - **`registerPreviewAccount` is idempotent.** The caller provisions an account first and registers
 *     it second; a retry after a later failure must not be the thing that breaks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { findMany, findUnique, create, deleteMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimPreviewAccount: { findMany, findUnique, create, deleteMany } },
}));

import {
  previewUserIds,
  previewUserIdSet,
  excludeIds,
  registerPreviewAccount,
  isPreviewAccount,
  unregisterPreviewAccount,
} from '@/lib/app/programme/preview/accounts';

const uniqueViolation = Object.assign(new Error('unique'), { code: 'P2002' });

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue(null);
  create.mockResolvedValue({ id: 'pa1' });
  deleteMany.mockResolvedValue({ count: 1 });
});

describe('excludeIds', () => {
  it('is undefined for an empty set, so the SQL is unchanged on an install with no test accounts', () => {
    // The whole point: `{ notIn: [] }` would be a filter Prisma emits into five cohort queries for no
    // reason. `undefined` is a field Prisma does not emit at all.
    expect(excludeIds([])).toBeUndefined();
  });

  it('excludes the ids it is given', () => {
    expect(excludeIds(['u1', 'u2'])).toEqual({ notIn: ['u1', 'u2'] });
  });

  it('copies the ids rather than aliasing the caller’s array', () => {
    const ids = ['u1'];
    const filter = excludeIds(ids);
    ids.push('u2');

    expect(filter).toEqual({ notIn: ['u1'] });
  });
});

describe('previewUserIds', () => {
  it('reads only the registry table, selecting only the id', async () => {
    findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

    expect(await previewUserIds()).toEqual(['u1', 'u2']);
    // No `user` read, no join. `nudges/tick.ts` imports this module and is not an admin route, so a
    // cross-user read here would make one reachable without `withAdminAuth` (admin-support.test.ts).
    expect(findMany).toHaveBeenCalledWith({ select: { userId: true } });
  });

  it('is empty on an install that has never made one', async () => {
    expect(await previewUserIds()).toEqual([]);
    expect(excludeIds(await previewUserIds())).toBeUndefined();
  });

  it('offers the same ids as a set for badging', async () => {
    findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

    const set = await previewUserIdSet();

    expect(set.has('u1')).toBe(true);
    expect(set.has('u3')).toBe(false);
  });
});

describe('registerPreviewAccount', () => {
  it('records the account, trimming the label', async () => {
    await registerPreviewAccount({
      userId: 'u1',
      label: '  Rashmir’s walkthrough  ',
      createdByUserId: 'admin-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'u1', label: 'Rashmir’s walkthrough', createdByUserId: 'admin-1' },
    });
  });

  it('is idempotent — an already-registered account is already in the asked-for state', async () => {
    create.mockRejectedValue(uniqueViolation);

    await expect(
      registerPreviewAccount({ userId: 'u1', label: 'again', createdByUserId: 'admin-1' })
    ).resolves.toBeUndefined();
  });

  it('does not swallow a real database failure as if it were a duplicate', async () => {
    // A registration that silently did nothing would leave a test account counted as a client, which
    // is the one outcome this table exists to prevent.
    create.mockRejectedValue(new Error('connection refused'));

    await expect(
      registerPreviewAccount({ userId: 'u1', label: 'x', createdByUserId: 'admin-1' })
    ).rejects.toThrow('connection refused');
  });
});

describe('isPreviewAccount', () => {
  it('is true for a registered account', async () => {
    findUnique.mockResolvedValue({ id: 'pa1' });

    expect(await isPreviewAccount('u1')).toBe(true);
  });

  it('is false for an unknown account', async () => {
    // The fabricators' interlock: a mistyped id must fail this check rather than fall through and
    // rewrite a real leader's audit.
    expect(await isPreviewAccount('someone-else')).toBe(false);
  });
});

describe('unregisterPreviewAccount', () => {
  it('reports whether a row was actually removed', async () => {
    expect(await unregisterPreviewAccount('u1')).toBe(true);

    deleteMany.mockResolvedValue({ count: 0 });
    expect(await unregisterPreviewAccount('u1')).toBe(false);
  });
});
