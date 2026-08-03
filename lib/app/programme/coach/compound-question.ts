/**
 * Whether a reading is being asked as half of a two-part question in this run, right now.
 *
 * ## What it is for
 *
 * The run-aware half of the guard `offer_choices` applies. That capability's other three checks are
 * answerable from static data — the reading exists, it has an answer set, it belongs to the section
 * the leader is on — but whether it is *one half of a question* depends on what this audit already
 * holds. `compoundQuestionSlugs` in `./phase-slots.ts` states the rule and the failure it closes: a
 * leader asked "with a team split between two locations, how does having a distributed team shape
 * your leadership?" and shown **Yes / No** underneath it.
 *
 * ## Why it is not in `phase-context.ts`, where the run is already read
 *
 * Because a capability cannot import it from there. `phase-context.ts` reads the coach's content
 * through `config.ts`, `config.ts` parses with the schema on `module.ts`, and `module.ts` declares
 * the coach's capabilities — so a capability reaching into any of them closes the cycle
 * `identity.ts` and `questioning.ts` were both split out to avoid. This file imports the run, the
 * slot list and the pairing setting, and none of those knows a capability exists.
 *
 * ## It fails open
 *
 * `false` when the run cannot be read for any reason. An offer is a convenience over a composer that
 * already works, and a guard that failed closed on a database hiccup would cost every leader their
 * buttons for the duration of it. The failure this exists to stop is a *wrong* offer, and a wrong
 * offer is visible and dismissible — the control names the reading it is for and sits beside a way to
 * type instead. A silently missing one is neither.
 */

import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { truthy } from '@/lib/app/programme/chart/series';
import { phaseCaptureSlots, compoundQuestionSlugs } from '@/lib/app/programme/coach/phase-slots';
import { readReclaimQuestioning } from '@/lib/app/programme/coach/questioning';

/** The reading whose answer decides whether the fundraising area is part of this leader's audit. */
const FUNDRAISING_RELEVANT = 'reclaim_setup_fundraising_relevant';

export async function asksInsideCompoundQuestion(input: {
  userId: string;
  runId: string;
  phaseKey: string;
  slotSlug: string;
}): Promise<boolean> {
  try {
    const [answers, questioning] = await Promise.all([
      readRunAnswers(input.userId, input.runId),
      readReclaimQuestioning(),
    ]);
    // No bucket labels: pairing is decided by slug and condition, and a leader's own names for the
    // nine areas (I7) change only what a reading is called.
    const slots = phaseCaptureSlots(input.phaseKey, {
      fundraisingRelevant: truthy(answers[FUNDRAISING_RELEVANT]),
    });
    return compoundQuestionSlugs(slots, answers, questioning.pairing === 'paired').has(
      input.slotSlug
    );
  } catch {
    return false;
  }
}
