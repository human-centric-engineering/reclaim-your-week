/**
 * The readings a leader picks from rather than writes out.
 *
 * ## Why this file exists
 *
 * Some of what the audit asks has a fixed set of answers. "Which period are we auditing" has four,
 * "is fundraising a significant part of your role" has two, and on the **form** path that has always
 * been visible: `setup-panel.tsx` drew a select for the period and a pair of Yes/No pills for each
 * flag. On the **conversation** path the same question arrived as an empty text box, so a leader who
 * had just been asked to choose between last week, last month, last quarter and last year was left
 * to guess the wording and type it. The two paths write the same slots (I3) and asked for the same
 * thing in two different ways, and only one of them told the leader what the answers were.
 *
 * So the option sets stop belonging to a form panel and become a property of the slot. Both surfaces
 * read them from here, which is the only arrangement in which they cannot drift: an option added to
 * the period list appears in the select and in the conversation in the same commit, worded the same
 * way in both.
 *
 * ## Authored where the answers are a product decision, derived where they are not
 *
 * Every `boolean` slot the coach may write has the same two answers, and writing "Yes / No" out
 * eighteen times would be a list that has to be maintained in step with `slots.ts` and will not be.
 * Those are derived from the data type. What is authored here is the handful of sets where the
 * options are a choice somebody made — the four periods, the six roles, the four organisation types
 * — and those are the exact arrays the form panel has been drawing since v1, moved rather than
 * rewritten, because a leader returning to the form should meet the words they met in the chat.
 *
 * ## What this is not
 *
 * **It is not a licence to close an open question.** Nothing here belongs on a slot whose value is
 * the leader's own account of something: what is keeping them up, what their week actually looks
 * like, what they are taking away. Offering four buttons for those would be the tool answering on
 * their behalf, which is the failure the whole conversational surface exists to avoid. The test
 * beside this file holds that line by asserting no `sensitive` slot ever gains a set.
 *
 * **And it is never a closed door.** A set is an offer, not a constraint: the composer keeps a way
 * to type something else, and the value the leader picks is sent as an ordinary turn for the coach
 * to record, exactly as a typed answer would be. Nothing here writes a slot.
 */

import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';

/**
 * The roles, organisation types and periods the form has always offered.
 *
 * Exported so `setup-panel.tsx` consumes them from here rather than holding its own copy. They read
 * as they did — lower case for the periods, because the question they answer is "which quarter or
 * timeframe", and "last quarter" is how somebody says that.
 */
export const RECLAIM_ROLES = [
  'CEO',
  'Founder',
  'Programme Officer',
  'Philanthropist',
  'Director',
  'Other',
] as const;

export const RECLAIM_ORG_TYPES = ['Nonprofit', 'Startup', 'Established business', 'Other'] as const;

export const RECLAIM_AUDIT_PERIODS = [
  'last week',
  'last month',
  'last quarter',
  'last year',
] as const;

/**
 * The two answers to a yes-or-no, in the words `checkSlotWrite` already reads.
 *
 * `deriveTypedValue` in `writable-slots.ts` turns the prose "Yes" into the typed `true` a boolean
 * slot requires, and `slotApplies` reads the same word off the form path. So these strings are not
 * display text with a separate value behind them: they are the value, and changing them here would
 * quietly break the conditional readings that branch on them.
 */
export const YES_NO = ['Yes', 'No'] as const;

/**
 * Sets that are a product decision rather than a consequence of the data type.
 *
 * `reclaim_setup_fundraising_support` is the one entry with no form-panel ancestor — the panel draws
 * it as free text. Its slot description states a binary outright ("whether they have a development
 * team or carry fundraising alone"), and it is the follower on a paired question whose anchor is
 * already a yes-or-no, so a leader answering both in one breath meets a text box halfway through a
 * pair of buttons. The set says the two cases and nothing more; anyone whose situation is neither
 * types over it, which is what the escape hatch is for.
 */
const AUTHORED_CHOICES: Readonly<Record<string, readonly string[]>> = {
  reclaim_profile_role: RECLAIM_ROLES,
  reclaim_profile_org_type: RECLAIM_ORG_TYPES,
  reclaim_setup_audit_period: RECLAIM_AUDIT_PERIODS,
  reclaim_setup_fundraising_support: ['I have a development team', 'I carry it myself'],
};

/** Slug → data type, from the real slot set, so a derived set tracks the definitions. */
const DATA_TYPE_BY_SLUG = new Map(
  reclaimSlotDefinitions.map((definition) => [definition.slug, definition.dataType ?? 'text'])
);

/**
 * Booleans that are bookkeeping rather than a question.
 *
 * The derivation below reads the data type, and the data type cannot tell "is fundraising part of
 * your role" from a flag the product sets about itself. `reclaim_gap_challenge_offered` records
 * *that the permission-based challenge has been put to this leader* — `phase4-panel.tsx` writes it
 * on save and the coach is told to record it once it has made the offer. Derived, it would put
 * "A challenge, offered once — Choose one: Yes / No" under the composer, and whichever button the
 * leader tapped would be stored as their answer to a question about the audit's own state. The
 * `sensitive` guard the header describes does not catch it, because it is not sensitive; it is
 * simply not theirs to answer.
 */
const NOT_THE_LEADER_S_TO_ANSWER: readonly string[] = ['reclaim_gap_challenge_offered'];

/**
 * The answers on offer for one reading, or `null` where the honest answer is a box to write in.
 *
 * Authored first, then the boolean derivation, and the order matters in exactly one case: a boolean
 * slot could in principle want words other than yes and no, and an entry above would win. None does
 * today.
 *
 * `Object.hasOwn` rather than a bare lookup: a slug of `constructor` or `toString` would otherwise
 * find something on the prototype and return it as though it were an answer set. No caller can
 * currently reach here with one — both check the slot exists first — but a guard whose safety rests
 * on its callers staying careful is not one.
 */
export function choicesFor(slug: string): readonly string[] | null {
  if (NOT_THE_LEADER_S_TO_ANSWER.includes(slug)) return null;
  if (Object.hasOwn(AUTHORED_CHOICES, slug)) {
    const authored = AUTHORED_CHOICES[slug];
    if (authored !== undefined) return authored;
  }
  return DATA_TYPE_BY_SLUG.get(slug) === 'boolean' ? YES_NO : null;
}

/** Whether this reading is one a leader picks. The predicate half of `choicesFor`. */
export function hasChoices(slug: string): boolean {
  return choicesFor(slug) !== null;
}
