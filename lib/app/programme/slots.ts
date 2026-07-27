/**
 * The 105 `reclaim-audit` slot definitions (F2 t-2).
 *
 * The canonical source is `.context/app/slot-spec.md` — **every slug is fixed there**;
 * this file must not invent, rename, or "improve" one. Downstream features read slots
 * by exact slug (F7 t-2 refers back to `reclaim_setup_keeping_me_up` / `reclaim_setup_why_now`;
 * F9 t-1 trends `reclaim_current_hours__*`), so a renamed slug silently breaks them.
 *
 * These are declared on the `ModuleDefinition` (`module.ts`) as `slotDefinitions` and
 * reconciled into `framework_slot_definition` at boot by `syncRegisteredSlotDefinitions()`,
 * each row's `scope` auto-stamped `module:reclaim-audit` (a module never names its own
 * scope — the collector stamps it so provenance can't be spoofed; that is why `scope` is
 * absent from `SlotDefinitionInput`).
 *
 * Two rules from the spec govern the whole set:
 *   - **Sensitivity is `standard` or `sensitive`, never `special_category`** (I5). At
 *     `special_category` the masking policy redacts the prose value, which would destroy
 *     the exact sentence F7 t-2 must quote back. `assertNoSpecialCategory` below fails the
 *     build if one ever slips in; a unit test pins it too.
 *   - **Per-bucket slots use the canonical `bucketSlug`** from `content-source.md` §1 with
 *     hyphens as underscores (the `token` below). Relabelling a bucket never changes the slug.
 *
 * `description` is required and is *prompt material* for the capture agent — not Rashmir's
 * diagnostic prose. Per-bucket descriptions are generated from the canonical bucket **title**
 * only; the full bucket definition is I11-guarded content that lives in `Module.config` (t-3),
 * never duplicated across 18 slot descriptions where it would drift.
 */

import type { SlotDefinitionInput } from '@/lib/framework/data-slots';

/**
 * The nine buckets in display order (`content-source.md` §1, `slot-spec.md`). `token` is the
 * canonical `bucketSlug` with hyphens as underscores; `title` is the short label used only to
 * generate per-bucket slot descriptions. `fundraising_capital` is conditional at *write* time
 * (`reclaim_setup_fundraising_relevant`), but every bucket is *declared* — declaration is not
 * capture.
 */
const BUCKETS = [
  { token: 'deep_work', title: 'Deep work' },
  { token: 'learning_development', title: 'Learning & development' },
  { token: 'strategic_planning', title: 'Strategic planning & review' },
  { token: 'team_development', title: 'Team development' },
  { token: 'organisational_oversight', title: 'Organisational oversight' },
  { token: 'fundraising_capital', title: 'Fundraising & capital' },
  { token: 'relationship_building', title: 'Relationship building' },
  { token: 'delivery_operations', title: 'Delivery & operations' },
  { token: 'recovery_white_space', title: 'Recovery & white space' },
] as const;

/** Generate one per-bucket slot for each of the nine buckets, given a slug prefix and per-bucket fields. */
function perBucket(
  make: (bucket: (typeof BUCKETS)[number]) => SlotDefinitionInput
): SlotDefinitionInput[] {
  return BUCKETS.map(make);
}

/**
 * Group `reclaim_profile` (6) — run-independent, the only agent-writable group (I6). Carries
 * across runs, so no `runId`.
 */
const profileSlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_profile_first_name',
    group: 'reclaim_profile',
    description: 'First name. Last name is not collected.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_profile_role',
    group: 'reclaim_profile',
    description: 'Their role: CEO, Founder, Programme Officer, Philanthropist, Director, or other.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_profile_org_type',
    group: 'reclaim_profile',
    description: 'Organisation type: nonprofit, startup, established business, or other.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_profile_direct_reports',
    group: 'reclaim_profile',
    description: 'Count of direct reports.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_profile_distributed_team',
    group: 'reclaim_profile',
    description: 'Whether their team is spread across locations, timezones, or countries.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_profile_distributed_impact',
    group: 'reclaim_profile',
    description: 'How that distribution affects the way they lead and communicate.',
    dataType: 'text',
    sensitivity: 'standard',
  },
];

