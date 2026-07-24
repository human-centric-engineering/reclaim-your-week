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
});
