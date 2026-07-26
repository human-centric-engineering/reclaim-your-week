/**
 * Unit tests: POST /api/v1/app/reclaim/runs/:runId/coach/stream — the coach conversation for a run.
 *
 * Three things here carry the weight, and each has a test that fails loudly if it stops being true.
 *
 *  1. **The scope.** The capture capability writes the audit because the run reaches it from the
 *     server rather than from the model (I6). If this route ever stops putting `reclaimRunId` in the
 *     dispatch scope, capture silently refuses every write and a leader's conversation records
 *     nothing. If it puts the *wrong* run there, it writes into someone else's audit.
 *  2. **The run's own conversation.** A run resumes the transcript it points at, and a run without one
 *     gets the id of the conversation the first turn opens written back to it. That is what replaced
 *     the "most recently updated active conversation" guess.
 *  3. **The refusals happen before generation.** A run that is not the caller's, or not in progress,
 *     costs no tokens.
 *
 * `streamChat` is mocked to yield a real `start` frame, so the linking pass-through is exercised
 * rather than asserted about.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/security/rate-limit', () => ({
  consumerChatLimiter: { check: vi.fn(() => ({ success: true })) },
  agentChatLimiter: { check: vi.fn(() => ({ success: true })) },
  createRateLimitResponse: vi.fn(
    () =>
      new Response(JSON.stringify({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } }), {
        status: 429,
      })
  ),
}));
vi.mock('@/lib/orchestration/chat', () => ({ streamChat: vi.fn() }));
vi.mock('@/lib/api/sse', () => ({
  // Drain the generator so the pass-through actually runs, as the real SSE bridge would.
  sseResponse: vi.fn(async (events: AsyncIterable<unknown>) => {
    for await (const _event of events) void _event;
    return new Response('data: ok\n\n', { status: 200 });
  }),
}));
vi.mock('@/lib/logging/context', () => ({
  getRequestId: vi.fn(() => Promise.resolve('req-1')),
  getVisitorId: vi.fn(() => Promise.resolve('vid-1')),
}));
vi.mock('@/lib/framework/guidance/surface', () => ({
  resolveModuleSurface: vi.fn(),
  MODULE_SURFACE_CONTEXT_TYPE: 'module',
}));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  loadCoachTurnTarget: vi.fn(),
  linkRunConversation: vi.fn(),
}));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/coach/stream/route';
import { auth } from '@/lib/auth/config';
import { consumerChatLimiter, agentChatLimiter } from '@/lib/security/rate-limit';
import { streamChat } from '@/lib/orchestration/chat';
import { resolveModuleSurface } from '@/lib/framework/guidance/surface';
import { loadCoachTurnTarget, linkRunConversation } from '@/app/api/v1/app/reclaim/runs/service';

const RUN_ID = 'clxrun00000000000000000a';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/coach/stream`,
    signal: new AbortController().signal,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

/** A stream that opens a conversation, as the real handler's first frame does. */
async function* opensConversation(id: string) {
  yield { type: 'start' as const, conversationId: id, messageId: 'm1' };
  yield { type: 'content' as const, delta: 'hello' };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: true } as never);
  vi.mocked(agentChatLimiter.check).mockReturnValue({ success: true } as never);
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1' },
    session: { id: 's1' },
  } as never);
  vi.mocked(resolveModuleSurface).mockResolvedValue({
    agentSlug: 'reclaim-coach',
    agentId: 'agent-1',
    // Deliberately a different id from the run's: the route must ignore the resolver's guess.
    conversationId: 'conv-from-the-old-guess',
    scope: { moduleSlug: 'reclaim-audit' },
    rateLimitRpm: 4,
  });
  vi.mocked(loadCoachTurnTarget).mockResolvedValue({
    conversationId: 'conv-of-this-run',
    phaseKey: 'phase-3-ideal',
  });
  vi.mocked(streamChat).mockReturnValue(opensConversation('conv-of-this-run'));
});

describe('POST reclaim coach stream', () => {
  it('puts the run and the phase in the dispatch scope', async () => {
    const res = await POST(req({ message: 'twenty hours, honestly' }), ctx());

    expect(res.status).toBe(200);
    expect(loadCoachTurnTarget).toHaveBeenCalledWith('user-1', RUN_ID);
    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'twenty hours, honestly',
        agentSlug: 'reclaim-coach',
        userId: 'user-1',
        contextType: 'module',
        contextId: 'reclaim-audit',
        scope: {
          moduleSlug: 'reclaim-audit',
          nodeKey: 'phase-3-ideal',
          reclaimRunId: RUN_ID,
        },
      })
    );
  });

  it("resumes the run's own conversation, not the resolver's most-recent guess", async () => {
    await POST(req({ message: 'hi' }), ctx());

    expect(vi.mocked(streamChat).mock.calls[0][0].conversationId).toBe('conv-of-this-run');
    // Already linked, so nothing to write back.
    expect(linkRunConversation).not.toHaveBeenCalled();
  });

  it('links the conversation the first turn opens back onto the run', async () => {
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: undefined,
      phaseKey: 'phase-0-setup',
    });
    vi.mocked(streamChat).mockReturnValue(opensConversation('conv-brand-new'));

    await POST(req({ message: 'hello' }), ctx());

    expect(vi.mocked(streamChat).mock.calls[0][0].conversationId).toBeUndefined();
    expect(linkRunConversation).toHaveBeenCalledWith(RUN_ID, 'conv-brand-new');
    expect(linkRunConversation).toHaveBeenCalledTimes(1);
  });

  it("refuses a run that is not the caller's before any generation", async () => {
    vi.mocked(loadCoachTurnTarget).mockRejectedValue(new NotFoundError('Audit run not found'));

    const res = await POST(req({ message: 'hi' }), ctx());

    expect(res.status).toBe(404);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('refuses a run that is not in progress before any generation', async () => {
    vi.mocked(loadCoachTurnTarget).mockRejectedValue(
      new ValidationError('This audit is not in progress', { run: ['x'] })
    );

    const res = await POST(req({ message: 'hi' }), ctx());

    expect(res.status).toBe(400);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('400s on a run id that is not an id at all', async () => {
    const res = await POST(req({ message: 'hi' }), ctx('../../etc/passwd'));

    expect(res.status).toBe(400);
    expect(loadCoachTurnTarget).not.toHaveBeenCalled();
  });

  it('400s on an empty message', async () => {
    const res = await POST(req({ message: '' }), ctx());

    expect(res.status).toBe(400);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('404s when the coach has no usable agent surface', async () => {
    vi.mocked(resolveModuleSurface).mockResolvedValue(null);

    const res = await POST(req({ message: 'hi' }), ctx());

    expect(res.status).toBe(404);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('honours the per-user and per-agent caps, checking the user before touching the run', async () => {
    vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: false } as never);
    const limited = await POST(req({ message: 'hi' }), ctx());
    expect(limited.status).toBe(429);
    expect(loadCoachTurnTarget).not.toHaveBeenCalled();

    vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: true } as never);
    vi.mocked(agentChatLimiter.check).mockReturnValue({ success: false } as never);
    const agentLimited = await POST(req({ message: 'hi' }), ctx());
    expect(agentLimited.status).toBe(429);
    expect(agentChatLimiter.check).toHaveBeenCalledWith('agent-1:user-1', 4);
    expect(streamChat).not.toHaveBeenCalled();
  });
});
