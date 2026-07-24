/**
 * `saveAnswer()` — the single slot write-path (F4 t-2). No DB: `appendSlotValue` and the masking
 * policy are mocked so we can assert exactly what `saveAnswer` hands the engine — the run stamp (F1),
 * the module scope, the masking route (I5), and the defaults.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { appendSlotValueMock, maskingMock } = vi.hoisted(() => ({
  appendSlotValueMock: vi.fn(),
  maskingMock: vi.fn(),
}));

vi.mock('@/lib/framework/data-slots', () => ({ appendSlotValue: appendSlotValueMock }));
vi.mock('@/lib/framework/data-slots/capabilities/masking', () => ({
  slotMaskingPolicy: maskingMock,
}));

import { saveAnswer } from '@/lib/app/programme/slots/write';

/** A real registered slug: `reclaim_profile_first_name` is `standard` sensitivity, `text` dataType. */
const SLUG = 'reclaim_profile_first_name';

beforeEach(() => {
  appendSlotValueMock.mockReset().mockResolvedValue({ id: 'sv-1' });
  // Default: masking passes the form through unchanged (its real behaviour for standard slots).
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
    expect(typeof arg.reasoningNote).toBe('string');
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
});
