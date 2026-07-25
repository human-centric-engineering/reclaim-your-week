/**
 * The refer-back (F7 t-2, I13). `readRunAnswers` + Prisma are mocked. Load-bearing: the leader's Phase
 * 0 words come back **verbatim** and **run-scoped** — from slot data, never invented — and the block is
 * empty when nothing was captured.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { readAnswersMock, findFirstMock } = vi.hoisted(() => ({
  readAnswersMock: vi.fn(),
  findFirstMock: vi.fn(),
}));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers: readAnswersMock }));
vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimAuditRun: { findFirst: findFirstMock } },
}));

import { buildReferBack, buildReferBackForActiveRun } from '@/lib/app/programme/refer-back';

const answer = (value: string) => ({ value, valueJson: null });

beforeEach(() => {
  readAnswersMock.mockReset();
  findFirstMock.mockReset();
});

describe('buildReferBack', () => {
  it('returns the two Phase 0 answers verbatim and quotes them in the context block', async () => {
    readAnswersMock.mockResolvedValue({
      reclaim_setup_keeping_me_up: answer('Whether the team can run without me.'),
      reclaim_setup_why_now: answer('A board review is coming up.'),
    });
    const referBack = await buildReferBack('u1', 'run-1');
    expect(referBack.keepingMeUp).toBe('Whether the team can run without me.');
    expect(referBack.whyNow).toBe('A board review is coming up.');
    expect(referBack.contextBlock).toContain('"Whether the team can run without me."');
    expect(referBack.contextBlock).toContain('"A board review is coming up."');
    expect(referBack.contextBlock.toLowerCase()).toContain('verbatim'); // instructs the coach not to paraphrase
  });

  it('reads run-scoped — the two setup slugs for THIS run', async () => {
    readAnswersMock.mockResolvedValue({});
    await buildReferBack('u1', 'run-1');
    expect(readAnswersMock).toHaveBeenCalledWith('u1', 'run-1', [
      'reclaim_setup_keeping_me_up',
      'reclaim_setup_why_now',
    ]);
  });

  it('is empty when neither answer was captured (no fabricated block)', async () => {
    readAnswersMock.mockResolvedValue({});
    const referBack = await buildReferBack('u1', 'run-1');
    expect(referBack.keepingMeUp).toBeNull();
    expect(referBack.whyNow).toBeNull();
    expect(referBack.contextBlock).toBe('');
  });
});

describe('buildReferBackForActiveRun', () => {
  it('resolves the active run and builds its refer-back', async () => {
    findFirstMock.mockResolvedValue({ id: 'run-9' });
    readAnswersMock.mockResolvedValue({ reclaim_setup_why_now: answer('Now feels right.') });
    const referBack = await buildReferBackForActiveRun('u1');
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'in_progress' },
      select: { id: true },
    });
    expect(readAnswersMock).toHaveBeenCalledWith('u1', 'run-9', expect.any(Array));
    expect(referBack.whyNow).toBe('Now feels right.');
  });

  it('is empty when the user has no active run', async () => {
    findFirstMock.mockResolvedValue(null);
    const referBack = await buildReferBackForActiveRun('u1');
    expect(referBack.contextBlock).toBe('');
    expect(readAnswersMock).not.toHaveBeenCalled();
  });
});
