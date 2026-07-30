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
 *     but is refused sharing consent and the computed calendar lanes;
 *   - a reflection is permitted only for the phase in that scope, and never as an inference;
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
import {
  reclaimCoachAgent,
  RECLAIM_RECORD_ANSWERS_SLUG,
  RECLAIM_OFFER_CHOICES_SLUG,
} from '@/lib/app/programme/agent';
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
  it('grants the read tools plus the one write, and nothing else', () => {
    expect(new Set(slugs)).toEqual(
      new Set([
        'get_journey_state',
        'get_next_steps',
        'get_state',
        RECLAIM_RECORD_ANSWERS_SLUG,
        // A read in every sense that matters here: it returns static option text and touches neither
        // the run nor a slot. It is on this list rather than exempt from it because I6 is a claim
        // about the whole grant set, and a tool that quietly appeared without being named would be
        // exactly the thing the assertion exists to catch.
        RECLAIM_OFFER_CHOICES_SLUG,
      ])
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

  it('grants offer_choices no exposure config, because it has nothing to expose', () => {
    // A write facet on a capability that cannot write would be a claim the runtime never checks,
    // and the day somebody read this grant looking for what the coach may touch, it would answer
    // the wrong question. Absence is the honest record: `record_answers` is the only write (I6).
    const offer = grants.find((c) => c.slug === RECLAIM_OFFER_CHOICES_SLUG);
    expect(offer).toBeDefined();
    expect(offer?.customConfig).toBeUndefined();
  });

  it('names both module tools under their namespaced module slugs', () => {
    // The dispatcher key, the ai_capability row and the LLM tool name are all this one string; a
    // grant naming a bare slug would bind to nothing.
    expect(RECLAIM_RECORD_ANSWERS_SLUG).toBe('reclaim_audit__record_answers');
    expect(RECLAIM_OFFER_CHOICES_SLUG).toBe('reclaim_audit__offer_choices');
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

  /**
   * The reflection rule, which is the one permission on this agent that was widened rather than
   * narrowed (2026-07-27). The blanket refusal is gone — the coach asks the closing question and
   * records the answer, because a textarea under the transcript was the form creeping back into the
   * conversation. What holds the gate up now is that both conditions come from the *server*: the
   * phase is the one in the dispatch scope, and an inferred reflection is refused outright.
   *
   * I9 itself is untouched and is not asserted here: the transition route still refuses to leave a
   * phase whose reflection slot is absent (`tests/unit/app/api/.../transition`).
   */
  describe('reflections — permitted, but only this phase and only what was said', () => {
    it('permits the group in the grant data, since the coach now records one', () => {
      expect(facetAllowsWrite(write, 'reclaim_reflection')).toBe(true);
    });

    it("records the reflection belonging to the phase in the server's scope", () => {
      const check = checkSlotWrite('reclaim_reflection_p3', undefined, {
        phaseKey: 'phase-3-ideal',
        sourceType: 'user_confirmed',
      });
      expect(check.ok).toBe(true);
    });

    it('refuses a reflection for any other phase, so it cannot clear the gates ahead', () => {
      const check = checkSlotWrite('reclaim_reflection_p4', undefined, {
        phaseKey: 'phase-3-ideal',
        sourceType: 'direct',
      });
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.refusal.code).toBe('reflection_wrong_phase');
    });

    it('refuses a reflection when the turn carries no phase at all', () => {
      const check = checkSlotWrite('reclaim_reflection_p3', undefined, {
        sourceType: 'direct',
      });
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.refusal.code).toBe('reflection_wrong_phase');
    });

    it('refuses an inferred reflection: a leader has to have said it', () => {
      const check = checkSlotWrite('reclaim_reflection_p3', undefined, {
        phaseKey: 'phase-3-ideal',
        sourceType: 'inferred',
      });
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.refusal.code).toBe('reflection_not_inferred');
    });
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

/**
 * A yes-or-no cannot be stored as a sentence that says the other thing.
 *
 * Observed live. Asked whether they were in a period of change, a leader said "change is a constant".
 * The coach recorded `reclaim_setup_in_transition` with that sentence as the prose and `false` as the
 * typed value, and nothing compared the two — so three readers disagreed about one reading. The panel
 * showed the sentence, which reads as a yes. `slotApplies` read the boolean, which is a no, and told
 * the coach that "What the change is" did not apply to this leader and must not be asked. And the
 * leader saw a row saying change is constant above a blank row, and read it as a skipped question.
 *
 * The typed value is what every reader downstream acts on, so the prose is made to say the same thing.
 */
describe('a boolean reading and its own prose cannot disagree', () => {
  it('stores the word for the answer when the prose says something else', () => {
    const check = checkSlotWrite('reclaim_setup_in_transition', false, {
      value: 'Change is a constant',
    });
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.accepted.valueJson).toBe(false);
      expect(check.accepted.value).toBe('No');
    }
  });

  it('says Yes for a true reading whose prose is a sentence', () => {
    const check = checkSlotWrite('reclaim_profile_distributed_team', true, {
      value: 'The team is spread over three sites and two countries',
    });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.accepted.value).toBe('Yes');
  });

  it('leaves prose that already is the answer alone, whatever its case or punctuation', () => {
    for (const value of ['Yes', 'yes', 'no.', 'No']) {
      const typed = value.toLowerCase().startsWith('y');
      const check = checkSlotWrite('reclaim_setup_in_transition', typed, { value });
      expect(check.ok).toBe(true);
      // Untouched, so the ordinary path — the forms, the sweep — writes exactly what it sent.
      if (check.ok) expect(check.accepted.value, `${value} should stand`).toBeUndefined();
    }
  });

  it('says nothing about the prose of a slot that is not a yes-or-no', () => {
    const check = checkSlotWrite('reclaim_setup_weekly_hours', 55, { value: 'About 55' });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.accepted.value).toBeUndefined();
  });
});

