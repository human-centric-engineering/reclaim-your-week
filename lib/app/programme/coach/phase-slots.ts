/**
 * What each phase captures — the one mapping the conversation and the panel both read.
 *
 * The forms encoded this implicitly: Phase 3's panel knew about `reclaim_ideal_*` because a developer
 * wrote those slugs into it. A conversation cannot work that way. The coach has to be told, in the
 * current phase and in the current run, which readings this part of the audit is for and which of
 * them it already has, or it either asks for everything at once or asks again for what the leader has
 * already said. The panel beside it needs exactly the same list to show what has been recorded. One
 * mapping, two readers.
 *
 * **Groups, not slug lists.** The slot groups already partition the audit by phase, because that is
 * how they were named (`reclaim_setup` is Phase 0, `reclaim_energy` is Phase 2). Deriving the phase's
 * slots from its groups means a slot added to `slots.ts` tomorrow appears in the conversation without
 * anyone remembering to add it here, which is the failure this file exists to prevent.
 *
 * **Only what the coach may write.** Every group here is in `COACH_WRITABLE_GROUPS`; the refused
 * groups (sharing consent, the computed calendar lanes) are absent by construction, so the coach is
 * never handed a list of readings it would then be refused for recording (I6). Phase 6 captures none
 * of these: its own slots are the sharing choices, which are consent.
 *
 * **Reflections are writable now, and still not here.** `reclaim_reflection` was moved into
 * `COACH_WRITABLE_GROUPS`, but the group holds all six per-phase reflections at once, so listing it
 * against a phase would hand the coach five slugs it may not touch. The reflection a phase closes on
 * is derived per phase instead (`reflectionSlugForPhase`), which is the same rule the write allowlist
 * enforces. This list stays what it has always been: the readings the phase is *for*.
 *
 * Pure data and pure functions — no Prisma, no framework reads — so the client panel imports it as
 * happily as the server-side context builder does.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { COACH_WRITABLE_GROUPS } from '@/lib/app/programme/coach/writable-slots';

/** The slot groups each phase captures, in the order a conversation would reach them. */
export const PHASE_SLOT_GROUPS: Readonly<Record<string, readonly string[]>> = {
  'phase-0-setup': ['reclaim_profile', 'reclaim_setup'],
  'phase-1-current': ['reclaim_current'],
  'phase-2-energy': ['reclaim_energy'],
  'phase-3-ideal': ['reclaim_ideal'],
  'phase-4-gap': ['reclaim_gap'],
  'phase-5-action': ['reclaim_action'],
  // The summary phase's own slots are `reclaim_share` (consent) and nothing else.
  'phase-6-summary': [],
};

/** One slot a phase captures, with what the leader should see it called. */
export interface PhaseSlot {
  slug: string;
  /** Short leader-facing label for the panel. Never the slug. */
  label: string;
  /** `text` unless the slot needs a typed value, in which case a figure is required (I6). */
  dataType: string;
  /** The canonical bucket slug, for the nine per-area lanes; absent for every other slot. */
  bucketSlug?: string;
  /**
   * Readings that belong in the same question as this one, in the order they should be asked.
   *
   * Present only on the **anchor** of a pair; the followers carry `pairedTo` instead, so a renderer
   * walking the list knows which line owns the question and which are already spoken for.
   */
  pairedWith?: readonly string[];
  /** The anchor this reading is asked alongside. The inverse of `pairedWith`. */
  pairedTo?: string;
  /** The condition under which this reading applies at all. Absent means it always does. */
  askOnlyIf?: SlotCondition;
}

/** "Only ask this when that other reading came back a particular way." */
export interface SlotCondition {
  /** The boolean reading this one depends on. */
  slug: string;
  /** The answer that makes this reading apply. */
  equals: boolean;
}

/**
 * Readings that are one question, not two.
 *
 * **Why this is data now.** The rule existed already, as a paragraph of prose in the coach's phase-1
 * context telling it to ask the hours and the texture "in the same breath". That paragraph was
 * written because the first version asked them separately and the coach took all nine figures and
 * left all nine in-practice readings empty: a figure is concrete and closes cleanly, a description is
 * open-ended and always feels like it can wait. But prose only fixed the one phase somebody wrote
 * prose for. Phase 2's two energy questions are the same shape, the source asks them together, and
 * nothing told the coach so, so they arrived as two turns with a "thanks, and now" between them.
 * Every leader who described this as feeling like a form was describing that rhythm.
 *
 * Keyed by anchor. The anchor is asked first and its partners follow inside the same question, which
 * is why order matters here: a leader answering "roughly how many hours, and what does that time
 * actually look like?" answers them in that order and the recording should follow their sentence.
 *
 * **This is not a licence to batch.** Two readings in one question is a conversation; five is an
 * interview. Nothing here pairs more than three, and the triple is the action commitment, which the
 * source states as a single move ("what they will do, when they will start, what they will stop") and
 * which reads as one thought rather than three questions.
 */
