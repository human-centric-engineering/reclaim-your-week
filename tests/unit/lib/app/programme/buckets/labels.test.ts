/**
 * Bucket relabelling (F6 t-4, I7). Prisma mocked. Load-bearing: a label attaches only to a canonical
 * slug (never renames it), the length cap is enforced, an empty label resets, and reads key by token.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { findManyMock, upsertMock, deleteManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimBucketLabel: { findMany: findManyMock, upsert: upsertMock, deleteMany: deleteManyMock },
  },
}));

import {
  readBucketLabels,
  setBucketLabel,
  LABEL_MAX_LENGTH,
} from '@/lib/app/programme/buckets/labels';
import { ValidationError } from '@/lib/api/errors';

beforeEach(() => {
  findManyMock.mockReset().mockResolvedValue([]);
  upsertMock.mockReset().mockResolvedValue(undefined);
  deleteManyMock.mockReset().mockResolvedValue(undefined);
});

describe('readBucketLabels', () => {
  it('keys labels by slot token, not the canonical hyphen slug', async () => {
    findManyMock.mockResolvedValue([{ bucketSlug: 'deep-work', label: 'Focus time' }]);
    const labels = await readBucketLabels('u1');
    expect(labels).toEqual({ deep_work: 'Focus time' });
  });
});

describe('setBucketLabel', () => {
  it('upserts a label against the canonical slug (never renames the slug, I7)', async () => {
    await setBucketLabel('u1', 'deep-work', 'Focus time');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_bucketSlug: { userId: 'u1', bucketSlug: 'deep-work' } },
        create: { userId: 'u1', bucketSlug: 'deep-work', label: 'Focus time' },
      })
    );
  });

  it('rejects a non-canonical bucket slug', async () => {
    await expect(setBucketLabel('u1', 'not-a-bucket', 'x')).rejects.toBeInstanceOf(ValidationError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a label over the length cap ("within limits")', async () => {
    await expect(
      setBucketLabel('u1', 'deep-work', 'x'.repeat(LABEL_MAX_LENGTH + 1))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('clears the label (reset to default) when given an empty string', async () => {
    await setBucketLabel('u1', 'deep-work', '   ');
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userId: 'u1', bucketSlug: 'deep-work' },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
