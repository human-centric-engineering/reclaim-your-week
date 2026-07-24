/**
 * I6 — the coach agent reads; it does not transition, and it writes only `reclaim_profile_*` (F2 t-4).
 *
 * A cross-cutting invariant guard, wired into `leaf:checks`. It asserts the *authored* capability
 * grants on `reclaimCoachAgent`:
 *   - the read tools are granted (`get_journey_state`, `get_next_steps`, `get_state`);
 *   - `request_transition` is never granted (the server owns phase transitions);
 *   - the one write, `fill_slot`, carries an exposure allowlist whose `write` facet permits the
 *     run-independent `reclaim_profile` group and **refuses** every run-carrying group.
 *
 * The refusal is evaluated against the *real* slot groups (`reclaimSlotDefinitions`), so the guard
 * tracks the actual data rather than a hand-listed set. It cannot import the framework's own
 * `facetAllows` — the leaf import boundary forbids a runtime `@/lib/framework` import (only
 * `import type` is allowed) — so `facetAllowsWrite` below **mirrors** the group-membership half of
 * `lib/framework/data-slots/capabilities/exposure.ts#facetAllows` for this test's assertions. Keep
 * the two in step; the write facet the coach uses restricts by `groups` only. `reclaim_current` is
 * the canonical run-carrying group the invariant names; a hallucinated `contextKey` writing one
 * run's answers into another is precisely what the lockdown prevents.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';

const grants = reclaimCoachAgent.capabilities;
const slugs = grants.map((c) => c.slug);

/** Mirror of the framework `facetAllows` group check: an undefined facet (or one without `groups`)
 *  allows everything; otherwise the slot's group must be a named member. */
function facetAllowsWrite(
  write: { groups?: string[]; scopes?: string[] } | undefined,
  group: string
): boolean {
  if (write === undefined || write.groups === undefined) return true;
  return write.groups.includes(group);
}

describe('I6 — granted capabilities', () => {
  it('grants exactly the three read tools plus the one locked write', () => {
    expect(new Set(slugs)).toEqual(
      new Set(['get_journey_state', 'get_next_steps', 'get_state', 'fill_slot'])
    );
  });

  it('never grants request_transition (the server owns transitions)', () => {
    expect(slugs).not.toContain('request_transition');
  });

  it('the read tools carry no exposure restriction (the agent may read state)', () => {
    for (const slug of ['get_journey_state', 'get_next_steps', 'get_state']) {
      const grant = grants.find((c) => c.slug === slug);
      expect(grant?.customConfig).toBeUndefined();
    }
  });
});

describe('I6 — the fill_slot write is locked to reclaim_profile', () => {
  const fillSlot = grants.find((c) => c.slug === 'fill_slot');
  const write = fillSlot?.customConfig?.write;

  it('binds a write facet allowlisting only reclaim_profile', () => {
    expect(fillSlot).toBeDefined();
    // Shape matches what the framework `exposureConfigSchema` accepts: a `write` facet keyed on
    // `groups`, nothing else. The read facet is absent (reads are unrestricted).
    expect(fillSlot?.customConfig?.read).toBeUndefined();
    expect(write?.groups).toEqual(['reclaim_profile']);
    expect(write?.scopes).toBeUndefined();
  });

  it('allows writes to the run-independent reclaim_profile group', () => {
    expect(facetAllowsWrite(write, 'reclaim_profile')).toBe(true);
  });

  it('refuses writes to reclaim_current and every other run-carrying group', () => {
    // The canonical run-carrying group named by the invariant.
    expect(facetAllowsWrite(write, 'reclaim_current')).toBe(false);

    // Every distinct group in the real slot set except reclaim_profile must be refused.
    const groups = [...new Set(reclaimSlotDefinitions.map((s) => s.group))];
    const runCarrying = groups.filter((g) => g !== 'reclaim_profile');
    for (const group of runCarrying) {
      expect(facetAllowsWrite(write, group)).toBe(false);
    }
    // Sanity: the set we swept is non-trivial and did include reclaim_current.
    expect(runCarrying).toContain('reclaim_current');
    expect(runCarrying.length).toBeGreaterThan(5);
  });
});
