/**
 * The answers a fabricated preview audit carries, phase by phase (F19). Pure — no Prisma, no service.
 *
 * ## Why this is per phase and not one flat list
 *
 * The fabricator used to write every answer it had at the moment the run was created, then walk the
 * journey. That produced states no leader can reach: a run sitting at phase 2 already held its action
 * plan, so an operator who opened phase 5 to check the layout found it filled in by a leader who has
 * not been asked yet. It also made the phase target meaningless as a preview — every stopping point
 * looked the same underneath.
 *
 * So the fixture is indexed by phase, the fabricator writes phase N's answers as it arrives at phase N,
 * and a run stopped at phase N holds exactly what a leader who had reached phase N would hold.
 *
 * ## What is deliberately left blank
 *
 * Three declared slots have **no writer anywhere in the product**: `reclaim_gap_summary` and
 * `reclaim_gap_hours_to_remove` (the panels compute the gap at render time and never persist it) and
 * `reclaim_energy_peak_windows` (the phase-2 panel writes the two prose slots beside it and not the
 * grid). Filling them here would invent a state no audit produces, which is the one thing a preview
 * account must never do: the whole value of walking one is that what the operator sees is what a
 * leader would see. If a writer for any of them ever ships, this fixture should follow it, not lead.
 *
 * The nine `reclaim_calendar_*` and ten `reclaim_composite_*` slots are blank for a different reason:
 * the calendar upload is an optional branch, and a fabricator that always took it could never show the
 * path a leader who declines it walks. The composite chart is therefore empty on a preview account,
 * and the Preview screen says so rather than leaving it to read as a fault.
 *
 * The six `reclaim_share_*` slots have no writer either — the sharing flow writes `ReclaimShare`,
 * `ReclaimReportShare` and `ReclaimFeedback` rows, not slots — and nothing here presses share on a
 * leader's behalf, so the phase-6 panel opens with the sharing choices untouched, which is the state
 * the operator asked to look at.
 *
 * ## The prose rules
 *
 * This is the leader's own voice rather than the coach's, but it is read on the same screens and it
 * sits in the transcript directly above coach turns, so it is held to I2 all the same: no U+2014
 * anywhere, and none of `RECLAIM_BANNED_LEXICON`. `tests/unit/invariants/product-voice.test.ts` lists
 * this file for that reason.
 *
 * The content is one coherent person throughout — a chief executive of a forty-person social
 * enterprise, badly overweighted to delivery, with a funding bid that has no time against it. That
 * coherence is the point: an operator judging whether a screen reads well cannot do it against answers
 * that contradict each other two phases apart.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';

/** One canned answer, in the shape the run service's `RunAnswerInput` takes. */
export interface PreviewAnswer {
  slotSlug: string;
  value: string;
  /** Typed form for `number` / `boolean` / `json` slots. Omitted means prose only. */
  valueJson?: unknown;
}

/**
 * The hours the fabricated week reports, by bucket token.
 *
 * Chosen to produce a chart worth looking at — a clear overspend on delivery, a clear underspend on
 * deep work, and a couple of areas roughly where the leader wanted them — rather than a flat line that
 * would render correctly and show nothing. They sum to 52, which is what `reclaim_setup_weekly_hours`
 * says, because a leader whose areas do not add up to their own stated week is a leader no screen can
 * be judged against.
 */
export const CURRENT_HOURS: Record<string, number> = {
  deep_work: 4,
  learning_development: 1,
  strategic_planning: 3,
  team_development: 6,
  organisational_oversight: 9,
  relationship_building: 5,
  delivery_operations: 22,
  recovery_white_space: 2,
};

export const IDEAL_HOURS: Record<string, number> = {
  deep_work: 12,
  learning_development: 3,
  strategic_planning: 7,
  team_development: 8,
  organisational_oversight: 6,
  relationship_building: 6,
  delivery_operations: 10,
  recovery_white_space: 5,
};

/**
 * What each area actually looks like in this leader's week.
 *
 * Keyed by bucket token so a relabelled bucket keeps its detail (I7 — the slug never changes, the
 * label may). An area with no entry here simply gets no detail slot written, which is a state a real
 * leader reaches by leaving the box empty.
 */
const CURRENT_DETAIL: Record<string, string> = {
  deep_work:
    'Whatever survives the day. Usually an hour late on a Friday, when I am too tired to use it well.',
  learning_development:
    'A podcast in the car, and the sector report that has been open on my desk since March.',
  strategic_planning:
    'The board pack, mostly. Written the weekend before it is due, which is not the same as thinking.',
  team_development:
    'Six one to ones, and most of them turn into me solving the thing they brought me.',
  organisational_oversight:
    'Finance, the funder reports, and the compliance sign-offs nobody else is allowed to do.',
  relationship_building:
    'Two or three funder coffees a month, and the partnership calls that keep referrals coming in.',
  delivery_operations:
    'Sitting in on delivery because I know the history, and the history keeps turning out to be needed.',
  recovery_white_space: 'The walk from the car park. That is honestly most of it.',
};