/** Group `reclaim_setup` (9) — Phase 0, per run. */
const setupSlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_setup_in_transition',
    group: 'reclaim_setup',
    description:
      'Whether they are in a transition — restructure, leadership change, pivot, or rapid growth. Feeds the oversight exemption.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_setup_transition_detail',
    group: 'reclaim_setup',
    description: 'What the transition is.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_setup_fundraising_relevant',
    group: 'reclaim_setup',
    description:
      'Whether fundraising or capital raising is a significant part of their role. Gates whether the fundraising bucket appears at all.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_setup_fundraising_support',
    group: 'reclaim_setup',
    description:
      'Whether they have a development team or carry fundraising alone. Changes the benchmark.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_setup_weekly_hours',
    group: 'reclaim_setup',
    description: 'Current average weekly hours worked. Feeds the total-hours bands.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_setup_priorities',
    group: 'reclaim_setup',
    description: 'Their top three to five priorities for the rest of this year.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_setup_keeping_me_up',
    group: 'reclaim_setup',
    description:
      'What is currently keeping them up at night. Returned verbatim later, so never special_category.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_setup_why_now',
    group: 'reclaim_setup',
    description: 'What made them want to do this now.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_setup_audit_period',
    group: 'reclaim_setup',
    description: 'The period being audited: last week, last month, last quarter, or last year.',
    dataType: 'text',
    sensitivity: 'standard',
  },
];

/**
 * Group `reclaim_current` (21) — Phase 1, per run. Eighteen per-bucket (hours + detail × 9) plus
 * three deep-work specifics.
 */
