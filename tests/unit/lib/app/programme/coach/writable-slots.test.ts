/**
 * The gate both writers pass through, and the one rule here that is about the *value* rather than
 * the slug.
 *
 * `isNotAnAnswer` exists because of a failure a leader actually saw. The capture sweep read a message
 * about a role, a team of thirty and two locations, and returned `reclaim_profile_first_name` valued
 * "The leader did not provide their first name in this exchange." at confidence 9, source type
 * `direct`. Every guard in the chain passed: the slot exists, the group is writable, it is a text slot
 * so there was no typed value to fail. It was stored, and the panel beside the conversation then
 * showed that sentence under "Your first name" as though the leader had said it.
 *
 * So the assertions here come in pairs. Each one that must be refused is a real or near-real
 * non-answer; each one that must be kept is a reading that shares its words. The second column is the
 * one that matters most: a false positive here discards something a leader said, which is worse than
 * the bug it prevents, and it is why every test in the rule is anchored or exact rather than a search
 * inside a sentence.
 */

import { describe, it, expect } from 'vitest';
import { isNotAnAnswer, checkSlotWrite } from '@/lib/app/programme/coach/writable-slots';

describe('isNotAnAnswer — a report that there was nothing to record', () => {
  it.each([
    'The leader did not provide their first name in this exchange.',
    'The leader did not mention this.',
    'This leader has not said what the change is.',
    'The user did not answer.',
    'The participant gave no figure.',
  ])('refuses a value narrating about the leader: %s', (value) => {
    expect(isNotAnAnswer(value)).toBe(true);
  });

  it.each([
    'N/A',
    'n/a.',
    'NA',
    'Unknown',
    'unknown.',
    'Not provided',
    'not specified',
    'Not mentioned',
    'not stated',
    'Not yet provided',
    'No answer',
    'not applicable',
  ])('refuses the placeholder %s, whole and on its own', (value) => {
    expect(isNotAnAnswer(value)).toBe(true);
  });

  it.each(['No first name was provided.', 'No figure was given', 'None was mentioned'])(
    'refuses the same non-answer in the passive: %s',
    (value) => {
      expect(isNotAnAnswer(value)).toBe(true);
    }
  );

  it('refuses a value that is only whitespace', () => {
    expect(isNotAnAnswer('   ')).toBe(true);
  });

  it.each([
    // The real values from the audit that produced the bug. None of them may be touched.
    'CTO',
    'retail',
    '5 direct reports',
    '60 hours a week',
    'Yes',
    'No',
    "It's a pain due to travel time",
    // A reflection about leadership. Unanchored, "the leader" would swallow this one, and a
    // reflection is the reading this app is most careful about.
    'I am not the leader I want to be',
    'The leadership team is spread thin',
    // A leader's own sentence about absence. It opens on "no" and names a verb, and it is an answer
    // about their week rather than a note about the record.
    'No time was protected last quarter, and that is the problem',
    // Placeholders are matched whole, so the same words inside a real sentence survive.
    'The bit I have not provided is what I would drop',
    'none',
    'not enough time with the board',
  ])('keeps a real answer: %s', (value) => {
    expect(isNotAnAnswer(value)).toBe(false);
  });
});

describe('checkSlotWrite — the rule reaches both writers', () => {
  it('refuses the note in place of an answer, with a code the caller can log', () => {
    const check = checkSlotWrite('reclaim_profile_first_name', undefined, {
      phaseKey: 'phase-0-setup',
      sourceType: 'direct',
      value: 'The leader did not provide their first name in this exchange.',
    });

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.refusal.code).toBe('not_an_answer');
    // Fed back to the model, so it has to say what to do instead rather than only saying no.
    expect(check.ok === false && check.refusal.message).toContain('Leave it out');
  });

  it('lets the same slot through with something the leader actually said', () => {
    const check = checkSlotWrite('reclaim_profile_first_name', undefined, {
      phaseKey: 'phase-0-setup',
      sourceType: 'direct',
      value: 'Sam',
    });

    expect(check.ok).toBe(true);
  });

  it('does not touch a write that carries no prose at all', () => {
    // `valueJson` alone is a valid shape for a typed slot, and there is nothing to read.
    const check = checkSlotWrite('reclaim_setup_in_transition', true, {
      phaseKey: 'phase-0-setup',
      sourceType: 'direct',
    });

    expect(check.ok).toBe(true);
  });

  it('refuses a typed slot whose figure came with a sentence about its absence', () => {
    // The typed rule would refuse this one anyway. Checking the prose first means the refusal says
    // the true reason, and it closes the case where a figure arrives beside the narration.
    const check = checkSlotWrite('reclaim_setup_weekly_hours', 40, {
      phaseKey: 'phase-0-setup',
      sourceType: 'inferred',
      value: 'The leader did not say how many hours they work.',
    });

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.refusal.code).toBe('not_an_answer');
  });
});
