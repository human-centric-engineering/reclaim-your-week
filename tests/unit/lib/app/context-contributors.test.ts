/**
 * The app context-contributor registration (F7 t-2, I13). The framework's `registerContextContributor`
 * and `buildReferBackForActiveRun` are mocked, so we can capture the registered loader and check it:
 * with a `userId` it returns the refer-back block; without one it returns empty (no per-user context).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { registerMock, referBackMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  referBackMock: vi.fn(),
}));
vi.mock('@/lib/orchestration/chat/context-builder', () => ({
  registerContextContributor: registerMock,
}));
vi.mock('@/lib/app/programme/refer-back', () => ({ buildReferBackForActiveRun: referBackMock }));

import { initAppContextContributors } from '@/lib/app/context-contributors';

type Loader = (id: string, request: { userId?: string }) => Promise<string>;

beforeEach(() => {
  registerMock.mockReset();
  referBackMock.mockReset();
});

describe('initAppContextContributors', () => {
  it('registers a loader that returns the refer-back block for a user', async () => {
    initAppContextContributors();
    expect(registerMock).toHaveBeenCalledTimes(1);
    const loader = registerMock.mock.calls[0][1] as Loader;

    referBackMock.mockResolvedValue({ keepingMeUp: 'x', whyNow: null, contextBlock: 'THE BLOCK' });
    expect(await loader('reclaim-audit', { userId: 'u1' })).toBe('THE BLOCK');
    expect(referBackMock).toHaveBeenCalledWith('u1');
  });

  it('returns empty (no per-user context) when there is no userId', async () => {
    initAppContextContributors();
    const loader = registerMock.mock.calls[0][1] as Loader;
    expect(await loader('reclaim-audit', {})).toBe('');
    expect(referBackMock).not.toHaveBeenCalled();
  });
});
