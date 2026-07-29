/**
 * `saveAnswer()` — the single slot write-path (F4 t-2). No DB: `appendSlotValue` and the masking
 * policy are mocked so we can assert exactly what `saveAnswer` hands the engine — the run stamp (F1),
 * the module scope, the masking route (I5), and the defaults.
 *
 * The `verbatim` tests below deliberately let `slotMaskingPolicy` run for real (via `importOriginal`)
 * rather than stubbing it: the point being proven is that `saveAnswer` routes the leader's own sentence
 * through the *actual* masking transform, not merely that it calls something named `slotMaskingPolicy`.
 * A synthetic `special_category` slot definition is added alongside the real 105 (via a partial mock of
 * `@/lib/app/programme/slots`) because I5 guarantees no real `reclaim_*` slot is ever declared at that
 * sensitivity — the redaction branch has no real-world slug to exercise it with.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

const { appendSlotValueMock, maskingMock, DEFAULTS_SLUG, SPECIAL_CATEGORY_SLUG } = vi.hoisted(
  () => ({
    appendSlotValueMock: vi.fn(),
    maskingMock: vi.fn(),
    DEFAULTS_SLUG: 'test_synthetic_defaults_slot',
    SPECIAL_CATEGORY_SLUG: 'test_synthetic_special_category_slot',
  })
);

vi.mock('@/lib/framework/data-slots', () => ({ appendSlotValue: appendSlotValueMock }));
vi.mock('@/lib/framework/data-slots/capabilities/masking', () => ({
  slotMaskingPolicy: maskingMock,
}));
// Partial mock: keep every real definition (existing tests below rely on `reclaim_*` slugs) and add
// two synthetic ones that no real content author would ever declare — one that leaves `sensitivity`
// and `dataType` unset (to exercise write.ts's own `?? default` branches), one at `special_category`
// (to exercise the I5 redaction branch, which I5 keeps permanently unreachable via any real slug).
vi.mock('@/lib/app/programme/slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/app/programme/slots')>();
  return {
    ...actual,
    reclaimSlotDefinitions: [
      ...actual.reclaimSlotDefinitions,
      { slug: DEFAULTS_SLUG, group: 'test', description: 'no declared sensitivity or dataType' },
      {
        slug: SPECIAL_CATEGORY_SLUG,
        group: 'test',
        description: 'synthetic special_category/number slot for the I5 masking branch',
        sensitivity: 'special_category',
        dataType: 'number',
      },
    ],
  };
});

import { saveAnswer, saveAnswerWithRetry } from '@/lib/app/programme/slots/write';

/** A real registered slug: `reclaim_profile_first_name` is `standard` sensitivity, `text` dataType. */
const SLUG = 'reclaim_profile_first_name';
/** A real registered slug: `reclaim_setup_weekly_hours` is `standard` sensitivity, `number` dataType. */
const NUMBER_SLUG = 'reclaim_setup_weekly_hours';

let realSlotMaskingPolicy: (typeof import('@/lib/framework/data-slots/capabilities/masking'))['slotMaskingPolicy'];

beforeAll(async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/framework/data-slots/capabilities/masking')
  >('@/lib/framework/data-slots/capabilities/masking');
  realSlotMaskingPolicy = actual.slotMaskingPolicy;
});

beforeEach(() => {
  appendSlotValueMock.mockReset().mockResolvedValue({ id: 'sv-1' });
  // Default: masking passes the form through unchanged (its real behaviour for standard/sensitive
  // slots — every real reclaim slot, per I5 — so this default is not a simplification, it is the
  // real no-op path).
  maskingMock.mockReset().mockImplementation((_sensitivity, _dataType, form) => form);
});