const SLOT_PAIRS: Readonly<Record<string, readonly string[]>> = {
  // Phase 0. Each of these is a yes-or-no whose interesting half is the follow-on, and asking the
  // boolean alone gets a "yes" and a pause while the leader waits to be asked why it matters.
  reclaim_setup_in_transition: ['reclaim_setup_transition_detail'],
  reclaim_setup_fundraising_relevant: ['reclaim_setup_fundraising_support'],
  reclaim_profile_distributed_team: ['reclaim_profile_distributed_impact'],

  // Phase 1. The nine per-area pairs are generated below, because they follow the bucket list.
  reclaim_current_deep_block_exists: [
    'reclaim_current_deep_block_when',
    'reclaim_current_deep_block_blocker',
  ],

  // Phase 2. `Time_Audit_Tool_Prompt_Text.md:278-279` asks both at once: when are they at their
  // best, and does the week protect that window or consume it. The second is the one that stings,
  // and it only lands while the first is still in the air.
  reclaim_energy_peak_description: ['reclaim_energy_protected'],

  // Phase 5. The source's three-part commitment, which it calls a single act: "The act of stating
  // this clearly is itself a commitment" (`:334`).
  reclaim_action_chosen: ['reclaim_action_when', 'reclaim_action_stopping'],
};

/**
 * Readings that only apply to some leaders, and the answer that makes them apply.
 *
 * **This closes a hole the phase gate had to be loosened around.** `reclaim_current_deep_block_blocker`
 * exists only for a leader with *no* protected deep-work block, so for everyone else it sat on the
 * capture list as "not yet captured" forever. The coach read the list as its worklist, found it
 * permanently unfinished, and kept gathering — while the phase's closing question waited on a list
 * that could not be completed. The fix at the time was to stop gating the reflection on the list,
 * which was right, but it left the coach unable to tell "nobody has asked this" from "this does not
 * apply here". Declaring the condition answers that deterministically, from the run's own data.
 */
const SLOT_CONDITIONS: Readonly<Record<string, SlotCondition>> = {
  reclaim_setup_transition_detail: { slug: 'reclaim_setup_in_transition', equals: true },
  reclaim_setup_fundraising_support: { slug: 'reclaim_setup_fundraising_relevant', equals: true },
  reclaim_profile_distributed_impact: { slug: 'reclaim_profile_distributed_team', equals: true },
  reclaim_current_deep_block_when: { slug: 'reclaim_current_deep_block_exists', equals: true },
  // The one that started all this: asked only of a leader who does *not* have a block.
  reclaim_current_deep_block_blocker: { slug: 'reclaim_current_deep_block_exists', equals: false },
};

/**
 * Readings this phase cannot capture, because the surface that would capture them was never built.
 *
 * `reclaim_energy_peak_windows` is the week grid from the app notes: "Energy. Pick your peak windows
 * on a week grid" (`.context/app/sources/Time_Audit_App_Notes.md:44`). The grid does not exist. No
 * form panel writes the slot (`phase/phase2-panel.tsx` writes the other two), the coach's own phase-2
 * guidance names only the other two, and its `json` data type refuses everything a conversation could
 * offer it.
 *
 * It stayed on the capture list regardless, and both readers of that list were harmed by it. The
 * coach was handed an outstanding reading with no question attached and did the predictable thing:
 * it fired the leader's next answer at the slug and was refused (`typed_value_required`). The panel
 * beside the leader offered "Your peak windows" against a question nobody asks, and counted it, so
 * phase 2 read "0 of 3" and could never pass 2. A reading listed as missing is a question not yet
 * asked, which is the meaning the rest of this file works to keep true; this one made that a lie.
 *
 * The definition stays in `slots.ts` so a week grid can claim it if it is ever built. What comes off
 * is the claim that this phase captures it.
 */
const NO_SURFACE_CAPTURES_THESE: readonly string[] = ['reclaim_energy_peak_windows'];

