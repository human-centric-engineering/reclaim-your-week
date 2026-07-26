/**
 * I6 — the coach agent never selects its own run, and never transitions.
 *
 * A cross-cutting invariant guard, wired into `leaf:checks`. It asserts the *authored* capability
 * grants on `reclaimCoachAgent`, plus the code-side refusals in `checkSlotWrite`:
 *   - the read tools are granted (`get_journey_state`, `get_next_steps`, `get_state`);
 *   - `request_transition` is never granted (the server owns phase transitions);
 *   - `fill_slot`, whose run comes from the LLM-supplied `contextKey`, stays locked to the
 *     run-independent `reclaim_profile` group and is refused every run-carrying group;
 *   - `record_answers`, whose run comes from the server-issued dispatch scope, may write the audit
 *     but is refused reflections, sharing consent, and the computed calendar lanes;
 *   - a typed slot cannot be filled with prose alone.
 *
 * Refusals are evaluated against the *real* slot groups (`reclaimSlotDefinitions`), so the guard
 * tracks the actual data rather than a hand-listed set. `facetAllowsWrite` below **mirrors** the
 * group-membership half of `lib/framework/data-slots/capabilities/exposure.ts#facetAllows`, because
 * the allowlist has to hold as *data on the grant* independently of the code that also enforces it —
 * two layers, checked separately. Keep the mirror in step; both write facets restrict by `groups`
 * only.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent, RECLAIM_RECORD_ANSWERS_SLUG } from '@/lib/app/programme/agent';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import {
  checkSlotWrite,
  COACH_REFUSED_GROUPS,
  COACH_WRITABLE_GROUPS,
} from '@/lib/app/programme/coach/writable-slots';

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

/** Every distinct group in the real slot set. */
const ALL_GROUPS = [...new Set(reclaimSlotDefinitions.map((s) => s.group))];

/** One representative slug per group, for exercising the code-side check. */
function slugInGroup(group: string): string {
  const found = reclaimSlotDefinitions.find((s) => s.group === group);
  if (found === undefined) throw new Error(`no slot in group ${group}`);
  return found.slug;
}

describe('I6 — granted capabilities', () => {
  it('grants the three read tools plus the two writes, and nothing else', () => {
    expect(new Set(slugs)).toEqual(
      new Set([
        'get_journey_state',
        'get_next_steps',
        'get_state',
        'fill_slot',
        RECLAIM_RECORD_ANSWERS_SLUG,
      ])
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

  it('names the capture tool under its namespaced module slug', () => {
    // The dispatcher key, the ai_capability row and the LLM tool name are all this one string; a
    // grant naming a bare slug would bind to nothing.
    expect(RECLAIM_RECORD_ANSWERS_SLUG).toBe('reclaim_audit__record_answers');
  });
});

describe('I6 — fill_slot selects its run from the model, so it stays on reclaim_profile', () => {
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

  it('refuses reclaim_current and every other run-carrying group', () => {
    expect(facetAllowsWrite(write, 'reclaim_current')).toBe(false);

    const runCarrying = ALL_GROUPS.filter((g) => g !== 'reclaim_profile');
    for (const group of runCarrying) {
      expect(facetAllowsWrite(write, group)).toBe(false);
    }
    // Sanity: the set we swept is non-trivial and did include reclaim_current.
    expect(runCarrying).toContain('reclaim_current');
    expect(runCarrying.length).toBeGreaterThan(5);
  });
});

describe('I6 — record_answers takes its run from the server, so it may write the audit', () => {
  const record = grants.find((c) => c.slug === RECLAIM_RECORD_ANSWERS_SLUG);
  const write = record?.customConfig?.write;

  it('binds a write facet carrying exactly the code-side allowlist', () => {
    expect(record).toBeDefined();
    expect(record?.customConfig?.read).toBeUndefined();
    expect(write?.groups).toEqual([...COACH_WRITABLE_GROUPS]);
    expect(write?.scopes).toBeUndefined();
  });

  it('accounts for every group in the slot set — none may be silently unclassified', () => {
    // The guard that makes the two lists below exhaustive: a new slot group added later must be
    // deliberately permitted or deliberately refused, never left to fall through a gap.
    const classified = new Set([...COACH_WRITABLE_GROUPS, ...Object.keys(COACH_REFUSED_GROUPS)]);
    expect([...ALL_GROUPS].sort()).toEqual([...classified].sort());
  });

  it('refuses reflections in the grant data and in code (I9 stays leader-owned)', () => {
    expect(facetAllowsWrite(write, 'reclaim_reflection')).toBe(false);

    const check = checkSlotWrite('reclaim_reflection_p3', undefined);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.refusal.code).toBe('group_refused');
  });

  it('refuses sharing consent in the grant data and in code', () => {
    expect(facetAllowsWrite(write, 'reclaim_share')).toBe(false);

    const check = checkSlotWrite('reclaim_share_quotable', true);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.refusal.code).toBe('group_refused');
  });

  it('refuses the computed calendar and composite lanes (I4, I-composite)', () => {
    for (const group of ['reclaim_calendar', 'reclaim_composite']) {
      expect(facetAllowsWrite(write, group)).toBe(false);

      const check = checkSlotWrite(slugInGroup(group), 12);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.refusal.code).toBe('group_refused');
    }
  });

  it('permits the groups a conversation actually captures', () => {
    for (const group of COACH_WRITABLE_GROUPS) {
      expect(facetAllowsWrite(write, group)).toBe(true);
    }
  });
});

describe('I6 — a typed slot cannot be filled with prose alone', () => {
  it('refuses an hours slot with no number, so a chart is never drawn from words', () => {
    const check = checkSlotWrite('reclaim_current_hours__deep_work', undefined);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.refusal.code).toBe('typed_value_required');
  });

  it('refuses an hours slot whose typed value is itself prose', () => {
    const check = checkSlotWrite('reclaim_current_hours__deep_work', 'about eight');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.refusal.code).toBe('typed_value_required');
  });

  it('accepts an hours slot with a real number, and carries the number through', () => {
    const check = checkSlotWrite('reclaim_current_hours__deep_work', 8);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.accepted.valueJson).toBe(8);
  });

  it('refuses a boolean slot given a string, and accepts a real boolean', () => {
    expect(checkSlotWrite('reclaim_setup_in_transition', 'yes').ok).toBe(false);
    expect(checkSlotWrite('reclaim_setup_in_transition', true).ok).toBe(true);
  });

  it('accepts a text slot with no typed value at all', () => {
    const check = checkSlotWrite('reclaim_setup_priorities', undefined);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.accepted.valueJson).toBeUndefined();
  });

  it('refuses a slug that is not a slot in this audit', () => {
    const check = checkSlotWrite('reclaim_invented_by_the_model', undefined);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.refusal.code).toBe('unknown_slot');
  });
});
