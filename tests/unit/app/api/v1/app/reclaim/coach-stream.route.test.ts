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
vi.mock('@/lib/orchestration/chat', () => ({
  streamChat: vi.fn(),
  invalidateContext: vi.fn(),
}));
/**
 * Every frame the route put on the wire for the turn under test.
 *
 * Kept because the choice offer is something the route *adds* rather than passes through, so there is
 * nothing to assert about it anywhere else: it exists only as a frame.
 */
const drained: ChatEvent[] = [];

vi.mock('@/lib/api/sse', () => ({
  // Drain the generator so the pass-through actually runs, as the real SSE bridge would.
  sseResponse: vi.fn(async (events: AsyncIterable<unknown>) => {
    for await (const event of events) drained.push(event as ChatEvent);
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
// Only `pendingChoiceOffer` is imported from here, and the module reaches Prisma. The capability it
// feeds is deliberately NOT mocked: it is pure, and running it for real is what proves a fallback
// offer is the same object the model's own call would have produced.
vi.mock('@/lib/app/programme/coach/phase-context', () => ({ pendingChoiceOffer: vi.fn() }));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/coach/stream/route';
import { auth } from '@/lib/auth/config';
import { consumerChatLimiter, agentChatLimiter } from '@/lib/security/rate-limit';
import { streamChat, invalidateContext } from '@/lib/orchestration/chat';
import { sseResponse } from '@/lib/api/sse';
import { resolveModuleSurface } from '@/lib/framework/guidance/surface';
import {
  loadCoachTurnTarget,
  linkRunConversation,
  claimCoachOpening,
} from '@/app/api/v1/app/reclaim/runs/service';
import { runCaptureSweep } from '@/lib/app/programme/coach/capture-sweep';
import { pendingChoiceOffer } from '@/lib/app/programme/coach/phase-context';
import { COACH_ARRIVAL_TRIGGER, COACH_OPENING_TRIGGER } from '@/lib/app/programme/coach/opening';
import { RECLAIM_OFFER_CHOICES_SLUG } from '@/lib/app/programme/agent';

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
  // Most questions are answered in the leader's own words, so no offer is the ordinary case.
  vi.mocked(pendingChoiceOffer).mockResolvedValue(null);
  drained.length = 0;
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

  /**
   * The briefing the coach reads is cached for sixty seconds, and the sweep writes after the turn.
   *
   * The model's own `record_answers` calls drop that cache entry as they land, so the list it reads is
   * honest about what it recorded itself. The sweep — which exists precisely because the model's
   * recording is a hit rate — dropped nothing, so a leader replying inside the minute met a coach
   * still holding the pre-sweep list: readings just captured came back as "not yet captured in this
   * audit", and the reading it was told to end the turn on could be one already filled.
   */
  it('drops the cached briefing when the sweep records, so the coach is not a turn behind', async () => {
    vi.mocked(runCaptureSweep).mockResolvedValue({
      recorded: ['reclaim_ideal_total_hours'],
      refused: [],
    });

    await POST(req({ message: 'about fifty would be liveable' }), ctx());

    expect(invalidateContext).toHaveBeenCalledWith('module', 'reclaim-audit', { userId: 'user-1' });
  });

  it('leaves the cache alone when the sweep found nothing to record', async () => {
    // Nothing changed, so nothing to rebuild. A drop on every turn would spend a read of the run, the
    // labels, the content and the cards on a briefing identical to the one already held.
    await POST(req({ message: 'hi' }), ctx());

    expect(invalidateContext).not.toHaveBeenCalled();
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

/**
 * The answers on screen, whether or not the coach remembered to put them there.
 *
 * **The failure this is built on, observed on a live audit.** The coach called `offer_choices` on one
 * turn and then asked the identical question three more times with no tool call at all, telling the
 * leader "you can choose from the options on your screen" while they looked at an empty text box.
 * Having called it once, the model believes the answers are still up.
 *
 * That is the same class of failure `runCaptureSweep` exists for, and it takes the same answer: the
 * offer stops depending on the call. Which reading the question is about was decided server-side
 * before the turn ran, so the route can read that decision back and put the answers up itself.
 *
 * The capability is deliberately left unmocked in this file. A fallback offer has to be
 * indistinguishable from one the model asked for — same guards, same scope, same payload — and the
 * only way to test that claim is to let the real thing produce it.
 */
describe('POST reclaim coach stream — the answers for the question just asked', () => {
  const setupPhase = () =>
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-0-setup',
    });

  const offers = () =>
    drained.filter(
      (e) => e.type === 'capability_result' && e.capabilitySlug === RECLAIM_OFFER_CHOICES_SLUG
    );

  it('puts the answers up when the coach asked the question but called nothing', async () => {
    setupPhase();
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-of-this-run'));
    vi.mocked(pendingChoiceOffer).mockResolvedValue({
      slotSlug: 'reclaim_setup_audit_period',
      label: 'The period being audited',
      options: ['last week', 'last month', 'last quarter', 'last year'],
    });

    await POST(req({ message: 'ask me that again' }), ctx());

    const [offer] = offers();
    expect(offer).toBeDefined();
    // Produced by the real capability, so the options are the audit's own rather than anything this
    // test or the route composed by hand.
    expect(offer?.type === 'capability_result' && offer.result).toEqual({
      success: true,
      data: {
        slotSlug: 'reclaim_setup_audit_period',
        label: 'The period being audited',
        options: ['last week', 'last month', 'last quarter', 'last year'],
      },
    });
  });

  it('sends the answers before the turn ends, where the composer is ready for them', async () => {
    // The client only draws an offer once the coach has stopped speaking, and it refreshes on `done`.
    // An offer arriving after that frame would reach a composer that had already settled.
    setupPhase();
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-of-this-run'));
    vi.mocked(pendingChoiceOffer).mockResolvedValue({
      slotSlug: 'reclaim_setup_audit_period',
      label: 'The period being audited',
      options: ['last week', 'last month', 'last quarter', 'last year'],
    });

    await POST(req({ message: 'ask me that again' }), ctx());

    const offerAt = drained.findIndex(
      (e) => e.type === 'capability_result' && e.capabilitySlug === RECLAIM_OFFER_CHOICES_SLUG
    );
    const doneAt = drained.findIndex((e) => e.type === 'done');
    expect(offerAt).toBeGreaterThanOrEqual(0);
    expect(offerAt).toBeLessThan(doneAt);
  });

  it('stays out of the way when the coach put them up itself', async () => {
    // The model's own call wins, because it knows something this fallback cannot: whether it followed
    // the leader somewhere other than the reading it was pointed at. Two offers in one turn would also
    // mean the second silently overwrote the first.
    setupPhase();
    vi.mocked(streamChat).mockReturnValue(
      (async function* (): AsyncGenerator<ChatEvent> {
        yield { type: 'start', conversationId: 'conv-of-this-run', messageId: 'm1' };
        yield {
          type: 'capability_result',
          capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG,
          result: {
            success: true,
            data: { slotSlug: 'reclaim_setup_in_transition', label: 'x', options: ['Yes', 'No'] },
          },
        };
        yield { type: 'content', delta: 'hello' };
        yield {
          type: 'done',
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          costUsd: 0,
        };
      })()
    );
    vi.mocked(pendingChoiceOffer).mockResolvedValue({
      slotSlug: 'reclaim_setup_audit_period',
      label: 'The period being audited',
      options: ['last week', 'last month', 'last quarter', 'last year'],
    });

    await POST(req({ message: 'ask me that again' }), ctx());

    expect(offers()).toHaveLength(1);
    const [offer] = offers();
    // The coach's, not the fallback's.
    expect(offer?.type === 'capability_result' && offer.result).toMatchObject({
      data: { slotSlug: 'reclaim_setup_in_transition' },
    });
    expect(pendingChoiceOffer).not.toHaveBeenCalled();
  });

  it('still offers when the coach’s own call was refused, because a refusal draws nothing', async () => {
    // The gap this closes. A refusal is a resolved result and reaches the client on the same frame
    // type as a success, but `offerFromEvent` maps every refusal to `null` — so a turn whose only
    // call was refused shows the leader an empty box. Standing the fallback down on it would leave
    // them worse off than before any of this existed, because the coach is now told not to list the
    // options in its prose either. Only an offer that reached the screen counts as one already made.
    setupPhase();
    vi.mocked(streamChat).mockReturnValue(
      (async function* (): AsyncGenerator<ChatEvent> {
        yield { type: 'start', conversationId: 'conv-of-this-run', messageId: 'm1' };
        yield {
          type: 'capability_result',
          capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG,
          // A slug slip — the shape the capability's own docblock anticipates.
          result: {
            success: false,
            error: { code: 'unknown_slot', message: 'no such reading' },
          },
        };
        yield { type: 'content', delta: 'which timeframe shall we look at?' };
        yield {
          type: 'done',
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          costUsd: 0,
        };
      })()
    );
    vi.mocked(pendingChoiceOffer).mockResolvedValue({
      slotSlug: 'reclaim_setup_audit_period',
      label: 'The period being audited',
      options: ['last week', 'last month', 'last quarter', 'last year'],
    });

    await POST(req({ message: 'ready when you are' }), ctx());

    // Two frames carry the slug — the coach's refusal and the fallback — and exactly one of them is
    // an offer the leader can act on.
    const drawn = offers().filter(
      (e) => e.type === 'capability_result' && (e.result as { success?: unknown }).success === true
    );
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.type === 'capability_result' && drawn[0].result).toMatchObject({
      data: { slotSlug: 'reclaim_setup_audit_period' },
    });
    expect(pendingChoiceOffer).toHaveBeenCalled();
  });

  it('sends nothing for a question answered in the leader’s own words', async () => {
    setupPhase();
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-of-this-run'));
    vi.mocked(pendingChoiceOffer).mockResolvedValue(null);

    await POST(req({ message: 'about six hours' }), ctx());

    expect(offers()).toHaveLength(0);
    expect(drained.some((e) => e.type === 'done')).toBe(true);
  });

  it('finishes the turn when the offer cannot be worked out at all', async () => {
    // An offer is a convenience over a composer that already works. A turn is the leader's
    // conversation, and it must survive anything this bookkeeping does.
    setupPhase();
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-of-this-run'));
    vi.mocked(pendingChoiceOffer).mockRejectedValue(new Error('the run could not be read'));

    const res = await POST(req({ message: 'ask me that again' }), ctx());

    expect(res.status).toBe(200);
    expect(offers()).toHaveLength(0);
    expect(drained.some((e) => e.type === 'done')).toBe(true);
  });

  it('offers on a turn the coach opened, not only on one the leader spoke first', async () => {
    // A section's first question can be a closed one, and it arrives with the leader having said
    // nothing. The capture sweep skips an opening for good reason (there is nothing to record from a
    // silence); this must not, or the answers would be missing exactly where the leader has least
    // idea what is wanted of them.
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: 'conv-of-this-run',
      phaseKey: 'phase-0-setup',
    });
    vi.mocked(streamChat).mockReturnValue(completesTurn('conv-of-this-run'));
    vi.mocked(pendingChoiceOffer).mockResolvedValue({
      slotSlug: 'reclaim_setup_audit_period',
      label: 'The period being audited',
      options: ['last week', 'last month', 'last quarter', 'last year'],
    });

    await POST(req({ kind: 'opening', moment: 'phase-0-open' }), ctx());

    expect(offers()).toHaveLength(1);
    expect(runCaptureSweep).not.toHaveBeenCalled();
  });
});
