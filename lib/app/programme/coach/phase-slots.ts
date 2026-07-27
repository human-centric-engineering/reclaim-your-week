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
}

/**
 * Leader-facing labels for the slots that are not one of the nine per-area lanes.
 *
 * Lifted from the wording the form panels already use rather than newly authored, shortened from a
 * question to a noun phrase because the panel is a list of what was heard, not a list of questions.
 * A slug with no entry falls back to its own words, which is legible but plain, so a new slot shows
 * up looking unfinished rather than silently missing.
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
  reclaim_gap_challenge_offered: 'The invitation to lead differently',
  reclaim_gap_challenge_response: 'What you made of it',
  reclaim_gap_strategy_mirror: 'What it would take to let go',
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
      .filter(
        (definition) => options.fundraisingRelevant === true || !isFundraisingLane(definition.slug)
      )
      .map((definition) => {
        const token = bucketTokenOf(definition.slug);
        const bucket = token === null ? undefined : BUCKET_BY_TOKEN.get(token);
        return {
          slug: definition.slug,
          label: slotLabel(definition.slug, options.bucketLabels),
          dataType: definition.dataType ?? 'text',
          ...(bucket !== undefined ? { bucketSlug: bucket.slug } : {}),
        };
      })
  );
}
