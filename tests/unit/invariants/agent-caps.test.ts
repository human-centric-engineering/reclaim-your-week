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
 * tracks the actual data rather than a hand-listed set.
 *
 * **This file used to define its own `facetAllowsWrite`, and that was the bug.** It mirrored the
 * group-membership half of the framework's `facetAllows` so the grant data could be asserted
 * independently — reasonable in isolation, and it meant the guard passed while the runtime enforced
 * nothing, because `record_answers` never called `facetAllows` at all. A mirror can only ever prove
 * that the data says what we meant; it cannot prove anything runs it. So the real function is
 * imported now, and the capability calls it too.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent, RECLAIM_RECORD_ANSWERS_SLUG } from '@/lib/app/programme/agent';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { facetAllows } from '@/lib/framework/data-slots/capabilities/exposure';
import {
  checkSlotWrite,
  COACH_REFUSED_GROUPS,
  COACH_WRITABLE_GROUPS,
  COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS,
} from '@/lib/app/programme/coach/writable-slots';

const grants = reclaimCoachAgent.capabilities;
const slugs = grants.map((c) => c.slug);

/** The real framework check, over the grant's own facet. Scope is unrestricted on this grant. */
function facetAllowsWrite(
  write: { groups?: string[]; scopes?: string[] } | undefined,
  group: string
): boolean {
  return facetAllows(write, group, null);
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
  it('grants the three read tools plus the one write, and nothing else', () => {
    expect(new Set(slugs)).toEqual(
      new Set(['get_journey_state', 'get_next_steps', 'get_state', RECLAIM_RECORD_ANSWERS_SLUG])
    );
  });

  it('never grants request_transition (the server owns transitions)', () => {
    expect(slugs).not.toContain('request_transition');
  });

  it('never grants fill_slot — the last tool whose run a model could choose', () => {
    // `fill_slot` takes its run from `contextKey`, an argument the model supplies, which is why it
    // was ever locked to a run-independent group. `record_answers` covers the same group and takes
    // its run from the server, so the narrower tool is redundant and strictly less safe. Beside
    // `request_transition` because both are absences that have to stay absences.
    expect(slugs).not.toContain('fill_slot');
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

describe('I6 — record_answers takes its run from the server, so it may write the audit', () => {
  const record = grants.find((c) => c.slug === RECLAIM_RECORD_ANSWERS_SLUG);
  const write = record?.customConfig?.write;

  it('binds a write facet naming the permitted groups', () => {
    expect(record).toBeDefined();
    expect(record?.customConfig?.read).toBeUndefined();
    // The grant is the outer bound and is deliberately WIDER than the code rule: `reclaim_calendar`
    // is permitted here so the two pre-upload questions can be recorded, while the computed lanes in
    // that group stay refused below, in code. A facet cannot express a slug-level rule.
    expect(write?.groups).toEqual([...COACH_WRITABLE_GROUPS, 'reclaim_calendar']);
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

  it('refuses the composite lane outright, in the grant and in code (I-composite)', () => {
    expect(facetAllowsWrite(write, 'reclaim_composite')).toBe(false);

    const check = checkSlotWrite(slugInGroup('reclaim_composite'), 12);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.refusal.code).toBe('group_refused');
  });

  it('refuses every computed calendar lane in code, though the grant permits the group (I4)', () => {
    // The two layers doing different jobs. The grant opens the group so the pre-upload questions can
    // be recorded; the code keeps every computed figure shut, which is what I4's privacy story
    // actually rests on. If this ever passes, a model-derived number can reach a calendar total.
    for (const slug of ['reclaim_calendar_hours__deep_work', 'reclaim_calendar_total_hours']) {
      const check = checkSlotWrite(slug, 12);
      expect(check.ok, `${slug} must stay refused`).toBe(false);
      if (!check.ok) expect(check.refusal.code).toBe('group_refused');
    }
  });

  it('permits the two questions the coach is told to ask before an upload', () => {
    // `completeness` decides how every later figure is framed, and a conversation that cannot record
    // the answer to a question it was told to ask captures nothing at the point that matters.
    for (const slug of COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS) {
      expect(facetAllowsWrite(write, 'reclaim_calendar')).toBe(true);
      const check = checkSlotWrite(slug, undefined);
      expect(check.ok, `${slug} must be writable`).toBe(true);
    }
  });

  it('keeps the other calendar self-reports refused — they belong to the review screen', () => {
    for (const slug of [
      'reclaim_calendar_switch_frequency',
      'reclaim_calendar_reactive_time',
      'reclaim_calendar_offcal_work',
      'reclaim_calendar_messaging_load',
    ]) {
      const check = checkSlotWrite(slug, undefined);
      expect(check.ok, `${slug} must stay refused`).toBe(false);
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