/**
 * A figure is stored as the reading it is, never as a naked number.
 *
 * Observed live: the captured panel beside the conversation read "Deep work, hours a week: 5". Both
 * conversational writers had a reason to send it that way — the coach because a count arrives as a
 * count, the sweep because its schema has no `valueJson` and the figure must travel in the prose —
 * and the leader is asked to check, correct and later recognise these lines. So the gate dresses the
 * one case with no phrasing to lose, and leaves every case that has some exactly as it arrived.
 */
describe('a number reading is stored as prose a leader can read', () => {
  it.each([
    ['reclaim_current_hours__deep_work', '5', '5 hours'],
    ['reclaim_current_hours__deep_work', '1', '1 hour'],
    ['reclaim_ideal_hours__deep_work', '7.5', '7.5 hours'],
    ['reclaim_setup_weekly_hours', '55', '55 hours'],
    ['reclaim_ideal_total_hours', '45', '45 hours'],
    ['reclaim_gap_hours_to_remove', '12', '12 hours'],
    ['reclaim_profile_direct_reports', '25', '25 direct reports'],
    ['reclaim_profile_direct_reports', '1', '1 direct report'],
  ])('dresses %s sent as "%s"', (slug, value, expected) => {
    const check = checkSlotWrite(slug, undefined, { value });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.accepted.value).toBe(expected);
  });

  it.each(['roughly 5 hours', '5 hours a week', 'about 5', '5 hrs'])(
    'leaves "%s" alone, because the phrasing is the leader\'s',
    (value) => {
      const check = checkSlotWrite('reclaim_current_hours__deep_work', undefined, { value });
      expect(check.ok).toBe(true);
      // Untouched, so the figure keeps the words the leader put around it.
      if (check.ok) {
        expect(check.accepted.value).toBeUndefined();
        expect(check.accepted.valueJson).toBe(5);
      }
    }
  );
});

/**
 * I6 — the analyst holds nothing (F14).
 *
 * A second agent is the easiest way to reopen I6 without noticing. The coach may write audit answers
 * for one reason only: its run comes from a server-issued dispatch scope rather than from a model
 * argument. The analyst has no scope, because it is not dispatched through the chat handler at all —
 * so if it ever held `record_answers`, that reason would not apply to it and the write would be
 * exactly the model-chooses-its-own-run shape `fill_slot` was removed for.
 *
 * It does not need one. It reads a brief and returns JSON, and its output is persisted by the
 * application to a column on the run, never to a slot: a slot value is what the *leader* said, and
 * writing the tool's own prose there would make every consumer that treats a slot as testimony wrong.
 */
describe('I6 — the analyst is not a second writer', () => {
  it('declares no capabilities at all', async () => {
    const { reclaimAnalystAgent } = await import('@/lib/app/programme/analyst/agent');
    // Not "no write capability" — no capability field whatsoever. There is nothing to widen.
    expect('capabilities' in reclaimAnalystAgent).toBe(false);
  });

  it('is seeded internal, so it can never resolve as a surface a leader could chat to', async () => {
    const seed = await import('node:fs').then((fs) =>
      fs.readFileSync('prisma/seeds/app-reclaim/005-reclaim-analyst.ts', 'utf8')
    );
    expect(seed).toContain("visibility: 'internal'");
    expect(seed).not.toContain("visibility: 'public'");
    // A module binding would give it a seat on the coach surface; it must not have one.
    expect(seed).not.toContain('moduleAgentBinding');
    expect(seed).not.toContain('aiAgentCapability');
  });

  it('never reaches a slot write path', async () => {
    const fs = await import('node:fs');
    const dir = 'lib/app/programme/analyst';
    for (const file of fs.readdirSync(dir)) {
      const code = fs.readFileSync(`${dir}/${file}`, 'utf8');
      expect(code, `${file} writes slots — the analyst's output is not testimony`).not.toMatch(
        /\bsaveAnswer\b|\bappendSlotValue\b|\bsaveRunAnswer\b/
      );
      // `streamChat` would persist an AiMessage, putting a non-conversational pass into the
      // leader's own transcript.
      expect(code, `${file} imports streamChat`).not.toMatch(/\bstreamChat\b/);
    }
  });
});
