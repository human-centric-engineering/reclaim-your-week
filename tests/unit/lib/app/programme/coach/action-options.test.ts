/**
 * The action-options pass — the half of the phase-5 opening that does not depend on the coach
 * remembering to make a structured call.
 *
 * These drive the real pass and stub only the two edges: the provider (so the extraction is a
 * fixture rather than a model call) and `appendSlotValue` (so the write lands somewhere readable).
 * The guards between — the phase check, the already-held check, the three-options rule, what gets
 * stored in `valueJson` — are the shipping code.
 *
 * The failure at the centre of this file is real. A live audit reached the end of phase 5 with
 * `reclaim_action_options` empty because the coach never offered three ways in at all: it went
 * straight to the chosen action. The leader then could not leave the phase, because that empty slot
 * was being counted by the coverage gate. The gate no longer counts it (`coach/coverage.ts`), and
 * this is the other half — the menu gets recorded when there is one.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** In-memory stand-in for the slot store. */
const store = new Map<string, { value: string; valueJson: unknown; sourceType: string }>();

const {
  readRunAnswers,
  resolveAgentProviderAndModel,
  getProvider,
  runStructuredCompletion,
  findUnique,
  findFirst,
} = vi.hoisted(() => ({
  readRunAnswers: vi.fn(),
  resolveAgentProviderAndModel: vi.fn(),
  getProvider: vi.fn(),
  runStructuredCompletion: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { aiAgent: { findUnique }, aiMessage: { findFirst } },
}));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers }));
vi.mock('@/lib/orchestration/llm/agent-resolver', () => ({ resolveAgentProviderAndModel }));
vi.mock('@/lib/orchestration/llm/provider-manager', () => ({ getProvider }));
vi.mock('@/lib/orchestration/llm/structured-completion', () => ({ runStructuredCompletion }));
vi.mock('@/lib/framework/data-slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/framework/data-slots')>();
  return {
    ...actual,
    appendSlotValue: vi.fn(
      async (input: {
        slotSlug: string;
        value: string;
        valueJson?: unknown;
        sourceType: string;
      }) => {
        store.set(input.slotSlug, {
          value: input.value,
          valueJson: input.valueJson ?? null,
          sourceType: input.sourceType,
        });
        return { slotSlug: input.slotSlug, version: 1 } as never;
      }
    ),
  };
});

const { sweepActionOptions, ACTION_OPTIONS_SLUG } =
  await import('@/lib/app/programme/coach/action-options');

const input = {
  userId: 'user-1',
  runId: 'run-1',
  phaseKey: 'phase-5-action',
  conversationId: 'conv-1',
};

/** The opening the coach spoke, as it would sit in the transcript. */
const OPENING = [
  'There are three places you could start, each a different way in.',
  'First, protect 7-8am Monday, Wednesday and Friday for deep work.',
  'Second, hand organisational oversight to your deputy.',
  'Third, hold your lunchtime exercise routine as a fixed commitment.',
].join('\n');

function offered(options: Array<{ title: string; impact: string }>): void {
  runStructuredCompletion.mockResolvedValue({ value: options });
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  readRunAnswers.mockResolvedValue({});
  findUnique.mockResolvedValue({
    id: 'a1',
    provider: 'openai',
    model: 'gpt-4o',
    fallbackProviders: [],
  });
  findFirst.mockResolvedValue({ content: OPENING });
  resolveAgentProviderAndModel.mockResolvedValue({ providerSlug: 'openai', model: 'gpt-4o' });
  getProvider.mockResolvedValue({});
});

describe('sweepActionOptions', () => {
  it('records the three ways in the coach offered, with the structure the summary reads', async () => {
    offered([
      { title: 'Protect 7-8am for deep work', impact: 'Five hours back a week' },
      { title: 'Hand oversight to your deputy', impact: 'Eight hours back a week' },
      { title: 'Hold the lunchtime routine', impact: 'Recovery stops being nought' },
    ]);

    const result = await sweepActionOptions(input);

    expect(result).toEqual({ recorded: true });
    const written = store.get(ACTION_OPTIONS_SLUG);
    expect(written?.valueJson).toEqual([
      { title: 'Protect 7-8am for deep work', impact: 'Five hours back a week' },
      { title: 'Hand oversight to your deputy', impact: 'Eight hours back a week' },
      { title: 'Hold the lunchtime routine', impact: 'Recovery stops being nought' },
    ]);
    // The plain string is for any surface that shows a reading as text without knowing its shape.
    expect(written?.value).toContain('Protect 7-8am for deep work');
  });

  it('writes nothing when the coach offered fewer than three, because a partial menu reads as a whole one', async () => {
    // The summary shows this as "what was on the table". Two options stored as the menu would show
    // the leader a choice they were never given, and nothing later could tell it was partial.
    offered([
      { title: 'Protect 7-8am for deep work', impact: 'Five hours back' },
      { title: 'Hand oversight to your deputy', impact: 'Eight hours back' },
    ]);

    const result = await sweepActionOptions(input);

    expect(result).toEqual({ recorded: false, skipped: 'too_few_offered', offered: 2 });
    expect(store.has(ACTION_OPTIONS_SLUG)).toBe(false);
  });

  it('writes nothing when the coach offered none, which is the live failure this exists for', async () => {
    offered([]);

    const result = await sweepActionOptions(input);

    expect(result).toEqual({ recorded: false, skipped: 'nothing_offered' });
    expect(store.has(ACTION_OPTIONS_SLUG)).toBe(false);
  });

  it("leaves the coach's own recording alone, because this is a backstop and not a second writer", async () => {
    readRunAnswers.mockResolvedValue({
      [ACTION_OPTIONS_SLUG]: {
        value: 'already there',
        valueJson: [],
        sourceType: 'direct',
        confidence: 9,
      },
    });

    const result = await sweepActionOptions(input);

    expect(result).toEqual({ recorded: false, skipped: 'already_held' });
    expect(runStructuredCompletion).not.toHaveBeenCalled();
  });

  it('runs on no phase but the one whose opening offers them', async () => {
    const result = await sweepActionOptions({ ...input, phaseKey: 'phase-1-current' });

    expect(result).toEqual({ recorded: false, skipped: 'wrong_phase' });
    expect(readRunAnswers).not.toHaveBeenCalled();
  });

  it('reads only the coach opening, so an option named in some later turn is not transcribed into the menu', async () => {
    offered([
      { title: 'One', impact: 'a' },
      { title: 'Two', impact: 'b' },
      { title: 'Three', impact: 'c' },
    ]);

    await sweepActionOptions(input);

    // One message, the most recent assistant one — not an exchange window.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-1', role: 'assistant' },
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('returns rather than throwing, because bookkeeping must never cost a leader their turn', async () => {
    runStructuredCompletion.mockRejectedValue(new Error('provider is throttling'));

    await expect(sweepActionOptions(input)).resolves.toEqual({
      recorded: false,
      skipped: 'failed',
    });
    expect(store.has(ACTION_OPTIONS_SLUG)).toBe(false);
  });

  it('says nothing about a run with no transcript yet', async () => {
    findFirst.mockResolvedValue(null);

    const result = await sweepActionOptions(input);

    expect(result).toEqual({ recorded: false, skipped: 'no_transcript' });
  });
});
