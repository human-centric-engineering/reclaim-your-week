/**
 * I5 — no `reclaim_*` slot definition is `special_category` (F2 t-4).
 *
 * A cross-cutting invariant guard, wired into `leaf:checks`. `slotMaskingPolicy` redacts the
 * prose value at `special_category`, which would destroy `reclaim_setup_keeping_me_up` — the exact
 * sentence F7 t-2 must quote back verbatim. `sensitive` is the correct class for personal prose.
 *
 * `slots.test.ts` also checks sensitivity as part of the slot unit tests; this file is the
 * *invariant* view of the same rule — a single guard over the whole registered set, kept where the
 * other invariant guards live and run in CI, so the rule holds even if the slot unit tests move.
 */

import { describe, it, expect } from 'vitest';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';

describe('I5 — slot sensitivity is never special_category', () => {
  it('no registered reclaim_* definition is special_category', () => {
    const offenders = reclaimSlotDefinitions
      .filter((s) => s.sensitivity === 'special_category')
      .map((s) => s.slug);
    expect(offenders).toEqual([]);
  });

  it('every slot is scoped to the reclaim namespace (the set the guard covers)', () => {
    // Guards against a foreign slug slipping into the array and escaping the I5 check by not
    // being a reclaim_* definition at all.
    for (const slot of reclaimSlotDefinitions) {
      expect(slot.slug).toMatch(/^reclaim_/);
    }
  });

  it('keeps the verbatim-returned setup prose as sensitive (F7 depends on it not being redacted)', () => {
    const keepingMeUp = reclaimSlotDefinitions.find(
      (s) => s.slug === 'reclaim_setup_keeping_me_up'
    );
    expect(keepingMeUp?.sensitivity).toBe('sensitive');
  });

  /**
   * A tripwire on the slot count, because the number is written down in five places and nothing
   * checked it (F13 t-2).
   *
   * The count went 91 → 95 → 105, each move recorded in `slot-spec.md`. Then #54 added
   * `reclaim_reflection_p6` — the takeaway the conversational close asks for — and recorded nothing,
   * so `slots.ts`'s own two headers, `.context/app/README.md`'s three references and `slot-spec.md`
   * all went on saying 105 for five days.
   *
   * Nothing broke. But this repository's standard is that a document misdescribing the code is a
   * defect, and the same family of failure has now been found on the planning board four times
   * (post-v1 P21/P23) and in `invariants.md`'s own guard table (F12 t-1). The pattern is always the
   * same: **a claim nothing checks does not stay true.**
   *
   * So this fails on the next slot added, and the fix is to update the number wherever it is
   * written. That is deliberately a small chore rather than a clever derivation — the point is to
   * make the docs impossible to forget, not to make the count self-maintaining.
   */
  it('has exactly the documented number of slots', () => {
    expect(
      reclaimSlotDefinitions.length,
      'the slot count changed — update slots.ts (2 headers), .context/app/README.md (3 references) and slot-spec.md, then this number'
    ).toBe(106);
  });
});
