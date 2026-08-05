/**
 * A recorded answer says something on its own, or it is not recorded.
 *
 * ## The failure this exists for
 *
 * The coach offered three ways in. The leader typed **"1"**. `reclaim_action_chosen` was stored as
 * `"1"` and every reader downstream inherited it: the panel beside the conversation, the "What you
 * will start" band on the report, the PDF a leader keeps, the completion email, and the report agent,
 * which was asked to write a chapter about what this person had decided to do and handed the digit 1
 * to write it from.
 *
 * "1" was a true record of the keystroke and a useless record of the answer. The option's own words
 * were on screen one line above it.
 *
 * ## Why this is an invariant rather than a fix
 *
 * The audit's whole output is answers read back somewhere the conversation is not: a panel, a report,
 * a document somebody opens in a year. Every one of those surfaces shows a stored value **under the
 * question's own name, as though the leader had written it**. So the property is not "the value is
 * accurate" but "the value still answers the question when read alone", and that has to hold for
 * every reading in the audit rather than for the ones somebody remembered.
 *
 * So this asserts it **against every text slot the audit declares**, by running the guard rather than
 * by reasoning about the code path. A slot added tomorrow is covered without anyone remembering.
 *
 * ## The line it holds
 *
 * Resolving a **reference** is not interpreting a **meaning** (I6's "never inferred"). "1" becomes
 * the option the coach itself offered; "yes" becomes the thing just agreed to. Where a leader gave a
 * sentence, their sentence stands, untidied — asserted below, because a guard that quietly rewrote
 * people's words would be a worse failure than the one it replaced.
 */

import { describe, it, expect } from 'vitest';

import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { checkSlotWrite, pointsAtAnAnswer } from '@/lib/app/programme/coach/writable-slots';
import { COACH_WRITABLE_GROUPS } from '@/lib/app/programme/coach/writable-slots';

/** Every text slot the coach may write. The subject of this whole file. */
const WRITABLE_TEXT_SLOTS = reclaimSlotDefinitions.filter(
  (slot) =>
    (slot.dataType ?? 'text') === 'text' && COACH_WRITABLE_GROUPS.includes(slot.group as never)
);

/** The shapes a leader actually produces when they point at something instead of saying it. */
const POINTERS = [
  '1',
  '2',
  '3.',
  '2)',
  'option 1',
  'Option 2',
  'no. 3',
  '#1',
  'the first',
  'the first one',
  'second one',
  'the last one',
  'that one',
  'this one',
  'that',
  'yes',
  'Yes.',
  'yeah',
  'yep',
  'sure',
  'ok',
  'okay',
  'correct',
  'agreed',
  'I agree',
  'absolutely',
  'exactly',
];

/**
 * Answers that must survive, and each is here because a careless rule would eat it.
 *
 * The discipline this file inherits from `writable-slots.ts`: a false negative costs nothing new, and
 * a false positive discards something a leader said.
 */
const REAL_ANSWERS = [
  // A bare negative is a complete answer with content in it: asked what they would drop, "none" says
  // something. A bare affirmative never does. That asymmetry is deliberate and is the subtlest line
  // in the guard.
  'no',
  'none',
  'nothing',
  // The pointer with the thing pointed at beside it. Self-contained already.
  '1, the two protected mornings',
  'Option 2: handing over the Thursday stand-up',
  'Yes, because the mornings are the only quiet I get',
  'yes to the mornings, no to the review',
  // Ordinary sentences that begin with a word the patterns contain.
  'That is the one thing I have never protected',
  'First thing in the morning, before anyone else is up',
  'It is a pain due to travel time',
  'Right now I am carrying too much',
  'Exactly the same as last quarter, which is the problem',
  // Short but real.
  '60 hours a week',
  'staying sane',
  'I am wasting my life',
  "I'm just gonna resign",
];

describe('a recorded answer is not a pointer at one', () => {
  it.each(POINTERS)('refuses "%s" as a text answer', (value) => {
    expect(pointsAtAnAnswer(value)).toBe(true);
  });

  it.each(REAL_ANSWERS)('keeps "%s"', (value) => {
    expect(pointsAtAnAnswer(value)).toBe(false);
  });

  it('is not vacuous — the audit really does declare text slots the coach writes', () => {
    expect(WRITABLE_TEXT_SLOTS.length).toBeGreaterThan(10);
  });
});

describe('the rule holds for every text reading in the audit, not the remembered ones', () => {
  /**
   * The guard is asserted through `checkSlotWrite`, the one path both writers take
   * (`record_answers` and the capture sweep), rather than through the predicate alone. A rule that
   * passes in isolation and is never consulted is the failure mode an invariant test exists to catch.
   */
  it.each(WRITABLE_TEXT_SLOTS.map((s) => s.slug))('%s cannot be recorded as "1"', (slug) => {
    const result = checkSlotWrite(slug, undefined, {
      value: '1',
      // The reflections are phase-gated, so each is checked in the phase that owns it. Passing the
      // slug's own phase keeps this test about the pointer rule rather than about that gate.
      phaseKey: phaseForReflection(slug),
    });
    expect(result.ok, `${slug} accepted "1" as an answer`).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe('points_at_an_answer');
  });

  it.each(WRITABLE_TEXT_SLOTS.map((s) => s.slug))('%s cannot be recorded as "yes"', (slug) => {
    const result = checkSlotWrite(slug, undefined, {
      value: 'yes',
      phaseKey: phaseForReflection(slug),
    });
    expect(result.ok, `${slug} accepted "yes" as an answer`).toBe(false);
  });

  it.each(WRITABLE_TEXT_SLOTS.map((s) => s.slug))('%s keeps a real sentence', (slug) => {
    const result = checkSlotWrite(slug, undefined, {
      value: 'Two protected mornings a week, starting Monday',
      phaseKey: phaseForReflection(slug),
    });
    expect(result.ok, `${slug} refused a real answer`).toBe(true);
    // Untouched: the guard refuses, it never rewrites. A leader's sentence is theirs.
    if (result.ok) expect(result.accepted.value).toBeUndefined();
  });
});

describe('the refusal tells the coach what to do instead', () => {
  it('names the value and asks for what it refers to', () => {
    const result = checkSlotWrite('reclaim_action_chosen', undefined, { value: '1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The coach is the one holding the thing being pointed at — it offered the options — so the
    // refusal has to say so, or it reads as "that answer was wrong" and the coach asks again.
    expect(result.refusal.message).toContain('"1"');
    expect(result.refusal.message).toMatch(/option they picked|agreed to/);
  });
});

/** The phase a reflection belongs to, so the phase gate does not mask the rule under test. */
function phaseForReflection(slug: string): string | undefined {
  const match = /^reclaim_reflection_p(\d)$/.exec(slug);
  if (match === null) return undefined;
  return (
    {
      '1': 'phase-1-current',
      '2': 'phase-2-energy',
      '3': 'phase-3-ideal',
      '4': 'phase-4-gap',
      '5': 'phase-5-action',
      '6': 'phase-6-summary',
    }[match[1]] ?? undefined
  );
}