/** The reflection a leader leaves at the close of each phase. `p6` is the takeaway, asked in phase 6. */
const REFLECTIONS: Record<number, string> = {
  1: 'Twenty two hours on delivery, written down, is not a number I would have guessed.',
  2: 'The best hours of my week are the ones I hand over first.',
  3: 'Writing the week I want took longer than writing the week I have.',
  4: 'The gap itself is not a surprise. Seeing the size of it as a number is.',
  5: 'Two mornings sounds small next to the size of it, and it is still two mornings.',
  6: 'That two mornings a week is a decision, not a wish.',
};

/** Phase 0 — who they are and what this audit is of. */
function phase0(): PreviewAnswer[] {
  return [
    { slotSlug: 'reclaim_profile_first_name', value: 'Sam' },
    { slotSlug: 'reclaim_profile_role', value: 'Chief Executive' },
    { slotSlug: 'reclaim_profile_org_type', value: 'A social enterprise of about forty people' },
    { slotSlug: 'reclaim_profile_direct_reports', value: '6', valueJson: 6 },
    { slotSlug: 'reclaim_profile_distributed_team', value: 'Yes', valueJson: true },
    {
      slotSlug: 'reclaim_profile_distributed_impact',
      value:
        'Two of the six are in other time zones, so anything needing all of us lands in one narrow window on a Tuesday.',
    },
    { slotSlug: 'reclaim_setup_in_transition', value: 'Yes', valueJson: true },
    {
      slotSlug: 'reclaim_setup_transition_detail',
      value: 'A restructure in April that put two teams under one director for the first time.',
    },
    // Explicitly false rather than absent. `truthy()` reads an absent slot as false either way, but a
    // leader's Phase 0 form always answers this, and the fundraising bucket's presence in every chart
    // downstream turns on it — so the fixture should state it rather than rely on the default.
    // `reclaim_setup_fundraising_support` stays unwritten because it is only ever asked of a leader
    // who said yes here.
    { slotSlug: 'reclaim_setup_fundraising_relevant', value: 'No', valueJson: false },
    { slotSlug: 'reclaim_setup_weekly_hours', value: '52', valueJson: 52 },
    {
      slotSlug: 'reclaim_setup_priorities',
      value: 'Get the new programme funded and off the ground',
    },
    // I13's refer-back quotes these two back at the leader, verbatim, in phase 4. They were blank on
    // every fabricated audit until now, so the one beat the refer-back exists for had nothing to say.
    {
      slotSlug: 'reclaim_setup_keeping_me_up',
      value:
        'Whether the funding bid gets written at all, and what happens to the team in the spring if it does not.',
    },
    {
      slotSlug: 'reclaim_setup_why_now',
      value:
        'Three quarters of saying the same thing about my own diary and changing nothing about it.',
    },
    { slotSlug: 'reclaim_setup_audit_period', value: 'last quarter' },
  ];
}

/** Phase 1 — the week they have now, area by area. */
function phase1(): PreviewAnswer[] {
  const answers: PreviewAnswer[] = [];

  for (const bucket of RECLAIM_BUCKETS.filter((b) => !b.conditional)) {
    const token = bucketToken(bucket.slug);
    const hours = CURRENT_HOURS[token] ?? 0;
    answers.push({
      slotSlug: `reclaim_current_hours__${token}`,
      value: String(hours),
      valueJson: hours,
    });
    const detail = CURRENT_DETAIL[token];
    if (detail !== undefined) {
      answers.push({ slotSlug: `reclaim_current_detail__${token}`, value: detail });
    }
  }

  answers.push(
    // No protected block, and a reason. `reclaim_current_deep_block_when` stays unwritten on purpose:
    // the panel only asks where the block sits once the leader says there is one, so writing both
    // would be a leader who has no deep-work block and also knows when it is.
    { slotSlug: 'reclaim_current_deep_block_exists', value: 'No', valueJson: false },
    {
      slotSlug: 'reclaim_current_deep_block_blocker',
      value: 'The first meeting is at nine, and the inbox is already loud by the time I open it.',
    }
  );

  return answers;
}

/** Phase 2 — when they are at their best, and what happens to that time. */
function phase2(): PreviewAnswer[] {
  return [
    {
      slotSlug: 'reclaim_energy_peak_description',
      value:
        'Early. Between seven and half past ten I can hold a whole problem in my head at once.',
    },
    {
      slotSlug: 'reclaim_energy_protected',
      value:
        'It goes first. The standing meetings went in the morning because that is when everyone is free.',
    },
  ];
}

