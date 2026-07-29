/**
 * The app context-contributor registration (F7 t-2 / I13, and the conversational phase block).
 *
 * **What this suite got wrong before, and why the fix is the first test here.** It mocked
 * `registerContextContributor`, captured the loader, and asserted what the loader returned. Every
 * assertion passed while the contributor was registered under `'reclaim-audit'` — the chat request's
 * `contextId`, not its `contextType` — so `buildContext` never dispatched it and the refer-back that
 * Brief §5 calls a data-flow requirement never reached the coach. A test that checks a loader's output
 * and not its key cannot see that. So the key is now asserted against `MODULE_CONTEXT_TYPE`, and the
 * loader tests below stand on top of it rather than in place of it.
 *
 * The framework's own module loader and both leaf blocks are mocked: what matters here is the
 * composition (framework context first, leaf blocks appended, other modules passed through
 * untouched), not what each part says.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { registerMock, moduleContextMock, referBackMock, phaseMock, presentationMock } = vi.hoisted(
  () => ({
    registerMock: vi.fn(),
    moduleContextMock: vi.fn(),
    referBackMock: vi.fn(),
    phaseMock: vi.fn(),
    presentationMock: vi.fn(),
  })
);
vi.mock('@/lib/app/programme/config', () => ({ readReclaimPresentation: presentationMock }));
vi.mock('@/lib/orchestration/chat/context-builder', () => ({
  registerContextContributor: registerMock,
}));
vi.mock('@/lib/framework/modules/context', () => ({
  loadModuleContext: moduleContextMock,
  MODULE_CONTEXT_TYPE: 'module',
}));
vi.mock('@/lib/app/programme/refer-back', () => ({ buildReferBackForActiveRun: referBackMock }));
vi.mock('@/lib/app/programme/coach/phase-context', () => ({
  buildCoachPhaseContext: phaseMock,
}));

import { initAppContextContributors } from '@/lib/app/context-contributors';
import { MODULE_CONTEXT_TYPE } from '@/lib/framework/modules/context';

type Loader = (id: string, request?: { userId?: string }) => Promise<string>;

const loader = (): Loader => registerMock.mock.calls[0][1] as Loader;

beforeEach(() => {
  registerMock.mockReset();
  moduleContextMock.mockReset();
  referBackMock.mockReset();
  phaseMock.mockReset();
  presentationMock.mockReset();
  moduleContextMock.mockResolvedValue('FRAMEWORK');
  referBackMock.mockResolvedValue({ keepingMeUp: null, whyNow: null, contextBlock: 'REFER BACK' });
  phaseMock.mockResolvedValue('PHASE');
  presentationMock.mockResolvedValue({ lean: 'paraphrase', overrides: {} });
});

describe('initAppContextContributors', () => {
  it('registers under the chat contextType, not the module slug', () => {
    // The regression guard. `contextId` is 'reclaim-audit'; `contextType` is what the registry keys on,
    // and registering under the id silently disables the contributor.
    initAppContextContributors();
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock.mock.calls[0][0]).toBe(MODULE_CONTEXT_TYPE);
    expect(registerMock.mock.calls[0][0]).not.toBe('reclaim-audit');
  });

  it("appends the phase block and the refer-back to the framework's module context", async () => {
    initAppContextContributors();
    const context = await loader()('reclaim-audit', { userId: 'u1' });

    expect(context).toBe('FRAMEWORK\n\nPHASE\n\nREFER BACK');
    expect(moduleContextMock).toHaveBeenCalledWith('reclaim-audit', { userId: 'u1' });
    expect(phaseMock).toHaveBeenCalledWith('u1');
    // The refer-back is handed the presentation policy, which is what decides whether it may call
    // itself a quote. Built beside the phase block rather than inside it, so it cannot borrow the
    // config that block already read.
    expect(referBackMock).toHaveBeenCalledWith('u1', { lean: 'paraphrase', overrides: {} });
  });

  it('still builds the refer-back when the presentation policy cannot be read', async () => {
    // A config row that will not load is not a reason to lose the leader's own words at the gap.
    presentationMock.mockRejectedValue(new Error('no config'));
    initAppContextContributors();

    const context = await loader()('reclaim-audit', { userId: 'u1' });

    expect(context).toBe('FRAMEWORK\n\nPHASE\n\nREFER BACK');
    // Falls back to the shipped default, which leans verbatim for the two refer-back slugs.
    expect(referBackMock).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        overrides: expect.objectContaining({ reclaim_setup_keeping_me_up: 'verbatim' }),
      })
    );
  });

  it('omits a leaf block that has nothing to say, without leaving a gap', async () => {
    phaseMock.mockResolvedValue('');
    referBackMock.mockResolvedValue({ keepingMeUp: null, whyNow: null, contextBlock: '' });
    initAppContextContributors();

    expect(await loader()('reclaim-audit', { userId: 'u1' })).toBe('FRAMEWORK');
  });

  it('passes another module through with only the framework context', async () => {
    initAppContextContributors();
    const context = await loader()('some-other-module', { userId: 'u1' });

    expect(context).toBe('FRAMEWORK');
    expect(phaseMock).not.toHaveBeenCalled();
    expect(referBackMock).not.toHaveBeenCalled();
  });

  it('adds no per-user block when the request carries no user', async () => {
    initAppContextContributors();
    const context = await loader()('reclaim-audit', {});

    // A shared (non-user) context request still gets the module's user-agnostic half.
    expect(context).toBe('FRAMEWORK');
    expect(phaseMock).not.toHaveBeenCalled();
    expect(referBackMock).not.toHaveBeenCalled();
  });
});
