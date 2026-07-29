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
  slotApplies,
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
    const declared = reclaimSlotDefinitions.filter((d) => d.group === 'reclaim_ideal');
    const captured = phaseCaptureSlots('phase-3-ideal', { fundraisingRelevant: true });

    expect(captured.map((s) => s.slug)).toEqual(declared.map((d) => d.slug));
  });

  it('leaves out a reading no surface captures, so the list stays a list of questions', () => {
    // The week grid was never built, so `reclaim_energy_peak_windows` is a reading nothing can take.
    // On the list it was a permanently outstanding slug with no question attached: the coach fired
    // the leader's next answer at it and was refused, and the panel counted a reading that could
    // never arrive. It is still declared, because a grid could still claim it.
    expect(reclaimSlotDefinitions.some((d) => d.slug === 'reclaim_energy_peak_windows')).toBe(true);
    expect(phaseCaptureSlots('phase-2-energy').map((s) => s.slug)).toEqual([
      'reclaim_energy_peak_description',
      'reclaim_energy_protected',
    ]);
  });

  it('leaves the computed gap summary off phase 4, so the turn cannot be told to ask for it', () => {
    // `reclaim_gap_summary` is "per-bucket deltas, computed" — `json`, written by nothing, and not a
    // sentence anyone says. It sat first in declaration order in `reclaim_gap`, which made it phase
    // 4's first unanswered reading. That was survivable while the list was only a worklist; it is
    // not now the coach is required to end every turn on the first unanswered reading, because a
    // reading nothing can answer would hold that slot for the whole phase.
    expect(reclaimSlotDefinitions.some((d) => d.slug === 'reclaim_gap_summary')).toBe(true);
    const captured = phaseCaptureSlots('phase-4-gap').map((s) => s.slug);
    expect(captured).not.toContain('reclaim_gap_summary');
    expect(captured.length).toBeGreaterThan(0);
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

  it('pairs each area lane with its own texture reading, and only its own', () => {
    // The rule that was prose in the phase-1 context is data now, so every phase gets it rather than
    // the one phase somebody wrote a paragraph for.
    const phase1 = phaseCaptureSlots('phase-1-current', { fundraisingRelevant: true });
    const hours = phase1.find((s) => s.slug === 'reclaim_current_hours__deep_work');
    const detail = phase1.find((s) => s.slug === 'reclaim_current_detail__deep_work');

    expect(hours?.pairedWith).toEqual(['reclaim_current_detail__deep_work']);
    expect(detail?.pairedTo).toBe('reclaim_current_hours__deep_work');
    // The texture reading is a follower, never an anchor with followers of its own.
    expect(detail?.pairedWith).toBeUndefined();
  });

  it('pairs the two energy questions, which the source asks together', () => {
    const phase2 = phaseCaptureSlots('phase-2-energy');
    const description = phase2.find((s) => s.slug === 'reclaim_energy_peak_description');

    expect(description?.pairedWith).toEqual(['reclaim_energy_protected']);
  });

  it('never pairs across a phase boundary, so a pair is always askable in one turn', () => {
    for (const key of RECLAIM_PHASE_KEYS) {
      const slots = phaseCaptureSlots(key, { fundraisingRelevant: true });
      const here = new Set(slots.map((s) => s.slug));
      for (const slot of slots) {
        for (const follower of slot.pairedWith ?? []) {
          expect(here.has(follower)).toBe(true);
        }
        if (slot.pairedTo !== undefined) expect(here.has(slot.pairedTo)).toBe(true);
      }
    }
  });

  it('drops the fundraising pair with the fundraising lane, rather than leaving a dangling half', () => {
    const withoutFundraising = phaseCaptureSlots('phase-1-current');

    expect(withoutFundraising.some((s) => s.slug.includes('fundraising_capital'))).toBe(false);
    // And no surviving anchor points at the lane that was dropped.
    for (const slot of withoutFundraising) {
      expect(slot.pairedWith ?? []).not.toContain('reclaim_current_detail__fundraising_capital');
    }
  });

  it('declares the condition on a reading that only applies to some leaders', () => {
    const phase1 = phaseCaptureSlots('phase-1-current');
    const blocker = phase1.find((s) => s.slug === 'reclaim_current_deep_block_blocker');
    const when = phase1.find((s) => s.slug === 'reclaim_current_deep_block_when');

    // The one that forced the reflection gate to be loosened: asked only of a leader with NO block.
    expect(blocker?.askOnlyIf).toEqual({
      slug: 'reclaim_current_deep_block_exists',
      equals: false,
    });
    expect(when?.askOnlyIf).toEqual({ slug: 'reclaim_current_deep_block_exists', equals: true });
  });

  it('points every condition at a boolean reading that exists on the same phase', () => {
    // A condition naming a slug the coach cannot see would resolve to "we do not know" forever, which
    // is the silent-failure version of the bug this mechanism exists to fix.
    for (const key of RECLAIM_PHASE_KEYS) {
      const slots = phaseCaptureSlots(key, { fundraisingRelevant: true });
      const byslug = new Map(slots.map((s) => [s.slug, s]));
      for (const slot of slots) {
        if (slot.askOnlyIf === undefined) continue;
        const on = byslug.get(slot.askOnlyIf.slug);
        expect(on, `${slot.slug} depends on ${slot.askOnlyIf.slug}`).toBeDefined();
        expect(on?.dataType).toBe('boolean');
      }
    }
  });

  describe('slotApplies — three answers, and the third is the point', () => {
    const YES = { value: 'Yes', valueJson: true };
    const NO = { value: 'No', valueJson: false };

    it('is true for a reading with no condition at all', () => {
      expect(slotApplies(undefined, {})).toBe(true);
    });

    it('resolves the condition against the run when the reading it depends on is answered', () => {
      const condition = { slug: 'reclaim_current_deep_block_exists', equals: false };

      expect(slotApplies(condition, { reclaim_current_deep_block_exists: NO })).toBe(true);
      expect(slotApplies(condition, { reclaim_current_deep_block_exists: YES })).toBe(false);
    });

    it('returns undefined when nobody has asked the question it depends on', () => {
      // Not false. Telling the coach a reading "does not apply" on the strength of a question that
      // was never asked would quietly drop it, which is worse than the ambiguity it replaces.
      expect(slotApplies({ slug: 'reclaim_current_deep_block_exists', equals: false }, {})).toBe(
        undefined
      );
    });

    it("reads the form path's prose booleans as well as the typed ones", () => {
      // The forms write `value: 'Yes'` with no `valueJson`; the coach writes a real boolean. Both
      // have to resolve the same way or the answer depends on which surface the leader used.
      const condition = { slug: 'reclaim_setup_in_transition', equals: true };

      expect(slotApplies(condition, { reclaim_setup_in_transition: { value: 'Yes' } })).toBe(true);
      expect(slotApplies(condition, { reclaim_setup_in_transition: { value: 'No' } })).toBe(false);
    });
  });

  it('never labels a challenge slot with the under-delegation invitation', () => {
    // Both of these once read as the invitation ("The invitation to lead differently", "What it
    // would take to let go"), which is a third beat with no slot of its own. A label lifted from it
    // tells the leader they answered a question they were never asked.
    const borrowed = /let go|lead differently|lead more through others/i;

    expect(slotLabel('reclaim_gap_challenge_offered')).not.toMatch(borrowed);
    expect(slotLabel('reclaim_gap_strategy_mirror')).not.toMatch(borrowed);
    // And the mirror's label is about the mirror's own question.
    expect(slotLabel('reclaim_gap_strategy_mirror')).toContain('stranger');
  });
});