/**
 * Leader-facing labels for the slots that are not one of the nine per-area lanes.
 *
 * Lifted from the wording the form panels already use rather than newly authored, shortened from a
 * question to a noun phrase because the panel is a list of what was heard, not a list of questions.
 * A slug with no entry falls back to its own words, which is legible but plain, so a new slot shows
 * up looking unfinished rather than silently missing.
 *
 * **One response slot, two challenges, and that is deliberate.** `reclaim_gap_challenge_response`
 * is fed by two different questions depending on which surface the leader met phase 4 on. The form
 * panel asks the under-delegation invitation ("what would it take to let go of some of this, and
 * lead more through others?") and marks `reclaim_gap_challenge_offered` on save
 * (`components/app/reclaim/phase/phase4-panel.tsx`); the conversation asks the Brief's
 * permission-based challenge instead. Both are the one challenge this audit gets, which is the
 * Brief's own rule, so a leader who met the invitation on the form is *correctly* not offered the
 * permission challenge in conversation. Splitting them into two slots would record a distinction no
 * leader will ever draw, so the labels here are neutral between the two rather than naming either.
 * What they must not be is the invitation's own phrasing, which is a third beat with no slot at all.
 */
const SLOT_LABELS: Readonly<Record<string, string>> = {
  reclaim_profile_first_name: 'Your first name',
  reclaim_profile_role: 'Your role',
  reclaim_profile_org_type: 'Type of organisation',
  reclaim_profile_direct_reports: 'Direct reports',
  reclaim_profile_distributed_team: 'Team spread across places',
  reclaim_profile_distributed_impact: 'How that shapes your leading',
  reclaim_setup_in_transition: 'In a period of change',
  reclaim_setup_transition_detail: 'What the change is',
  reclaim_setup_fundraising_relevant: 'Fundraising part of the role',
  reclaim_setup_fundraising_support: 'Development team, or you',
  reclaim_setup_weekly_hours: 'Your weekly hours',
  reclaim_setup_priorities: 'Your priorities this year',
  reclaim_setup_keeping_me_up: 'What is keeping you up',
  reclaim_setup_why_now: 'Why now',
  reclaim_setup_audit_period: 'The period being audited',
  reclaim_current_deep_block_exists: 'A protected deep-work block',
  reclaim_current_deep_block_when: 'Where that block sits',
  reclaim_current_deep_block_blocker: 'What gets in its way',
  reclaim_energy_peak_windows: 'Your peak windows',
  reclaim_energy_peak_description: 'When you are at your best',
  reclaim_energy_protected: 'Whether your week protects it',
  reclaim_ideal_total_hours: 'A sustainable weekly total',
  reclaim_ideal_deep_block_when: 'Where deep work would sit',
  reclaim_ideal_protected_commitment: 'The one protected commitment',
  reclaim_gap_summary: 'The gap, area by area',
  reclaim_gap_hours_to_remove: 'Hours to find',
  reclaim_gap_unfunded_priorities: 'Priorities with no time in them',
  // Both of these carried the under-delegation invitation's phrasing, which belongs to a third beat
  // that has no slot of its own. See the note above `SLOT_LABELS` on the two challenges.
  reclaim_gap_challenge_offered: 'A challenge, offered once',
  reclaim_gap_challenge_response: 'What you made of it',
  reclaim_gap_strategy_mirror: 'What a stranger would read in your calendar',
  reclaim_action_options: 'The options considered',
  reclaim_action_chosen: 'The one thing you will do',
  reclaim_action_when: 'When you will start',
  reclaim_action_stopping: 'What you will stop',
  reclaim_action_how_known: 'How you will know it worked',
  reclaim_action_wanted_not_dutiful: 'Wanted, not dutiful',
};

/** Slug → canonical bucket slug, for the per-area lanes (`..._hours__deep_work` → `deep-work`). */
const BUCKET_BY_TOKEN = new Map(RECLAIM_BUCKETS.map((b) => [bucketToken(b.slug), b]));

/** The per-area suffix of a lane slug (`reclaim_current_detail__deep_work` → `deep_work`), or null. */
function bucketTokenOf(slug: string): string | null {
  const index = slug.lastIndexOf('__');
  return index === -1 ? null : slug.slice(index + 2);
}

/**
 * The label for one slot. Per-area lanes are named from the canonical bucket title, optionally
 * overridden by the leader's own relabelling (I7 — the display label moves, the slug never does).
 */
export function slotLabel(slug: string, bucketLabels: Record<string, string> = {}): string {
  const token = bucketTokenOf(slug);
  if (token !== null) {
    const bucket = BUCKET_BY_TOKEN.get(token);
    if (bucket !== undefined) {
      const name = bucketLabels[token] ?? bucket.title;
      if (slug.includes('_detail__')) return `${name}, in practice`;
      return `${name}, hours a week`;
    }
  }
  return SLOT_LABELS[slug] ?? slug;
}

/** Whether this slug is one of the nine per-area lanes for the given bucket family. */
function isFundraisingLane(slug: string): boolean {
  return bucketTokenOf(slug) === 'fundraising_capital';
}