describe('saveAnswer', () => {
  it('stamps the run + module and applies the defaults', async () => {
    await saveAnswer({ userId: 'u1', runId: 'run-1', slotSlug: SLUG, value: 'Sam' });

    expect(appendSlotValueMock).toHaveBeenCalledTimes(1);
    const arg = appendSlotValueMock.mock.calls[0][0];
    expect(arg.userId).toBe('u1');
    expect(arg.slotSlug).toBe(SLUG);
    expect(arg.value).toBe('Sam');
    expect(arg.provenance.runId).toBe('run-1');
    expect(arg.provenance.moduleSlug).toBe('reclaim-audit');
    expect(arg.confidence).toBe(10);
    expect(arg.sourceType).toBe('direct');
    expect(arg.reasoningNote).toBe('Captured from the reclaim audit.');
    // No `valueJson` supplied ⇒ masking sees `null` ⇒ `?? undefined` ⇒ the column stays NULL.
    expect(arg.valueJson).toBeUndefined();
  });

  it('routes the value through slotMaskingPolicy keyed on the slot sensitivity + dataType', async () => {
    // Prove the write actually passes through masking: redact here, and the engine must see the
    // redacted form (a direct appendSlotValue call would not — that is what I5 forbids).
    maskingMock.mockReturnValue({ value: '[REDACTED]', valueJson: null });

    await saveAnswer({ userId: 'u1', runId: 'r', slotSlug: SLUG, value: 'Sam', valueJson: 'Sam' });

    expect(maskingMock).toHaveBeenCalledWith('standard', 'text', {
      value: 'Sam',
      valueJson: 'Sam',
    });
    expect(appendSlotValueMock.mock.calls[0][0].value).toBe('[REDACTED]');
    expect(appendSlotValueMock.mock.calls[0][0].valueJson).toBeUndefined();
  });

  it('passes a kept `valueJson` through to the reading untouched', async () => {
    await saveAnswer({
      userId: 'u1',
      runId: 'r',
      slotSlug: NUMBER_SLUG,
      value: '50',
      valueJson: 50,
    });

    expect(appendSlotValueMock.mock.calls[0][0].valueJson).toBe(50);
  });

  it('passes caller overrides through to provenance and the reading', async () => {
    await saveAnswer({
      userId: 'u1',
      runId: 'r',
      slotSlug: SLUG,
      value: 'x',
      confidence: 5,
      sourceType: 'user_confirmed',
      reasoningNote: 'refined together',
      conversationId: 'c1',
      nodeKey: 'phase-0-setup',
    });

    const arg = appendSlotValueMock.mock.calls[0][0];
    expect(arg.confidence).toBe(5);
    expect(arg.sourceType).toBe('user_confirmed');
    expect(arg.reasoningNote).toBe('refined together');
    expect(arg.provenance.conversationId).toBe('c1');
    expect(arg.provenance.nodeKey).toBe('phase-0-setup');
  });

  it('refuses an unknown slug without writing', () => {
    expect(() =>
      saveAnswer({ userId: 'u1', runId: 'r', slotSlug: 'not_a_reclaim_slot', value: 'x' })
    ).toThrow(/not a registered reclaim slot/);
    expect(appendSlotValueMock).not.toHaveBeenCalled();
  });

  it('defaults to `standard` sensitivity and `text` dataType when the definition leaves them unset', async () => {
    await saveAnswer({ userId: 'u1', runId: 'r', slotSlug: DEFAULTS_SLUG, value: 'x' });

    expect(maskingMock).toHaveBeenCalledWith('standard', 'text', { value: 'x', valueJson: null });
  });
});

