/**
 * The readings a leader picks from.
 *
 * Two claims are worth a test here, and neither is "the array has four items in it".
 *
 * **The set has to fit the slot it is offered against.** An option a leader taps becomes their turn
 * and is recorded from what they said, so a set whose values a slot cannot hold is a button that
 * produces a refusal. The boolean case is the one that bites: `deriveTypedValue` reads the exact word
 * "Yes" to produce the typed `true` a boolean slot requires, so the two derived options are not
 * display text with a value behind them, they *are* the value.
 *
 * **And a set must never appear on a question the leader answers in their own words.** That is the
 * whole risk of this feature: four buttons under "what is keeping you up at night" would be the tool
 * answering on their behalf. The assertion is made against the real slot set rather than a list, so
 * a set added to a prose slot tomorrow fails here rather than in front of somebody.
 */

import { describe, it, expect } from 'vitest';
import {
  choicesFor,
  hasChoices,
  YES_NO,
  RECLAIM_AUDIT_PERIODS,
  RECLAIM_ORG_TYPES,
  RECLAIM_ROLES,
} from '@/lib/app/programme/coach/slot-choices';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { checkSlotWrite } from '@/lib/app/programme/coach/writable-slots';

describe('the answers a leader picks from', () => {
  it('offers the four periods for the reading the question in the brief is about', () => {
    // The question that prompted all of this: "which quarter or timeframe should we consider when
    // looking at your time and activities", asked above an empty text box.
    expect(choicesFor('reclaim_setup_audit_period')).toEqual([
      'last week',
      'last month',
      'last quarter',
      'last year',
    ]);
  });

  it('derives yes and no for every boolean reading a leader is asked, without a list to maintain', () => {
    const booleans = reclaimSlotDefinitions.filter(
      (s) => s.dataType === 'boolean' && s.slug !== 'reclaim_gap_challenge_offered'
    );
    // A guard on the guard: if the slot set ever loses its booleans, the loop below would pass by
    // being empty and this file would quietly stop testing the case it exists for.
    expect(booleans.length).toBeGreaterThan(0);
    for (const slot of booleans) {
      expect(choicesFor(slot.slug)).toEqual([...YES_NO]);
    }
  });

  it('offers nothing for a boolean that records what the product did, not what the leader said', () => {
    // The one place the data type is not enough to decide. `reclaim_gap_challenge_offered` is a
    // boolean in a coach-writable group and is not `sensitive`, so neither guard above catches it —
    // but it records *that the challenge was put to this leader*, which the panel and the coach both
    // write about themselves. Derived, it would draw "A challenge, offered once — Choose one:
    // Yes / No" under the composer and store whichever button was tapped as the leader's answer.
    expect(choicesFor('reclaim_gap_challenge_offered')).toBeNull();
    expect(hasChoices('reclaim_gap_challenge_offered')).toBe(false);
  });

  it('treats a slug that names an Object prototype member as a reading with no set', () => {
    // A bare `AUTHORED_CHOICES[slug]` lookup would find `Object.prototype.toString` and hand back a
    // function where an array of answers belongs. No caller can reach here with one today — both
    // check the slot exists first — which is exactly why nothing else would catch a regression.
    for (const slug of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(choicesFor(slug)).toBeNull();
    }
  });

  it('offers values a boolean slot can actually store', () => {
    // The end-to-end claim in one line: what the button sends must survive the write check that
    // every recorded answer goes through. "Yes" derives the typed `true`; a set reading "Yep" would
    // be refused with `typed_value_required` and the leader would have tapped a dead button.
    for (const option of YES_NO) {
      const check = checkSlotWrite('reclaim_setup_in_transition', undefined, {
        phaseKey: 'phase-0-setup',
        sourceType: 'direct',
        value: option,
      });
      expect(check.ok).toBe(true);
    }
  });

  it('never offers a set for a reading given in the leader’s own words', () => {
    // `sensitive` marks the readings that are somebody's account of their own working life: what is
    // keeping them up, what a kind of time actually looks like, what they are taking away. Every one
    // of them must meet a box to write in.
    const sensitive = reclaimSlotDefinitions.filter((s) => s.sensitivity === 'sensitive');
    expect(sensitive.length).toBeGreaterThan(0);
    const offered = sensitive.filter((s) => hasChoices(s.slug)).map((s) => s.slug);
    expect(offered).toEqual([]);
  });

  it('offers nothing for the nine per-area lanes, which are hours and descriptions', () => {
    expect(hasChoices('reclaim_current_hours__deep_work')).toBe(false);
    expect(hasChoices('reclaim_current_detail__deep_work')).toBe(false);
  });

  it('names every authored set against a reading that exists', () => {
    // A set keyed on a slug nobody has, whether from a typo or a rename, is dead data that no test
    // would otherwise notice: `choicesFor` would simply never be asked for it.
    const slugs = new Set(reclaimSlotDefinitions.map((s) => s.slug));
    for (const slug of [
      'reclaim_profile_role',
      'reclaim_profile_org_type',
      'reclaim_setup_audit_period',
      'reclaim_setup_fundraising_support',
    ]) {
      expect(slugs.has(slug)).toBe(true);
      expect(hasChoices(slug)).toBe(true);
    }
  });

  it('keeps the roles and organisation types the form has always drawn', () => {
    // These moved out of `setup-panel.tsx` rather than being rewritten. The panel imports them from
    // here now, so a leader who switches between the two paths mid-audit meets the same words.
    expect(RECLAIM_ROLES).toContain('Programme Officer');
    expect(RECLAIM_ORG_TYPES).toContain('Established business');
    expect(RECLAIM_AUDIT_PERIODS[2]).toBe('last quarter');
  });
});