const currentSlots: SlotDefinitionInput[] = [
  ...perBucket((b) => ({
    slug: `reclaim_current_hours__${b.token}`,
    group: 'reclaim_current',
    description: `Hours per week currently spent on ${b.title}.`,
    dataType: 'number',
    sensitivity: 'standard',
  })),
  ...perBucket((b) => ({
    slug: `reclaim_current_detail__${b.token}`,
    group: 'reclaim_current',
    description: `What time spent on ${b.title} actually looks like in practice.`,
    dataType: 'text',
    sensitivity: 'sensitive',
  })),
  {
    slug: 'reclaim_current_deep_block_exists',
    group: 'reclaim_current',
    description: 'Whether they have at least one protected 60–90 minute deep-work block per day.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_current_deep_block_when',
    group: 'reclaim_current',
    description: 'Where that block sits, and whether it falls in their peak window.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_current_deep_block_blocker',
    group: 'reclaim_current',
    description: 'If there is no protected block: what gets in the way.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/**
 * Group `reclaim_calendar` (21) — Phase 1 optional branch, per run. Nine per-bucket totals plus
 * twelve fixed structural metrics. No meeting titles are ever persisted — per-bucket totals only.
 */
const calendarSlots: SlotDefinitionInput[] = [
  ...perBucket((b) => ({
    slug: `reclaim_calendar_hours__${b.token}`,
    group: 'reclaim_calendar',
    description: `Calendar-derived hours per week on ${b.title}.`,
    dataType: 'number',
    sensitivity: 'standard',
  })),
  {
    slug: 'reclaim_calendar_uploaded',
    group: 'reclaim_calendar',
    description: 'Whether the calendar-analysis branch was taken.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_completeness',
    group: 'reclaim_calendar',
    description: 'How much their calendar reflects their actual working life.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_period',
    group: 'reclaim_calendar',
    description: 'The period the calendar analysis covered.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_total_hours',
    group: 'reclaim_calendar',
    description: 'Total calendar-visible hours.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_events_per_day',
    group: 'reclaim_calendar',
    description: 'Average events per day — a task-switching profile.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_switch_frequency',
    group: 'reclaim_calendar',
    description: 'How often they switch between fundamentally different types of work in a day.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_back_to_back',
    group: 'reclaim_calendar',
    description: 'Count of back-to-back meetings with no transition between them.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_longest_block',
    group: 'reclaim_calendar',
    description: 'Longest uninterrupted block in the calendar, in minutes.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_reactive_time',
    group: 'reclaim_calendar',
    description: 'Whether unscheduled time stays protected or gets consumed by reactive work.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_calendar_ambiguous_items',
    group: 'reclaim_calendar',
    description:
      "Generic-titled events flagged for the user to confirm, with the tool's best guess and reasoning.",
    dataType: 'json',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_calendar_offcal_work',
    group: 'reclaim_calendar',
    description: 'What fills the hours that never reach the calendar.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_calendar_messaging_load',
    group: 'reclaim_calendar',
    description: 'Email and Slack load that never hits the calendar.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/**
 * Group `reclaim_composite` (10) — Phase 1 reconciliation, per run. Written only when a calendar
 * was uploaded; it is the reconciled picture (calendar plus off-calendar work) that I-composite
 * requires — a third home distinct from `reclaim_current_*` (the estimate) and `reclaim_calendar_*`
 * (the calendar), so the perception-vs-reality chart can plot both at once.
 */
const compositeSlots: SlotDefinitionInput[] = [
  ...perBucket((b) => ({
    slug: `reclaim_composite_hours__${b.token}`,
    group: 'reclaim_composite',
    description: `Reconciled hours per week on ${b.title} — calendar hours plus off-calendar work.`,
    dataType: 'number',
    sensitivity: 'standard',
  })),
  {
    slug: 'reclaim_composite_variance_note',
    group: 'reclaim_composite',
    description:
      'Per-bucket record of where the original estimate differed significantly from calendar reality — the note the chart carries.',
    dataType: 'json',
    sensitivity: 'standard',
  },
];

/** Group `reclaim_energy` (3) — Phase 2, per run. */
const energySlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_energy_peak_windows',
    group: 'reclaim_energy',
    description: 'Selected peak-energy windows from the week grid.',
    dataType: 'json',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_energy_peak_description',
    group: 'reclaim_energy',
    description: 'When they are at their best, in their own words.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_energy_protected',
    group: 'reclaim_energy',
    description: 'Whether the schedule protects or consumes that peak window.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/**
 * Group `reclaim_ideal` (12) — Phase 3, per run. Nine per-bucket targets plus three fixed slots.
 */
const idealSlots: SlotDefinitionInput[] = [
  ...perBucket((b) => ({
    slug: `reclaim_ideal_hours__${b.token}`,
    group: 'reclaim_ideal',
    description: `Target hours per week on ${b.title} in a sustainable week.`,
    dataType: 'number',
    sensitivity: 'standard',
  })),
  {
    slug: 'reclaim_ideal_total_hours',
    group: 'reclaim_ideal',
    description: 'Sustainable weekly total they are aiming for.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_ideal_deep_block_when',
    group: 'reclaim_ideal',
    description: 'Where the daily deep-work block would sit in an ideal week.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_ideal_protected_commitment',
    group: 'reclaim_ideal',
    description: 'The one commitment that would make the biggest difference.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/** Group `reclaim_gap` (6) — Phase 4, per run. */
const gapSlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_gap_summary',
    group: 'reclaim_gap',
    description: 'Per-bucket deltas between current and ideal, computed.',
    dataType: 'json',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_gap_hours_to_remove',
    group: 'reclaim_gap',
    description: 'Total hours that need to come out, if any.',
    dataType: 'number',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_gap_unfunded_priorities',
    group: 'reclaim_gap',
    description: 'Stated priorities that currently have no protected time.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_gap_challenge_offered',
    group: 'reclaim_gap',
    description:
      'Whether the permission-based challenge has been offered. Once per audit, no more.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_gap_challenge_response',
    group: 'reclaim_gap',
    description: 'Their response to the challenge.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_gap_strategy_mirror',
    group: 'reclaim_gap',
    description:
      'Their answer to: if a stranger read your calendar, what would they say your priorities are?',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/** Group `reclaim_action` (6) — Phase 5, per run. */
const actionSlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_action_options',
    group: 'reclaim_action',
    description: 'The three entry points offered.',
    dataType: 'json',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_action_chosen',
    group: 'reclaim_action',
    description: 'What they have decided to do.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_action_when',
    group: 'reclaim_action',
    description: 'When they will start.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_action_stopping',
    group: 'reclaim_action',
    description: 'What they will say no to or stop doing.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_action_how_known',
    group: 'reclaim_action',
    description: 'How they will know it worked.',
    dataType: 'text',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_action_wanted_not_dutiful',
    group: 'reclaim_action',
    description: 'Whether this is something they want to do, or think they should.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/**
 * Group `reclaim_reflection` (5) — the required pauses, per run. The enforcement point for the
 * unskippable reflection: the phase-transition route returns 422 REFLECTION_REQUIRED when the slot
 * for the phase being left is absent. There is deliberately no `p0` — Phase 0 is a form, not a reveal.
 */
const reflectionSlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_reflection_p1',
    group: 'reclaim_reflection',
    description: 'Reflection after the Phase 1 visual: what stands out to them here.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_reflection_p2',
    group: 'reclaim_reflection',
    description: 'Reflection after the Phase 2 energy mapping.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_reflection_p3',
    group: 'reclaim_reflection',
    description: 'Reflection after the Phase 3 ideal week.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_reflection_p4',
    group: 'reclaim_reflection',
    description: 'Reflection after the Phase 4 gap analysis: what they are noticing.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_reflection_p5',
    group: 'reclaim_reflection',
    description: 'Reflection after the Phase 5 action plan: what they are taking away from this.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    /**
     * The takeaway, asked before the summary is produced.
     *
     * The source is specific about the order: ask "what are you taking away from this?" **before**
     * producing the final summary, "one final moment of reflection before the written output". Until
     * now the product asked something very like it *after* the artifact, and only of the subset of
     * leaders who chose to share their results — so most people were never asked at all, and the
     * answer landed in a table about sharing rather than in the audit.
     *
     * A reflection rather than a share field, which puts it in the group the coach may never write
     * (I6): the coach asks and may offer words back, the leader saves. Deliberately **not** returned
     * by `reflectionSlugForLeaving` — this phase is the end of the audit, and gating the finish
     * button on a reflection would be a new refusal nobody asked for. It gates the summary appearing,
     * which is the beat the source actually describes.
     */
    slug: 'reclaim_reflection_p6',
    group: 'reclaim_reflection',
    description:
      'The takeaway, asked before the Phase 6 summary is produced: what they are taking away from the audit.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
];

/**
 * Group `reclaim_share` (6) — Phase 6, per run. All optional; appear only if the user chooses to
 * share, framed as contributing to the aggregate picture. Every one carries a "prefer not to say".
 */
const shareSlots: SlotDefinitionInput[] = [
  {
    slug: 'reclaim_share_with_coach',
    group: 'reclaim_share',
    description: 'Whether they chose to share their results with the coach.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
  {
    slug: 'reclaim_share_age_band',
    group: 'reclaim_share',
    description: 'Broad age band, optional.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_share_demographic_1',
    group: 'reclaim_share',
    description: 'First optional demographic question.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_share_demographic_2',
    group: 'reclaim_share',
    description: 'Second optional demographic question.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_share_takeaway',
    group: 'reclaim_share',
    description: 'In a sentence: what they took from this.',
    dataType: 'text',
    sensitivity: 'sensitive',
  },
  {
    slug: 'reclaim_share_quotable',
    group: 'reclaim_share',
    description: 'Whether they are happy for their takeaway to be quoted anonymously.',
    dataType: 'boolean',
    sensitivity: 'standard',
  },
];

/**
 * All 105 slot definitions, in group order. Assembled from the per-group arrays above; the
 * per-bucket groups are generated from `BUCKETS` so the nine tokens can never drift apart.
 */
export const reclaimSlotDefinitions: SlotDefinitionInput[] = [
  ...profileSlots,
  ...setupSlots,
  ...currentSlots,
  ...calendarSlots,
  ...compositeSlots,
  ...energySlots,
  ...idealSlots,
  ...gapSlots,
  ...actionSlots,
  ...reflectionSlots,
  ...shareSlots,
];

/**
 * I5 guard: no slot may be `special_category` — at that class the masking policy redacts the prose
 * value, destroying the verbatim sentences F7 depends on. Fails the module load (and a unit test)
 * if one ever slips in.
 */
export function assertNoSpecialCategory(slots: readonly SlotDefinitionInput[]): void {
  const offenders = slots.filter((s) => s.sensitivity === 'special_category');
  if (offenders.length > 0) {
    throw new Error(
      `reclaim-audit slots must never be special_category (I5): ${offenders.map((s) => s.slug).join(', ')}`
    );
  }
}

assertNoSpecialCategory(reclaimSlotDefinitions);