describe('saveAnswer — the leader’s own sentence (`verbatim`, I13)', () => {
  it('omits verbatim from provenance when the caller supplies none', async () => {
    await saveAnswer({ userId: 'u1', runId: 'r', slotSlug: SLUG, value: 'Sam' });

    expect(appendSlotValueMock.mock.calls[0][0].provenance.verbatim).toBeUndefined();
    // Masking is only ever invoked once — for the reading. No verbatim, no second call.
    expect(maskingMock).toHaveBeenCalledTimes(1);
  });

  it('omits verbatim from provenance when it is identical to the paraphrase', async () => {
    await saveAnswer({ userId: 'u1', runId: 'r', slotSlug: SLUG, value: 'Sam', verbatim: 'Sam' });

    expect(appendSlotValueMock.mock.calls[0][0].provenance.verbatim).toBeUndefined();
    expect(maskingMock).toHaveBeenCalledTimes(1);
  });

  it('stores a distinct verbatim on provenance, alongside the run/module/conversation/node stamps', async () => {
    await saveAnswer({
      userId: 'u1',
      runId: 'run-9',
      slotSlug: SLUG,
      value: 'They are anxious about the team',
      verbatim: "I don't think they'd cope, honestly.",
      conversationId: 'conv-1',
      nodeKey: 'phase-2-current',
    });

    const arg = appendSlotValueMock.mock.calls[0][0];
    // A distinct verbatim is stored verbatim (masking is a no-op for `standard` here), and every other
    // provenance field is exactly what a caller with no `verbatim` at all would have gotten — the new
    // field is additive, not a replacement for the existing stamps.
    expect(arg.provenance).toEqual({
      runId: 'run-9',
      moduleSlug: 'reclaim-audit',
      conversationId: 'conv-1',
      nodeKey: 'phase-2-current',
      verbatim: "I don't think they'd cope, honestly.",
    });
  });

  it('masks the verbatim with the `text` dataType override, never the slot’s own dataType', async () => {
    // `NUMBER_SLUG` is a real `number` slot. The verbatim is always prose ("about fifty, on a good
    // week"), so it must be masked as `text` even though the slot itself is `number` — passing the
    // slot's real dataType through would let it wrongly qualify for the keep-typed branch one day.
    await saveAnswer({
      userId: 'u1',
      runId: 'r',
      slotSlug: NUMBER_SLUG,
      value: '50',
      valueJson: 50,
      verbatim: 'about fifty, on a good week',
    });

    // The reading is masked keyed on the slot's real dataType...
    expect(maskingMock).toHaveBeenCalledWith('standard', 'number', { value: '50', valueJson: 50 });
    // ...but the verbatim is masked keyed on `text`, with no typed form to keep. (Literal string, not
    // the `SLOT_DATA_TYPE` import — test files under this path may not import `@/lib/framework/**`
    // directly; see `lib/framework/eslint.config.mjs`'s core→framework boundary.)
    expect(maskingMock).toHaveBeenCalledWith('standard', 'text', {
      value: 'about fifty, on a good week',
      valueJson: null,
    });
  });

  it('redacts the verbatim exactly as it redacts the reading, for a special_category slug (I5)', async () => {
    // Route through the REAL masking policy (not the pass-through stub) so this proves the actual
    // redaction transform runs on the leader's sentence — not merely that some function was called.
    maskingMock.mockImplementation(realSlotMaskingPolicy);

    const leadersSentence = 'about eight, on a good week — maybe less if it is a bad one';
    await saveAnswer({
      userId: 'u1',
      runId: 'r',
      slotSlug: SPECIAL_CATEGORY_SLUG,
      value: '8',
      valueJson: 8,
      verbatim: leadersSentence,
    });

    const arg = appendSlotValueMock.mock.calls[0][0];
    // The reading's prose is redacted, but its typed form survives (`number` dataType, non-null
    // valueJson) — that is the "keep typed" branch, and it is legitimate for the reading.
    expect(arg.value).toBe('<redacted: special_category>');
    expect(arg.valueJson).toBe(8);
    // The verbatim is ALSO redacted — never the raw sentence, whatever the slot's own dataType is.
    // Forcing `text` for the verbatim call is what keeps this true even though the slot is `number`
    // with a non-null valueJson: had the slot's own dataType leaked through, the leader's exact words
    // would have had nothing to disqualify them from the keep-typed branch.
    expect(arg.provenance.verbatim).toBe('<redacted: special_category>');
    expect(arg.provenance.verbatim).not.toBe(leadersSentence);
    expect(arg.provenance.verbatim).not.toContain('eight');
  });
});

describe('saveAnswerWithRetry', () => {
  const P2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

  it('retries once and succeeds after a concurrent-append collision', async () => {
    appendSlotValueMock
      .mockReset()
      .mockRejectedValueOnce(P2002)
      .mockResolvedValueOnce({ id: 'sv-2' });

    const result = await saveAnswerWithRetry({
      userId: 'u1',
      runId: 'r',
      slotSlug: SLUG,
      value: 'x',
    });

    expect(result).toEqual({ id: 'sv-2' });
    expect(appendSlotValueMock).toHaveBeenCalledTimes(2);
  });

  it('propagates a second collision on the same slug without a further retry', async () => {
    appendSlotValueMock.mockReset().mockRejectedValue(P2002);

    await expect(
      saveAnswerWithRetry({ userId: 'u1', runId: 'r', slotSlug: SLUG, value: 'x' })
    ).rejects.toBe(P2002);
    expect(appendSlotValueMock).toHaveBeenCalledTimes(2);
  });

  it('propagates a non-collision error immediately, without retrying', async () => {
    const dbDown = new Error('db down');
    appendSlotValueMock.mockReset().mockRejectedValue(dbDown);

    await expect(
      saveAnswerWithRetry({ userId: 'u1', runId: 'r', slotSlug: SLUG, value: 'x' })
    ).rejects.toBe(dbDown);
    expect(appendSlotValueMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a non-object error', 'just a string'],
    ['a null error', null],
    ['an object with no code', {}],
    ['an object with a different code', { code: 'P2003' }],
  ])('does not treat %s as a collision', async (_label, rejection) => {
    appendSlotValueMock.mockReset().mockRejectedValue(rejection);

    await expect(
      saveAnswerWithRetry({ userId: 'u1', runId: 'r', slotSlug: SLUG, value: 'x' })
    ).rejects.toBe(rejection);
    // No retry for any of these shapes — only P2002 gets the one extra attempt.
    expect(appendSlotValueMock).toHaveBeenCalledTimes(1);
  });
});
