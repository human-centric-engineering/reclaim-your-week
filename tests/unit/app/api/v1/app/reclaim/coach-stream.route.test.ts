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
import type { ChatEvent } from '@/types/orchestration';

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
  claimCoachOpening: vi.fn(),
}));
vi.mock('@/lib/app/programme/coach/capture-sweep', () => ({ runCaptureSweep: vi.fn() }));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/coach/stream/route';
import { auth } from '@/lib/auth/config';
import { consumerChatLimiter, agentChatLimiter } from '@/lib/security/rate-limit';
import { streamChat } from '@/lib/orchestration/chat';
import { sseResponse } from '@/lib/api/sse';
import { resolveModuleSurface } from '@/lib/framework/guidance/surface';
import {
  loadCoachTurnTarget,
  linkRunConversation,
  claimCoachOpening,
} from '@/app/api/v1/app/reclaim/runs/service';
import { runCaptureSweep } from '@/lib/app/programme/coach/capture-sweep';
import { COACH_ARRIVAL_TRIGGER, COACH_OPENING_TRIGGER } from '@/lib/app/programme/coach/opening';

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

/** A whole turn, terminal frame included — which is what the capture sweep hangs off. */
async function* completesTurn(id: string): AsyncGenerator<ChatEvent> {
  yield { type: 'start', conversationId: id, messageId: 'm1' };
  yield { type: 'content', delta: 'hello' };
  yield {
    type: 'done',
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    costUsd: 0,
  };
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
  vi.mocked(claimCoachOpening).mockResolvedValue(true);
  vi.mocked(runCaptureSweep).mockResolvedValue({ recorded: [], refused: [] });
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

  it('reads a body with no kind as a leader turn, so a deploy does not break a turn in flight', async () => {
    // The discriminated union picks its branch by reading `kind`, so an absent one matches no branch
    // at all. A browser still running the previous build sends exactly this shape.
    const res = await POST(req({ message: 'still typing' }), ctx());

    expect(res.status).toBe(200);
    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({ message: 'still typing' }));
  });
});

/**
 * The deterministic half of capture.
 *
 * The coach records what it notices, and across three rounds of live testing it noticed
 * inconsistently: it took a paragraph of facts every time and dropped the one-sentence answer to the
 * question it had just asked. So a sweep runs over the exchange afterwards and records what is still
 * outstanding. What these pin is that it runs at all, that it runs on the turn's terminal frame
 * rather than after the client has already refreshed, and that it never runs on a turn the leader
 * did not speak in.
 */
describe('POST reclaim coach stream — the capture sweep', () => {
  beforeEach(() => {
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-of-this-run'));
  });

  it('sweeps the exchange when a leader turn completes, in the run and phase from the server', async () => {
    await POST(req({ message: 'I end up spending more time with the Manchester people' }), ctx());

    expect(runCaptureSweep).toHaveBeenCalledWith({
      userId: 'user-1',
      runId: RUN_ID,
      phaseKey: 'phase-3-ideal',
      conversationId: 'conv-of-this-run',
    });
  });

  it('sweeps before the turn ends, so the panel the leader is watching is never a turn behind', async () => {
    const order: string[] = [];
    vi.mocked(runCaptureSweep).mockImplementation(async () => {
      order.push('sweep');
      return { recorded: [], refused: [] };
    });
    vi.mocked(sseResponse).mockImplementationOnce(((events: AsyncIterable<{ type: string }>) => {
      const drained = (async () => {
        for await (const event of events) {
          if (event.type === 'done') order.push('done');
        }
      })();
      return drained.then(() => new Response('data: ok\n\n', { status: 200 }));
    }) as unknown as typeof sseResponse);

    await POST(req({ message: 'hi' }), ctx());

    // The client refreshes on `done`. A sweep after it would show the leader a panel missing
    // everything they had just said.
    expect(order).toEqual(['sweep', 'done']);
  });

  it('finds the conversation a first turn opened, which the run did not know about yet', async () => {
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: undefined,
      phaseKey: 'phase-0-setup',
    });
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-brand-new'));

    await POST(req({ message: 'I am John, Head of Engineering' }), ctx());

    expect(runCaptureSweep).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-brand-new' })
    );
  });

  it('does not sweep an opening, because the leader has not said anything to sweep', async () => {
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-0-setup',
    });

    await POST(req({ kind: 'opening', moment: 'phase-0-open' }), ctx());

    expect(runCaptureSweep).not.toHaveBeenCalled();
  });

  it('lets the turn finish even when the sweep throws', async () => {
    // `runCaptureSweep` swallows its own failures, and the route does not take its word for it: a
    // capture pass is bookkeeping, a turn is the leader's conversation, and the day the contract
    // stops holding the cost should be an unswept turn rather than a broken one.
    vi.mocked(runCaptureSweep).mockRejectedValue(new Error('provider down'));

    const res = await POST(req({ message: 'hi' }), ctx());

    expect(res.status).toBe(200);
  });
});

describe('POST reclaim coach stream — the coach opening a moment', () => {
  it('claims the moment before generating, and sends the trigger in the leader’s place', async () => {
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-4-gap',
    });

    const res = await POST(req({ kind: 'opening', moment: 'phase-4-gap' }), ctx());

    expect(res.status).toBe(200);
    expect(claimCoachOpening).toHaveBeenCalledWith('user-1', RUN_ID, 'phase-4-gap');
    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        // Phase 4 is an arrival as well as a beat, so it is opened with the trigger that introduces
        // a phase rather than the one that opens a beat mid-conversation.
        message: COACH_ARRIVAL_TRIGGER,
        scope: expect.objectContaining({ nodeKey: 'phase-4-gap', reclaimRunId: RUN_ID }),
      })
    );
  });

  it('sends the beat trigger, not the arrival one, for a moment fired mid-phase', async () => {
    // The reveal happens when the leader presses the button, long after phase 1 introduced itself.
    // Sending the arrival trigger there would have the coach open the phase a second time.
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-1-current',
    });

    await POST(req({ kind: 'opening', moment: 'phase-1-chart-reveal' }), ctx());

    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({ message: COACH_OPENING_TRIGGER })
    );
  });

  it('generates nothing when the moment was already claimed', async () => {
    // The whole point of the ledger: a reload part-way through a stream, or a second tab, must not
    // buy the leader a second copy of a beat they have already had.
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-4-gap',
    });
    vi.mocked(claimCoachOpening).mockResolvedValue(false);

    const res = await POST(req({ kind: 'opening', moment: 'phase-4-gap' }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { opened: false } });
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('refuses a moment that does not belong to the phase the leader is on', async () => {
    // The client sends the moment; the server owns the phase. Without this a client could ask for
    // the gap presentation while the leader is still describing their week.
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-1-current',
    });

    const res = await POST(req({ kind: 'opening', moment: 'phase-4-gap' }), ctx());

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'OPENING_WRONG_PHASE' } });
    expect(claimCoachOpening).not.toHaveBeenCalled();
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('400s on a moment that is not one of ours', async () => {
    const res = await POST(req({ kind: 'opening', moment: 'phase-9-invented' }), ctx());

    expect(res.status).toBe(400);
    expect(claimCoachOpening).not.toHaveBeenCalled();
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('refuses before claiming when the run is not the caller’s', async () => {
    vi.mocked(loadCoachTurnTarget).mockRejectedValue(new NotFoundError('Audit not found'));

    const res = await POST(req({ kind: 'opening', moment: 'phase-4-gap' }), ctx());

    expect(res.status).toBe(404);
    expect(claimCoachOpening).not.toHaveBeenCalled();
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