/** Phase 3 — the week they would design. */
function phase3(): PreviewAnswer[] {
  const answers: PreviewAnswer[] = RECLAIM_BUCKETS.filter((b) => !b.conditional).map((bucket) => {
    const token = bucketToken(bucket.slug);
    const hours = IDEAL_HOURS[token] ?? 0;
    return {
      slotSlug: `reclaim_ideal_hours__${token}`,
      value: String(hours),
      valueJson: hours,
    };
  });

  const total = Object.values(IDEAL_HOURS).reduce((sum, hours) => sum + hours, 0);
  answers.push(
    // Derived rather than typed out, so the total and the areas cannot drift apart the day somebody
    // adjusts one bucket. A leader whose stated total disagrees with their own areas is exactly the
    // inconsistency a preview account exists to catch, not to contain.
    { slotSlug: 'reclaim_ideal_total_hours', value: String(total), valueJson: total },
    {
      slotSlug: 'reclaim_ideal_deep_block_when',
      value: 'First thing, before anything else is allowed to be booked.',
    },
    {
      slotSlug: 'reclaim_ideal_protected_commitment',
      value: 'Two mornings a week that belong to the bid and nothing else.',
    }
  );

  return answers;
}

/** Phase 4 — the gap, and what the leader made of being shown it. */
function phase4(): PreviewAnswer[] {
  return [
    {
      slotSlug: 'reclaim_gap_unfunded_priorities',
      value:
        'The funding bid, which is the priority for the year and has no time against it at all.',
    },
    { slotSlug: 'reclaim_gap_challenge_offered', value: 'Yes', valueJson: true },
    {
      slotSlug: 'reclaim_gap_challenge_response',
      value: 'Fair. Nobody put those meetings in the diary except me.',
    },
    {
      slotSlug: 'reclaim_gap_strategy_mirror',
      value:
        'They would say my priority is keeping delivery moving, and they would be reading it correctly.',
    },
  ];
}

/** Phase 5 — what they decided to do. */
function phase5(): PreviewAnswer[] {
  return [
    {
      // Written by the coach's own `record_answers` call in a real run, which is why it carries the
      // three options rather than only the chosen one: `analyst/brief.ts` reads this list into the
      // summary, and a fabricated audit missing it loses that section of the artifact.
      slotSlug: 'reclaim_action_options',
      value:
        'Two protected mornings a week; hand over the Thursday delivery stand-up; a standing monthly look at where the week went',
      valueJson: [
        'Two protected mornings a week for the funding bid',
        'The Thursday delivery stand-up handed to the delivery lead',
        'A standing monthly look at where the week actually went',
      ],
    },
    {
      slotSlug: 'reclaim_action_chosen',
      value: 'Two protected mornings a week for the funding bid',
    },
    { slotSlug: 'reclaim_action_when', value: 'From next Monday' },
    {
      slotSlug: 'reclaim_action_stopping',
      value: 'The Thursday delivery stand-up, which the delivery lead can run without me.',
    },
    {
      slotSlug: 'reclaim_action_how_known',
      value: 'The bid has a first full draft by the end of the month.',
    },
    {
      slotSlug: 'reclaim_action_wanted_not_dutiful',
      value: 'Wanted. Writing the bid is the part of this job I came here to do.',
    },
  ];
}

/** Phase 6 carries no answers of its own beyond the takeaway, which the reflection below supplies. */
function phase6(): PreviewAnswer[] {
  return [];
}

const BY_PHASE: Record<number, () => PreviewAnswer[]> = {
  0: phase0,
  1: phase1,
  2: phase2,
  3: phase3,
  4: phase4,
  5: phase5,
  6: phase6,
};

/**
 * Everything a leader arriving at `phaseIndex` would have written by the time they leave it — the
 * phase's own answers plus its closing reflection.
 *
 * The reflection is bundled here rather than kept apart because it belongs to the phase being left:
 * the route refuses a transition out of phases 1 to 5 without one (I9), and phase 6's is the takeaway
 * the close asks for before the summary is produced. Phase 0 has none, and that is not an oversight —
 * it is a form, not a reveal.
 *
 * Returns an empty array for an index outside 0 to 6 rather than throwing. The caller has already
 * validated the phase key against the map; a second refusal here would only turn a caller's bug into a
 * failure two frames from where it started.
 */
export function previewAnswersForPhase(phaseIndex: number): PreviewAnswer[] {
  const build = BY_PHASE[phaseIndex];
  if (build === undefined) return [];

  const answers = build();
  const reflection = REFLECTIONS[phaseIndex];
  if (reflection !== undefined) {
    answers.push({ slotSlug: `reclaim_reflection_p${phaseIndex}`, value: reflection });
  }
  return answers;
}
