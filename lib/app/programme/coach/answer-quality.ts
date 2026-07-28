/**
 * Telling a reading that landed from one that is owed another turn.
 *
 * Everything the audit knows about a leader comes back to the coach as `captured as "…"`. A four-line
 * account of what their delivery time actually looks like and the word "meetings" render identically,
 * so the coach has no way to tell the conversation it was supposed to have from the one it settled
 * for. Same with an inference: `sourceType` and `confidence` are recorded faithfully and then nothing
 * anywhere says what to do about a reading the coach worked out at confidence four.
 *
 * Two flags, deterministic, no model judgement and no new state.
 *
 * ## Why this is a trigger and never a verdict
 *
 * Word count does not measure whether an answer is any good, and anything built on it that pretends
 * otherwise will be wrong about a leader who says something short and true. Three things keep it
 * honest, and all three are load-bearing:
 *
 * 1. **The word is `short`, which is a fact about a string.** Not "thin", not "weak", not "low
 *    quality". A model writes like the context it is given, and a coach told the leader's answer was
 *    poor will let that show. I17 says nothing a leader meets is framed as a failure, and the leader
 *    meets this indirectly, in the coach's manner, on the next turn.
 * 2. **It applies to a named set, not to every text slot.** `reclaim_profile_first_name` is one word
 *    and complete. `reclaim_action_when` is "next Tuesday" and complete. Flagging those would train
 *    the coach to press on answers that are already right, which is the failure this exists to fix,
 *    made worse. `SHORT_ANSWER_SLOTS` holds only the readings whose *purpose* is prose.
 * 3. **The instruction says out loud that a short answer is not a bad one.** See `phase-context.ts`.
 *
 * ## Why the two lists have an exhaustiveness test
 *
 * A hand-maintained list rots, which is the argument `phase-slots.ts` makes for deriving from groups.
 * The reason this one is hand-written anyway is that the cost is asymmetric: a new slot left out is
 * invisible and harmless, while a name field flagged short on every turn is a live defect a leader
 * would feel. So the list is explicit and a test asserts its union with `NOT_TEXTURE` is exactly the
 * coach-writable text slots on disk — the same idiom `product-voice.test.ts` and `agent-caps.test.ts`
 * already use. A new slot fails that test until somebody decides which kind it is.
 */

import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { COACH_WRITABLE_GROUPS } from '@/lib/app/programme/coach/writable-slots';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';

/** Why a captured reading is owed one more turn, or `null` when it is not. */
export type AnswerFlag = 'short' | 'unconfirmed' | null;

/** Under this many words, a texture reading is a note rather than an account. */
const SHORT_ANSWER_WORDS = 7;

/**
 * At or below this, an inference has not earned its place in the audit without being checked.
 *
 * The tool's own description of the scale says 9 or 10 for something stated plainly and 4 to 6 for
 * something read from an adjacent remark, so this is the top of the band the tool already calls a
 * reading it worked out rather than heard.
 */
const UNCONFIRMED_CONFIDENCE = 6;

/**
 * Readings whose whole purpose is prose, and which are therefore worth going back for when short.
 *
 * The nine per-area texture lanes are generated rather than listed, so a tenth area gets covered
 * without anyone remembering this file exists.
 */
export const SHORT_ANSWER_SLOTS: readonly string[] = [
  ...RECLAIM_BUCKETS.map((b) => `reclaim_current_detail__${bucketToken(b.slug)}`),
  'reclaim_setup_transition_detail',
  'reclaim_setup_priorities',
  'reclaim_setup_keeping_me_up',
  'reclaim_setup_why_now',
  'reclaim_profile_distributed_impact',
  'reclaim_energy_peak_description',
  'reclaim_energy_protected',
  'reclaim_gap_unfunded_priorities',
  'reclaim_gap_challenge_response',
  'reclaim_gap_strategy_mirror',
  // The source's specificity test lives exactly here: "do more deep work" is four words, and
  // "protect 7-8am on Monday, Wednesday and Friday as a non-negotiable deep work block" is not.
  'reclaim_action_chosen',
  'reclaim_action_stopping',
  'reclaim_action_how_known',
  'reclaim_action_wanted_not_dutiful',
  // The six per-phase reflections. A reflection is the pause the whole method rests on, and a
  // three-word one is the leader being polite rather than the leader noticing something.
  ...[1, 2, 3, 4, 5, 6].map((n) => `reclaim_reflection_p${n}`),
];

/**
 * Coach-writable text readings that a short answer completes perfectly well.
 *
 * Listed rather than inferred so the exhaustiveness test has both halves to check. A name is a name.
 */
export const NOT_TEXTURE: readonly string[] = [
  'reclaim_profile_first_name',
  'reclaim_profile_role',
  'reclaim_profile_org_type',
  'reclaim_setup_fundraising_support',
  'reclaim_setup_audit_period',
  'reclaim_current_deep_block_when',
  'reclaim_current_deep_block_blocker',
  'reclaim_ideal_deep_block_when',
  'reclaim_ideal_protected_commitment',
  'reclaim_action_when',
];

const SHORT_SET = new Set(SHORT_ANSWER_SLOTS);

/** Every coach-writable free-text slug, which the two lists above must together account for. */
export function coachWritableTextSlugs(): string[] {
  return reclaimSlotDefinitions
    .filter((d) => COACH_WRITABLE_GROUPS.includes(d.group))
    .filter((d) => (d.dataType ?? 'text') === 'text')
    .map((d) => d.slug);
}

/** What a captured reading is owed, if anything. */
export function answerFlag(
  slug: string,
  dataType: string,
  answer: { value: string; sourceType: string; confidence: number }
): AnswerFlag {
  // Typed readings are exempt unconditionally. A `number` is already guarded by the typed-value rule,
  // a `boolean`'s value is the string "Yes", and a `json` slot's prose is a serialised object that
  // would be flagged forever. Length says nothing useful about any of them.
  if (dataType !== 'text') return null;

  // Checked before `short`, so a line never carries two flags: an inference the leader has not seen
  // is owed a check more urgently than a short answer is owed depth, and one flag per line keeps the
  // list scannable.
  if (answer.sourceType === 'inferred' && answer.confidence <= UNCONFIRMED_CONFIDENCE) {
    return 'unconfirmed';
  }

  if (!SHORT_SET.has(slug)) return null;
  const words = answer.value.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words < SHORT_ANSWER_WORDS ? 'short' : null;
}

/** The clause appended to a captured line, or `''`. Kept here so the assembler never re-words it. */
export function answerFlagNote(flag: AnswerFlag): string {
  switch (flag) {
    case 'short':
      return ', and short';
    case 'unconfirmed':
      return ', not yet confirmed';
    default:
      return '';
  }
}