/**
 * Every pairing, including the nine per-area ones.
 *
 * The area pairs are generated from `RECLAIM_BUCKETS` rather than written out, for the same reason
 * `phaseCaptureSlots` derives from groups: a tenth area added tomorrow gets its pairing without
 * anyone remembering this file exists. The hand-written entries in `SLOT_PAIRS` are the ones that do
 * not follow a pattern.
 */
const ALL_PAIRS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    RECLAIM_BUCKETS.map((bucket) => {
      const token = bucketToken(bucket.slug);
      return [`reclaim_current_hours__${token}`, [`reclaim_current_detail__${token}`]];
    })
  ),
  ...SLOT_PAIRS,
};

/** Follower slug → the anchor it is asked alongside. Derived, so the two can never disagree. */
const PAIRED_TO = new Map(
  Object.entries(ALL_PAIRS).flatMap(([anchor, followers]) =>
    followers.map((follower) => [follower, anchor] as const)
  )
);

/**
 * Whether a conditional reading applies to this leader, given what the run already holds.
 *
 * Three answers, not two, and the third is the point: `undefined` means the reading it depends on has
 * not been captured yet, so we do not know. A coach told "does not apply" on the strength of a
 * question nobody has asked would quietly drop readings — so an unanswered condition leaves the
 * reading on the list, exactly where it was before.
 */
export function slotApplies(
  condition: SlotCondition | undefined,
  answers: Readonly<Record<string, { valueJson?: unknown; value: string } | undefined>>
): boolean | undefined {
  if (condition === undefined) return true;
  const on = answers[condition.slug];
  if (on === undefined) return undefined;
  // Same reading as `truthy` in `chart/series.ts`, kept local so this module stays free of it: a
  // boolean `valueJson` if there is one, otherwise the prose the forms write.
  const value =
    typeof on.valueJson === 'boolean' ? on.valueJson : on.value === 'Yes' || on.value === 'true';
  return value === condition.equals;
}

export interface PhaseSlotOptions {
  /**
   * Whether Phase 0 marked fundraising a significant part of the role. When it did not, the
   * fundraising lane is dropped, exactly as the forms drop the card: the source says to include that
   * area only when it is relevant, and a coach shown the slot would ask about it regardless.
   */
  fundraisingRelevant?: boolean;
  /** The leader's own bucket labels, keyed by token (I7). */
  bucketLabels?: Record<string, string>;
}

/** Every slot this phase captures, in declaration order. Empty for a phase that captures none. */
export function phaseCaptureSlots(phaseKey: string, options: PhaseSlotOptions = {}): PhaseSlot[] {
  const groups = PHASE_SLOT_GROUPS[phaseKey] ?? [];
  if (groups.length === 0) return [];

  return (
    reclaimSlotDefinitions
      .filter((definition) => groups.includes(definition.group))
      // A group that is not coach-writable never reaches a conversation, whatever the map says.
      .filter((definition) => COACH_WRITABLE_GROUPS.includes(definition.group))
      // Nor does a reading with no surface to capture it. See `NO_SURFACE_CAPTURES_THESE`.
      .filter((definition) => !NO_SURFACE_CAPTURES_THESE.includes(definition.slug))
      .filter(
        (definition) => options.fundraisingRelevant === true || !isFundraisingLane(definition.slug)
      )
      .map((definition) => {
        const token = bucketTokenOf(definition.slug);
        const bucket = token === null ? undefined : BUCKET_BY_TOKEN.get(token);
        // A pairing is only real when both ends are on this phase's list. They always are today —
        // nothing here pairs across a phase boundary, and the test below holds that — but deriving it
        // rather than trusting it means a future pair that does cross one degrades to two separate
        // questions instead of pointing the coach at a slug it cannot see.
        const onThisPhase = (slug: string): boolean =>
          groups.includes(reclaimSlotDefinitions.find((d) => d.slug === slug)?.group ?? '') &&
          (options.fundraisingRelevant === true || !isFundraisingLane(slug));
        const followers = (ALL_PAIRS[definition.slug] ?? []).filter(onThisPhase);
        const anchor = PAIRED_TO.get(definition.slug);
        const condition = SLOT_CONDITIONS[definition.slug];
        return {
          slug: definition.slug,
          label: slotLabel(definition.slug, options.bucketLabels),
          dataType: definition.dataType ?? 'text',
          ...(bucket !== undefined ? { bucketSlug: bucket.slug } : {}),
          ...(followers.length > 0 ? { pairedWith: followers } : {}),
          ...(anchor !== undefined && onThisPhase(anchor) ? { pairedTo: anchor } : {}),
          ...(condition !== undefined ? { askOnlyIf: condition } : {}),
        };
      })
  );
}
