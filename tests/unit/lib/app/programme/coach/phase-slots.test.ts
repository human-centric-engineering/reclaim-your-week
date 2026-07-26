/**
 * What each phase captures — the mapping the conversation and the panel share.
 *
 * The assertions worth having here are the ones that keep the mapping honest against the two things
 * that would otherwise drift silently: the coach must never be handed a reading it would then be
 * refused for recording (I6), and a slot added to `slots.ts` must reach the conversation without
 * anyone editing this map.
 */

import { describe, it, expect } from 'vitest';
import {
  PHASE_SLOT_GROUPS,
  phaseCaptureSlots,
  slotLabel,
} from '@/lib/app/programme/coach/phase-slots';
import {
  COACH_WRITABLE_GROUPS,
  COACH_REFUSED_GROUPS,
} from '@/lib/app/programme/coach/writable-slots';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';

describe('the phase map', () => {
  it('covers all seven phases, so no phase falls through to an empty conversation by accident', () => {
    expect(Object.keys(PHASE_SLOT_GROUPS).sort()).toEqual([...RECLAIM_PHASE_KEYS].sort());
  });

  it('names only groups the coach may write (I6)', () => {
    const mapped = Object.values(PHASE_SLOT_GROUPS).flat();
    for (const group of mapped) {
      expect(COACH_WRITABLE_GROUPS).toContain(group);
      expect(COACH_REFUSED_GROUPS[group]).toBeUndefined();
    }
  });

  it('captures nothing in the summary phase, where the slots are consent', () => {
    expect(phaseCaptureSlots('phase-6-summary')).toEqual([]);
  });

  it('returns nothing for a phase key that is not a phase', () => {
    expect(phaseCaptureSlots('phase-9-invented')).toEqual([]);
  });
});

describe('the slots a phase captures', () => {
  it('derives them from the group rather than from a hand-written list', () => {
    const declared = reclaimSlotDefinitions.filter((d) => d.group === 'reclaim_energy');
    const captured = phaseCaptureSlots('phase-2-energy');

    expect(captured.map((s) => s.slug)).toEqual(declared.map((d) => d.slug));
  });

  it('carries the data type, because a typed slot is refused without a typed value', () => {
    const hours = phaseCaptureSlots('phase-1-current').find(
      (s) => s.slug === 'reclaim_current_hours__deep_work'
    );

    expect(hours?.dataType).toBe('number');
  });

  it('drops the fundraising area unless Phase 0 said it was relevant', () => {
    const withoutFundraising = phaseCaptureSlots('phase-1-current');
    const withFundraising = phaseCaptureSlots('phase-1-current', { fundraisingRelevant: true });

    expect(withoutFundraising.some((s) => s.slug.includes('fundraising_capital'))).toBe(false);
    expect(withFundraising.some((s) => s.slug.includes('fundraising_capital'))).toBe(true);
    // Two lanes per area (hours + what it looks like), and nothing else moves.
    expect(withFundraising.length).toBe(withoutFundraising.length + 2);
  });

  it('never includes a reflection, a sharing choice, or a computed calendar lane', () => {
    const everySlot = RECLAIM_PHASE_KEYS.flatMap((key) =>
      phaseCaptureSlots(key, { fundraisingRelevant: true })
    );

    for (const slot of everySlot) {
      expect(slot.slug).not.toMatch(/^reclaim_(reflection|share|calendar|composite)/);
    }
  });
});

describe('what a reading is called on screen', () => {
  it('names a per-area lane from the canonical bucket title', () => {
    expect(slotLabel('reclaim_current_hours__deep_work')).toBe('Deep work, hours a week');
    expect(slotLabel('reclaim_current_detail__deep_work')).toBe('Deep work, in practice');
  });

  it("uses the leader's own relabelling, without the slug moving (I7)", () => {
    const labels = { deep_work: 'Thinking time' };

    expect(slotLabel('reclaim_current_hours__deep_work', labels)).toBe(
      'Thinking time, hours a week'
    );
    expect(phaseCaptureSlots('phase-1-current', { bucketLabels: labels })[0].slug).toBe(
      'reclaim_current_hours__deep_work'
    );
  });

  it('gives every capturable slot a label that is not its own slug', () => {
    // The panel is unreadable if a slug leaks into it, and a new slot is the way that happens.
    const unlabelled = RECLAIM_PHASE_KEYS.flatMap((key) =>
      phaseCaptureSlots(key, { fundraisingRelevant: true })
    ).filter((slot) => slot.label === slot.slug);

    expect(unlabelled.map((s) => s.slug)).toEqual([]);
  });
});
