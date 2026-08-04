/**
 * What the coach is told about the phase it is in, every turn.
 *
 * A conversation that captures an audit needs three things a static system prompt cannot carry: which
 * phase the leader is on, which readings this phase is for, and which of them this run already has.
 * Without the third the coach asks again for what the leader has just said; without the second it
 * asks for everything at once, which is the failure the forms were built to avoid and the reason the
 * source's pacing instruction ("one or two at a time, do not list all nine at once") was retired.
 *
 * **Why this is run-scoped, and why that matters more than it looks.** The framework's own module
 * context injects the user's current slot *heads* (`loadModuleContext`), which are cross-run by
 * definition: on a second audit, the heads still hold audit one's answers for anything audit two has
 * not reached. A coach reading only that would open the second audit believing it already knew the
 * leader's hours. This block is read through `readRunAnswers`, so it reports *this* run, and it says
 * plainly that anything absent from its list has not been captured in this audit yet.
 *
 * **It names the refusals rather than letting the coach discover them.** A typed slot refuses prose;
 * sharing consent refuses the coach entirely; a reflection is permitted only for the phase in scope
 * and only when the leader has actually said it (I6). Each of those is a wasted turn if the coach
 * learns it from an error, so the block states them up front.
 */

import { prisma } from '@/lib/db/client';
import { readRunAnswers, type RunAnswer } from '@/lib/app/programme/runs/answers';
import { readBucketLabels } from '@/lib/app/programme/buckets/labels';
import { loadPhaseProgress } from '@/lib/app/programme/runs/journey';
import { hasCompletedAudit } from '@/lib/app/programme/compare';
import {
  phaseCaptureSlots,
  slotApplies,
  compoundQuestionSlugs,
  type PhaseSlot,
} from '@/lib/app/programme/coach/phase-slots';
import { phaseCoverage } from '@/lib/app/programme/coach/coverage';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';
import {
  phaseNumber,
  reflectionSlugForLeaving,
  FINAL_PHASE_KEY,
} from '@/lib/app/programme/runs/phases';
import {
  truthy,
  bucketHours,
  buildChartData,
  type Answers,
} from '@/lib/app/programme/chart/series';
import {
  CHART_REVEAL_PHASE,
  chartRevealReady,
  chartRevealed,
  everyVisibleAreaHasHours,
} from '@/lib/app/programme/chart/reveal';
import {
  readReclaimCoachContent,
  readReclaimSignposts,
  type ReclaimCoachContent,
} from '@/lib/app/programme/config';
import { readReclaimQuestioning } from '@/lib/app/programme/coach/questioning';
import { signpostFor, type PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import {
  presentAnswer,
  DEFAULT_PRESENTATION,
  type PresentationPolicy,
} from '@/lib/app/programme/slots/present';
import { arrivalMomentFor } from '@/lib/app/programme/coach/opening';
import { readIdealWeek, challengeEvidence } from '@/lib/app/programme/coach/ideal-week';
import { readCalendarReading, calendarReadingLines } from '@/lib/app/programme/calendar/reading';
import { answerFlag, answerFlagNote } from '@/lib/app/programme/coach/answer-quality';
import { choicesFor, hasChoices } from '@/lib/app/programme/coach/slot-choices';

import {
  RECLAIM_UNDER_DELEGATION_INVITATION,
  RECLAIM_CALENDAR_OFFER,
  RECLAIM_IDEAL_WEEK_FRAMING,
  RECLAIM_IDEAL_WEEK_CHALLENGE,
  RECLAIM_HOURS_55_NOTE,
  RECLAIM_PERMISSION_CHALLENGE,
  RECLAIM_STRATEGY_MIRROR,
  RECLAIM_ACTION_SPECIFICITY,
  RECLAIM_WANTED_NOT_DUTIFUL,
  RECLAIM_JOURNEY_FRAMING,
  RECLAIM_FORWARD_CLOSE,
  RECLAIM_BUCKETS,
  bucketToken,
} from '@/lib/app/programme/content';

/**
 * A run's answers with everything the reading carries, including the leader's own sentence.
 *
 * `Answers` (from `chart/series.ts`) is the narrower shape the arithmetic needs and is structurally a
 * subset of this, so anything typed against it accepts one of these unchanged. Where a block quotes a
 * reading back rather than counting it, it wants this one.
 */
type RunAnswers = Record<string, RunAnswer>;

/** The slug whose answer decides whether the fundraising area is part of this leader's audit. */
const FUNDRAISING_RELEVANT = 'reclaim_setup_fundraising_relevant';

/** The canonical bucket slug of the area whose inclusion is conditional (source §1). */
const FUNDRAISING_BUCKET = 'fundraising-capital';

/**
 * Rashmir's own words for the phase the leader is on, as the operator currently has them.
 *
 * **This is the supply the system prompt already promised.** The instructions say the governing frame
 * and the areas of leadership time "are supplied to you in context", and I11 is why they are not
 * restated in the authored prose. Nothing supplied them: the framework's module context carries the
 * module's name, description and slot values, and `Module.config` has never reached a prompt. While the
 * phases were forms it did not show, because the panels read the config directly. A coach asked to run
 * a nine-area audit conversationally without the nine areas would invent them, which is precisely the
 * drift the content chain exists to prevent.
 *
 * Phase-appropriate rather than everything every turn: the frame governs the whole audit, the areas
 * belong where areas are discussed, and the gap phase gets the invitation it is supposed to offer.
 */
function contentForPhase(
  phaseKey: string,
  content: ReclaimCoachContent,
  fundraisingRelevant: boolean
): string[] {
  const parts = [
    'The governing frame. This is the authority on how to read everything the leader says. Treat it as',
    'given, do not restate it in your own words, and never let the audit become a review of efficiency:',
    content.governingFrame,
  ];

  if (phaseKey === 'phase-1-current' || phaseKey === 'phase-3-ideal') {
    const buckets = content.buckets.filter(
      (bucket) => fundraisingRelevant || bucket.slug !== FUNDRAISING_BUCKET
    );
    parts.push(
      '',
      'The areas of leadership time, in this order, with the benchmark for each. The wording is the',
      "tool's own and is confidential: use it to recognise what the leader describes, never quote it at",
      'them and never present the framework itself:'
    );
    for (const bucket of buckets) {
      parts.push(`- ${bucket.title} (${bucket.benchmark.note}): ${bucket.description}`);
    }
    if (phaseKey === 'phase-1-current') {
      parts.push(
        '',
        'On deep work, which cuts across the others:',
        content.deepWorkNote,
        '',
        // The source is exact about the shape of this phase, and it is two questions per area asked
        // together, not a sweep for figures followed by a sweep for detail: "explore each bucket in
        // turn, one at a time, conversationally. For each bucket ask: roughly how many hours per
        // week …? What does that time actually look like in practice?"
        // (`sources/Time_Audit_Tool_Prompt_Text.md:119-122`). Asked as two lists, the second list
        // never happened: the coach took the eight figures, which are concrete and typed, and left
        // all eight "in practice" readings empty. An audit of eight numbers and no texture is the
        // survey this tool exists not to be.
        // The order used to be an instruction ("take them one at a time, in this order"), and it was
        // the wrong half of the source to make binding. The source's own emphasis is on exploring
        // each area properly, "one at a time, conversationally" — a rule about depth per area, not
        // about sequence. Read as a running order it produced a coach that finished its current area
        // no matter what the leader had just opened up, so a leader who answered the deep-work
        // question by describing the board meetings that eat their Tuesdays got "thanks, and back to
        // deep work". Following them there instead costs nothing: the list below says what is still
        // outstanding, so the coach cannot lose its place by going where the conversation went.
        'How to explore an area. Give each one a proper turn rather than skimming the nine, and',
        'ask two things in the same breath: roughly how many hours a week go here, and',
        'what that time actually looks like in practice. The second is not optional and it is not a follow-up for later. It is where the',
        'audit stops being a set of numbers: a figure tells you they spend fifteen hours on',
        'relationships; what that time looks like tells you whether it is board management, a team',
        'that needs them, or a habit nobody has questioned, and every phase after this one reads',
        'better for having it.',
        'Record both together: reclaim_current_hours__<area> with the figure in valueJson, and',
        'reclaim_current_detail__<area> in their own words. If they give you only the number, ask what',
        'it looks like before moving to the next area. If they describe it richly without landing on a',
        'figure, offer one back and let them agree it. Do not move through all the areas for figures',
        'and then come back for the detail.'
      );
    }
    if (phaseKey === 'phase-3-ideal') {
      parts.push(
        '',
        // Phase 3 had the areas and nothing else: no method, no order, no reason the four questions
        // are four. A coach given a list of `reclaim_ideal_*` slugs and told to work through them
        // asks a leader to allocate hours across nine categories, which is a spreadsheet with a
        // friendly voice and precisely the thing this phase is supposed not to be.
        'How to design the week. This is a target they could actually live, built from what the last',
        'two phases just told you, and the framing matters more than the arithmetic:',
        RECLAIM_IDEAL_WEEK_FRAMING,
        '',
        'Four questions, in this order, and each of them opens the next. What would a sustainable',
        'weekly total look like for them, recorded as reclaim_ideal_total_hours with the figure. How',
        'would they want that time spread across the areas, recorded per area as',
        'reclaim_ideal_hours__<area>. Where the deep-work block would sit, and when, given their',
        'energy and how their team is spread, as reclaim_ideal_deep_block_when. And the one protected',
        'commitment that would make the biggest difference, as reclaim_ideal_protected_commitment.',
        'Take the spread area by area rather than asking for nine figures at once, and offer a figure',
        'back where they are thinking aloud rather than making them produce one.',
        '',
        'The last of the four is the one that matters most and the one most easily skipped. A whole',
        'redesigned week is a wish; one protected commitment is something they can start on Monday.',
        'Do not let it arrive as an afterthought at the end of a long allocation.'
      );
    }
  }

  if (phaseKey === 'phase-2-energy') {
    parts.push(
      '',
      // The source opens this phase with the science, and the product has already moved that onto
      // the signpost card the leader reads before anyone speaks. `cardLinesFor` then tells the coach
      // not to restate a card. So the block has to say the framing is done, or the coach opens by
      // explaining chronotypes to someone who has just read about them.
      'How this phase works. The leader has already read why when they work matters as much as how',
      'much, so do not explain it again. Two questions, asked together and not as a sweep: when in',
      'the day or the week are they at their best, most focused and most themselves, and does their',
      'current week protect that window or spend it. Record them as reclaim_energy_peak_description',
      'and reclaim_energy_protected.',
      '',
      // This is the phase's whole reason for existing and it was absent. Authored leaf prose rather
      // than a constant: the source's sentence here is written to the facilitator, not the leader,
      // and I11 governs Rashmir's words, not instructions about what to do with them.
      'Then reflect back what you heard, and name the opportunity plainly. If their best hours are',
      'going on meetings, email or operational work, say so clearly: that is one of the most',
      'significant opportunities available to them, and it is the single most useful thing this phase',
      'can give them. Name it as possibility and never as a failure of organisation. Do not soften it',
      'into a general observation about energy, and do not leave them to notice it themselves.',
      '',
      'Where their team is spread across places, hours or countries, work out with them what',
      'protecting that window could actually look like given that, rather than offering a rule that',
      'assumes everyone is in one timezone. Record what they say about it as',
      'reclaim_profile_distributed_impact, which carries across audits and is not on the list below.'
    );
  }

  if (phaseKey === 'phase-5-action') {
    parts.push(
      '',
      // The phase with an opening moment the client fires automatically, and until now nothing behind
      // it: the coach was told to "open it the way your context describes" by a context that
      // described nothing.
      'How this phase works. Not one plan, and not advice. Offer three options for where to start,',
      'each a genuinely different way in rather than three versions of the same idea, and each with',
      'one sentence on the difference it would likely make. Then let them choose, or say none of',
      'these and name their own. Record all three as reclaim_action_options in valueJson, as a list',
      'of three objects with a title and an impact, so the summary can show what was on the table.',
      '',
      'Every option has to pass one test, and this is the calibration:',
      RECLAIM_ACTION_SPECIFICITY,
      'An option they could act on this week without deciding anything else first is specific. An',
      'option that names an intention is not, however good the intention is.',
      '',
      'Once they have chosen, ask them to say it themselves rather than summarising it for them:',
      'what they will do (reclaim_action_chosen), when they will start (reclaim_action_when), and',
      'what they will stop or say no to in order to make the room (reclaim_action_stopping). Saying',
      'it out loud is the commitment, so let them say it and give it back in their own words.',
      '',
      'Then two more, and they are the ones that decide whether this survives a hard week. How will',
      'they know it worked, as reclaim_action_how_known. And this, which is asked plainly and never',
      'rhetorically:',
      RECLAIM_WANTED_NOT_DUTIFUL,
      'Record the answer as reclaim_action_wanted_not_dutiful. If it turns out to be something they',
      'think they should do, that is worth knowing and worth saying, and it is better found now than',
      'in three weeks. Go back to the options with them rather than talking them into the one they',
      'have chosen.',
      '',
      'Close on the shape of this, not on effort. It is a journey and not a makeover:',
      RECLAIM_JOURNEY_FRAMING,
      'And leave them facing forward:',
      RECLAIM_FORWARD_CLOSE
    );
  }

  // The bands read a weekly total, and phase 1 is where a leader first sees theirs. Giving them only
  // to the gap phase left the reveal able to name a total it could not say anything about, so the
  // coach either said nothing about it or invented a threshold of its own.
  if (phaseKey === 'phase-1-current' || phaseKey === 'phase-4-gap') {
    parts.push(
      '',
      'The total-hours bands, for reading what their weekly total means:',
      ...content.hourBands.map(
        (band) => `- ${band.lowerHours} to ${band.upperHours ?? 'more'} hours: ${band.label}`
      )
    );
  }

  if (phaseKey === 'phase-4-gap') {
    parts.push(
      '',
      'Where the gap points to a leader carrying delivery that could be led through others, this is the',
      'invitation to offer, close to these words. It is an invitation and never a diagnosis:',
      RECLAIM_UNDER_DELEGATION_INVITATION
    );
  }

  return parts;
}

/**
 * The two areas the Brief singles out for naming the absence, in the order it names them.
 *
 * "If a category is near zero, especially recovery and white space or deep work, the tool gently
 * wonders about it rather than merely charting it." Everything else that is near zero is worth
 * mentioning; these two are worth mentioning first.
 */
const ABSENCE_FIRST = ['recovery-white-space', 'deep-work'];

/**
 * Areas that are near zero, which is not the same as zero.
 *
 * `ChartData.unallocated` is `hours === 0` exactly (`chart/series.ts`), which is the right definition
 * for a chart and the wrong one for this beat: a leader with one hour of recovery in a fifty-hour
 * week has, for every purpose the Brief cares about, none. The threshold is **derived from the area's
 * own benchmark** rather than invented here — below half of where the guide starts — so an operator
 * moving a benchmark moves this too, and there is no number in this file for anyone to argue with.
 *
 * Areas with no benchmark at all (fundraising, which is season-dependent) are never named this way:
 * there is nothing to be near-zero against.
 */
function nearZeroAreas(chart: ReturnType<typeof buildChartData>, answers: Answers): string[] {
  const near = chart.buckets.filter(
    (b) =>
      b.hours > 0 && b.status === 'under' && b.lowPercent !== null && b.percent < b.lowPercent / 2
  );

  // **Deep work needs its own test, and this is not a special case so much as the right measure.**
  // The Brief names two areas to wonder about, recovery and deep work — but deep work is the one
  // area the canonical content gives no percentage range to: "no percentage range. Measured by
  // presence of protected blocks." So the percentage rule above can never flag it, and the beat
  // written for it would have quietly never fired. The signal the content itself nominates is the
  // protected-block reading, which this phase already asks for.
  const noBlock =
    truthy(answers['reclaim_current_deep_block_exists']) === false &&
    answers['reclaim_current_deep_block_exists'] !== undefined;
  const deepWork = chart.buckets.find((b) => b.slug === 'deep-work');
  const deepWorkAbsent =
    noBlock && deepWork !== undefined && !chart.unallocated.includes(deepWork.title)
      ? [deepWork.title]
      : [];

  const named = [...chart.unallocated, ...near.map((b) => b.title), ...deepWorkAbsent];
  // The Brief's two first, in its order, then everything else as it comes.
  const priority = new Map(
    ABSENCE_FIRST.map((slug, index) => [
      chart.buckets.find((b) => b.slug === slug)?.title ?? slug,
      index,
    ])
  );
  return named.sort(
    (a, b) => (priority.get(a) ?? ABSENCE_FIRST.length) - (priority.get(b) ?? ABSENCE_FIRST.length)
  );
}

/**
 * The Brief's permission-based challenge: once per audit, asked, and only then delivered.
 *
 * **"Once per audit" is a discipline here and not a control, and that has to be said out loud** — in
 * the register `coach/writable-slots.ts` uses about inferred reflections, because a future session
 * will read `reclaim_gap_challenge_offered` and assume the gate is enforced. It is a slot the *model*
 * writes, so a coach that offers the challenge and never records it can offer it again. Three things
 * make that acceptable rather than merely tolerated:
 *
 * 1. The failure is bounded and self-affecting: one leader is asked "may I offer a challenge?" twice
 *    in their own audit. Nothing leaks, nothing is corrupted, nobody else is touched.
 * 2. **A run-ledger moment would not be a control either.** `claimCoachOpening` is called by the
 *    *route*, before generation, for a moment the client asked for. Nothing claims a moment mid-turn.
 *    Making this one would mean either a server claim triggered by the model's own write, which is
 *    circular, or a button the leader presses — and you cannot put "may I offer a challenge?" behind a
 *    button, because pressing it *is* the permission, granted before the question was asked.
 * 3. The slot is the **cross-surface** answer, which a ledger moment could not be.
 *    `phase4-panel.tsx` writes `reclaim_gap_challenge_offered` on save, so a leader who met the
 *    under-delegation invitation on the form is correctly not offered the permission challenge in
 *    conversation. One challenge per audit is the Brief's rule, and it holds across both surfaces
 *    because the guard lives in the data rather than in either surface's own bookkeeping.
 */
function permissionChallenge(
  answers: RunAnswers,
  presentation: PresentationPolicy,
  challengedAtPhase3: boolean
): string[] {
  const offered = answers['reclaim_gap_challenge_offered'];
  const response = answers['reclaim_gap_challenge_response'];

  if (offered !== undefined) {
    return [
      '',
      'The one challenge this audit gets has already been offered, so do not offer another.',
      ...(response !== undefined
        ? [
            `What they made of it: "${presentAnswer('reclaim_gap_challenge_response', response, presentation)}". Carry that forward rather than reopening it.`,
          ]
        : []),
    ];
  }

  return [
    '',
    'This audit has one challenge in it and it has not been spent. Here is how it works, and the',
    'scarcity is the mechanism rather than a note beside it:',
    RECLAIM_PERMISSION_CHALLENGE,
    '',
    'So: ask the question, in those words or very close to them, and then stop and wait for their',
    'answer. Asking and answering yourself is not permission. If they say yes, give one observation,',
    'drawn from the figures above and not from anything general about leaders. One, and the most',
    'useful one you have, said plainly. This is the single moment in the whole audit where being',
    'direct is what they have agreed to, so do not soften it into a question.',
    'If they say no, that is a complete answer. Say so warmly and move on.',
    '',
    'Either way, record reclaim_gap_challenge_offered as true with the boolean in valueJson, and',
    'their reply as reclaim_gap_challenge_response. A decline is recorded as offered: they were asked,',
    'and the offer is what is spent. Spend it where it will do the most, not at the first opportunity.',
    ...(challengedAtPhase3
      ? [
          'They have already been challenged once this audit, on the week they designed looking much',
          'like the week they have. Do not make the same observation twice. If the most useful thing',
          'you have is that one again, this is not the moment for it and it is better left.',
        ]
      : []),
  ];
}

/**
 * One line per area: what the leader has now, what they said they wanted, and the difference.
 *
 * Reads `RECLAIM_BUCKETS` and the leader's own labels rather than the operator's config titles, which
 * is deliberate: this is the same source `buildChartData` draws from, so the areas the coach names are
 * exactly the areas on the leader's screen, under exactly the same names. The config supplies the
 * coach's *descriptive* content (the frame, the descriptions, the benchmarks); the canonical slugs and
 * their display labels are structure (I7).
 */
function gapLines(answers: Answers, bucketLabels: Record<string, string>): string[] {
  const current = bucketHours(answers);
  const lines: string[] = [];

  for (const bucket of RECLAIM_BUCKETS) {
    const now = current.get(bucket.slug);
    if (now === null || now === undefined) continue; // never asked about, so never compared
    const token = bucketToken(bucket.slug);
    const ideal = answers[`reclaim_ideal_hours__${token}`];
    const title = bucketLabels[token] ?? bucket.title;
    if (ideal === undefined) {
      lines.push(`- ${title}: ${now}h now, no ideal given.`);
      continue;
    }
    const want = Number(ideal.valueJson ?? ideal.value);
    if (!Number.isFinite(want)) {
      lines.push(`- ${title}: ${now}h now, ideal recorded as "${ideal.value}".`);
      continue;
    }
    const delta = Math.round((want - now) * 10) / 10;
    const direction = delta === 0 ? 'no change' : delta > 0 ? `${delta}h more` : `${-delta}h less`;
    lines.push(`- ${title}: ${now}h now, ${want}h wanted, ${direction}.`);
  }
  return lines;
}

/**
 * The card the leader has already read, quoted back so the coach does not signpost a phase that has
 * just signposted itself. Shared by the ordinary path and the summary phase.
 *
 * **`opens` says the phase begins with the coach speaking** (`coach/opening.ts`), and adds what an
 * opening turn is for: say why this part is worth the next ten minutes, then ask. Without it, a
 * coach handed a trigger and a capture list opens by asking for a figure, which is where the
 * conversation stops being one.
 *
 * It is written as a standing rule rather than as "this turn is the first", and that is forced
 * rather than chosen. This whole block is cached per `(contextType, contextId, userId)` by
 * `chat/context-builder.ts`, and `ContextRequest` carries only a user id, so nothing here can vary
 * by turn even in principle. What supplies the "now" is the trigger itself, which sits in the
 * model's history saying the leader has not spoken yet (`COACH_ARRIVAL_TRIGGER`); once they have
 * spoken, the transcript says so more plainly than a flag could.
 */
function cardLinesFor(phaseKey: string, signposts: PhaseSignpost[], opens: boolean): string[] {
  const card = signpostFor(phaseKey, signposts.length > 0 ? signposts : undefined);
  const cardLines =
    card === null || card.opening.length === 0
      ? []
      : [
          '',
          'The leader has already read this phase on screen, and it said:',
          ...card.opening.map((paragraph) => `"${paragraph}"`),
          'Do not restate any of that. Begin from where it leaves off.',
        ];

  if (!opens) return cardLines;

  return [
    ...cardLines,
    '',
    'This phase begins with you, not with the leader, and the opening turn has two parts. First, in',
    'a sentence or two, say what this part of the audit is for and why it is worth their time, in',
    'terms of what they get out of it rather than what it is called, and say roughly what to expect',
    'so the next few minutes are not open-ended. Where an earlier phase gave you something to connect',
    'it to, connect it: a reason built from what this leader has already told you is worth more than',
    'a general one.',
    'Then ask your first question, and stop there. Never open by inviting them to begin, by asking',
    'whether they are ready, or by waiting to be greeted. They came here to be taken through this.',
  ];
}

/**
 * How the audit closes.
 *
 * The source branches this by client tier, says the consultation offer appears **once** and not on
 * every audit, and asks that the closing affirmation vary each time rather than being recited.
 *
 * **"Once only" is derived, not stored.** The obvious implementation is a flag, or a moment on the
 * run's ledger — but the run ledger is per run and this is a fact about a person, and a flag is a new
 * piece of state to keep true. A leader who has completed an audit before has already been offered
 * the consultation, so `hasCompletedAudit` answers the question exactly, from data that is already
 * correct for other reasons. The current run is still `in_progress` here, so it never counts itself.
 */
async function closingContext(
  userId: string,
  answers: RunAnswers,
  presentation: PresentationPolicy
): Promise<string[]> {
  const takeaway = answers['reclaim_reflection_p6'];
  const [returning, grant] = await Promise.all([
    hasCompletedAudit(userId),
    prisma.reclaimGrant.findFirst({ where: { userId }, select: { tier: true } }),
  ]);

  const parts: string[] = [
    '',
    "This is the close. The summary is produced on screen and the sharing choices are the leader's",
    'consent to give, so neither is yours. The takeaway is the one reading you record here.',
  ];

  if (takeaway === undefined) {
    parts.push(
      '',
      'They have not yet said what they are taking away, and the summary does not appear until they',
      'have. Ask them, once, and let it land. When they answer, offer their own words back and record',
      'it with record_answers as reclaim_reflection_p6, in their words, never inferred, and never',
      'before they have said it. Do not produce a summary of the audit yourself and do not list what',
      'they should have learned.'
    );
  } else {
    parts.push(
      '',
      `They have said what they are taking away: "${presentAnswer('reclaim_reflection_p6', takeaway, presentation)}". Acknowledge it in their own`,
      'words. Do not improve on it, and do not record it again.'
    );
  }

  parts.push(
    '',
    'Then close warmly, and vary the words. A closing affirmation already appears on screen beneath',
    'the summary, so do not repeat it back at them: say something of your own about what it took to',
    'look at this honestly. It should sound like a coach who believes in them, never like a funnel.'
  );

  if (grant?.tier === 'client') {
    parts.push(
      '',
      'They are already working with Rashmir, so invite them to share these results ahead of their',
      'next session. That is the natural next step here and needs no persuading.'
    );
  } else if (!returning) {
    parts.push(
      '',
      'This is their first completed audit, so the door may be left open once, lightly, and only once:',
      'if they would like to explore this further they are welcome to get in touch. Mention it in',
      'passing and never as a call to action.'
    );
  } else {
    parts.push(
      '',
      'They have completed an audit before and have already been invited to explore working together.',
      'Do not offer it again. Close on what they have done, not on what they might buy.'
    );
  }

  return parts;
}

/**
 * The figures behind the gap, and the picture behind the reveal.
 *
 * Both are data flows rather than prompt text, and for the same reason I13 gives about the
 * refer-back. The source asks the tool to name a gap in the leader's actual numbers — "you estimated
 * you were spending about 15% on delivery and operations. Your calendar shows it is closer to 30%"
 * (`sources/Time_Audit_Tool_Prompt_Text.md:235`) — and a coach asked to do that from memory will
 * invent a figure that sounds right. So the arithmetic happens here and the model is given the
 * result.
 */
function momentForPhase(
  phaseKey: string,
  answers: RunAnswers,
  bucketLabels: Record<string, string>,
  content: ReclaimCoachContent,
  state: { revealed: boolean; reflected: boolean }
): string[] {
  const { presentation } = content;
  const { revealed, reflected } = state;
  if (phaseKey === CHART_REVEAL_PHASE) {
    // Two beats live in this phase and they run in this order in the source: the calendar branch is
    // offered once every area has a figure (`:136`), and the picture is revealed afterwards (`:229`),
    // whichever way the branch went. So both are assembled here rather than one returning early.
    const parts: string[] = [];
    const uploaded = truthy(answers['reclaim_calendar_uploaded']);
    const declined = truthy(answers['reclaim_calendar_declined']);
    const completeness = answers['reclaim_calendar_completeness'];
    const everyAreaAnswered = everyVisibleAreaHasHours(answers);

    if (uploaded) {
      // The perception-versus-reality summary the source asks for by name (`:233`): what is higher
      // than expected, what is lower, what is confirmed, in real figures.
      //
      // **This used to be a paragraph of framing with no numbers in it**, because there were none to
      // give: `buildChartData` below resolves to the composite *or* the estimate and never both, so
      // nothing in this briefing could express a difference between them. The deltas were computed
      // at upload and stored in `reclaim_composite_variance_note.valueJson`, and read by nothing.
      // `calendar/reading.ts` hands them over, with the I17 framing travelling in the same artefact
      // so the figures and the words that present them cannot drift apart.
      const calendar = calendarReadingLines(readCalendarReading(answers, bucketLabels));
      if (calendar.length > 0) {
        parts.push('', ...calendar);
      } else {
        // Uploaded, but nothing to compare — no estimate survived, or every area is missing one of
        // the two figures. The framing still has to be said, because the composite is what the chart
        // below is about to plot and the leader needs to know that is what they are looking at.
        parts.push(
          '',
          'The leader has uploaded a calendar and it has been reconciled. What they are looking at is the',
          'composite: their calendar plus the work that never reaches a calendar. Where that differs from',
          'what they first estimated, the difference is information about what a calendar does not',
          'capture, and never evidence that they were wrong. Do not present it as a correction.'
        );
        if (completeness !== undefined) {
          parts.push(
            `They said this about how completely their calendar reflects their working life: "${completeness.value}". Read every figure in that light.`
          );
        }
      }
    } else if (declined) {
      // The offer has been made and answered, and this is what "offered once" costs to keep true.
      //
      // The instruction below has always said "if they decline do not return to it", and the coach
      // could not obey it: this briefing is rebuilt from the run's answers on every turn, so a
      // decline that nothing recorded left the offer branch firing again a few turns later. A leader
      // who had already said no was asked a second time, by a message whose own wording promises it
      // is optional. The decline is now a reading (`reclaim_calendar_declined`), written either by
      // the coach hearing the no or by the leader pressing "Not now" on the card, and this is the
      // branch it buys.
      parts.push(
        '',
        'They have already been offered the calendar branch and said no. That is a complete answer.',
        'Do not offer it again, do not check whether they have changed their mind, and do not refer to',
        'it in passing. If they raise it themselves, the way in is a button on their screen and they can',
        'take it whenever they like; say so plainly and briefly, and carry on with the audit as it is.',
        'What they estimated is the picture, and it is worth as much without a calendar behind it.'
      );
    } else if (everyAreaAnswered) {
      // Gated on the data rather than on the model's sense of "have we finished", so the offer can
      // never arrive halfway through the areas.
      parts.push(
        '',
        'Every area now has a figure, which is the point at which the calendar branch is offered. Offer',
        'it once, close to these words, take no for an answer without persuading, and if they decline',
        'do not return to it:',
        RECLAIM_CALENDAR_OFFER,
        'If they say no, or not now, record reclaim_calendar_declined as true with the boolean in',
        'valueJson before you say anything else, and then let it go warmly. That reading is the whole of',
        'what stops them being asked a second time, so it matters more than anything you would say next.',
        'It is optional and the audit is worth doing without it, so say so. If they say yes, ask two',
        'things before anything else: how much their calendar reflects their actual working life, and',
        'what period they would like analysed. Record both as reclaim_calendar_completeness and',
        'reclaim_calendar_period. The first matters most, because it decides how every later figure is',
        'read: a leader whose calendar holds everything gets their figures treated with confidence, and',
        'one whose calendar is partial gets told plainly that the composite is the real picture and the',
        'calendar alone is not.',
        'Then send them to the calendar step on screen. The export instructions for each service are',
        'listed there. Do not recite those steps yourself.'
      );
      if (completeness !== undefined) {
        parts.push(
          'They have already answered both questions, so point them at the calendar step rather than asking again.'
        );
      }
    }

    if (chartRevealReady(answers)) {
      const chart = buildChartData(answers, bucketLabels);
      const over = chart.buckets.filter((b) => b.status === 'over');
      const under = chart.buckets.filter((b) => b.status === 'under');
      const nearZero = nearZeroAreas(chart, answers);
      parts.push(
        '',
        'The picture on screen, and what to do when the leader has just asked to see it. These are the',
        'figures they are looking at:',
        ...chart.buckets.map(
          (b) => `- ${b.title}: ${b.hours}h, ${b.percent} per cent of the week (${b.status})`
        ),
        `Total: ${chart.totalHours} hours a week.`,
        ...(over.length > 0
          ? [`Above its benchmark: ${over.map((b) => b.title).join(', ')}.`]
          : []),
        ...(under.length > 0
          ? [`Below its benchmark: ${under.map((b) => b.title).join(', ')}.`]
          : []),
        // Naming the absence (Brief §5): "if a category is near zero, especially recovery and white
        // space or deep work, the tool gently wonders about it rather than merely charting it". This
        // used to read `chart.unallocated`, which is `hours === 0` exactly — so an hour of recovery in
        // a fifty-hour week was invisible to the beat written for precisely that leader. Near-zero is
        // derived from each area's own benchmark, and the Brief's two areas are named first.
        ...(nearZero.length > 0
          ? [
              `At or near nothing this period: ${nearZero.join(', ')}. Wonder about these aloud rather`,
              'than only noting them, and start with the first one named here. Ask what has been',
              'happening to that time. Never present it as a deficit or a discipline problem: an area',
              'at zero is usually somewhere the week has quietly taken from, not somewhere they chose',
              'to neglect.',
            ]
          : []),
        '',
        ...(!revealed
          ? [
              'They have not asked to see this yet, and the button is theirs to press. Do not describe the',
              'picture, do not summarise these figures, and do not ask what stands out until they have',
              'looked. Carry on with the readings below.',
            ]
          : !reflected
            ? [
                'The leader has asked to see this and the picture is on their screen now. That makes this',
                'beat the live one, and it comes before anything on the capture list below: do not return',
                'to gathering readings until it has run its course. Two steps, in this order.',
                '',
                'First, summarise what they are looking at: the total for the week, and which areas',
                'sit above or below the guide, specifically and in numbers. Then ask whether it is right:',
                'does that look like their week, is anything wrong, does anything need changing? Ask it',
                'plainly and mean it. Every bar here was drawn from an estimate they gave in',
                'conversation, and a figure that felt about right when spoken often looks wrong once it',
                'is drawn to scale beside the others. Checking it is not doubting them; it is what makes',
                'everything built on these numbers worth anything.',
                '',
                'If they revise a figure, record the corrected number with record_answers against the',
                'same reclaim_current_hours__ slot, with the new figure in valueJson. It supersedes the',
                'old one and the picture on their screen is redrawn from it, so confirm the change in',
                'words rather than describing a chart they can see. Never argue a figure down: it is',
                'their week, and a correction is information, not a retraction. Where a change moves the',
                'total or crosses a guide, say so in a sentence, then ask again whether the picture is',
                'right now.',
                '',
                'Second, once they are content that the figures are accurate, ask one question, close to',
                '"what stands out to you here?", and stop. Do not interpret, do not add observations, and',
                'do not move them on. Their own noticing comes first; your reading of it comes after, and',
                'only after.',
              ]
            : [
                'They have seen the picture, checked the figures and said what stands out to them, so the',
                'pause is over and this is where your own reading belongs. Do it in one pass, and do it',
                'before returning to anything still unfilled on the capture list below.',
                '',
                'Acknowledge what they noticed, in their words. Say what their weekly total says about',
                'the shape of the week, using the bands above. Then give your reading of how they are',
                'spending it: which areas sit away from the guide, what that pattern suggests about how',
                'they are leading at the moment, and what they may have missed in their own answer.',
                'Judge the pattern, never the person, and stay inside the governing frame. This is not',
                'a review of how efficient they are.',
                '',
                'They can still change a figure at any point, and if they do, record it as above and',
                'reflect the change back.',
                '',
                'Then look at what this phase never asked. Every area was meant to give you two things,',
                'the hours and what that time actually looks like, and the second is the one that gets',
                'dropped. Where an area has a figure and nothing else, that is the conversation this',
                'phase is for and it has not happened yet. Pick the two or three that matter most',
                'here, the areas furthest from their guide and any they have said nothing about, and',
                // This used to end "one offer, take a no", which is the reflection pause's rule
                // applied to the readings the phase exists for. An area with a figure and nothing
                // else is precisely the case worth one real second attempt.
                'ask what that time actually looks like, in their own language. If the first attempt',
                'gets you a few words, go once more with a different way in. Stop if they would rather',
                'not, or if they are still sitting with something they have just said.',
                // This used to end by telling the leader they could move on whenever they were ready.
                // The coach cannot see whether the button is there, and on the turn it says so the
                // screen may well be showing what is still to cover instead, so the two contradicted
                // each other in front of the person they were both talking to.
                'Do not tell them they can move on. Their screen offers that itself once enough of',
                'this phase has been covered, and it says what is still open beside it. Keep asking.',
              ])
      );
    }

    // The leading '' of each beat is a blank line in the assembled block; there is nothing to strip,
    // because every conditional entry above is spread in rather than pushed as an empty string.
    return parts;
  }

  if (phaseKey === 'phase-3-ideal') {
    const reading = readIdealWeek(answers, bucketLabels);
    // Nothing until the week is actually designed. A half-built ideal week differs from the current
    // one only because most of it is still empty, and challenging that is challenging the fact that
    // the conversation has not finished. Same gate, same reason, as `chartRevealReady`.
    if (!reading.complete) return [];

    const sideBySide = gapLines(answers, bucketLabels);
    const parts: string[] = [
      '',
      'The week they have just designed, next to the one they described. Read these rather than',
      'recalculating them:',
      ...sideBySide,
    ];

    // Suppressed once the phase's own reflection is recorded: the challenge belongs before the pause,
    // not after it. Free, because `reflected` is already in this function's signature.
    //
    // It sits above the closing beat below, and the two gates are why it can. The challenge fires on
    // `complete` — the spread — so it is usually offered and answered while the leader is still on the
    // last two questions, long before the picture is drawn. Where both are live in the same turn, this
    // order is the one the coach reads them in.
    if (reading.shouldChallenge && !reflected) {
      parts.push(
        '',
        'This ideal week has not moved far from their current one, and that is worth saying. Offer',
        'this, gently, as the source has it:',
        RECLAIM_IDEAL_WEEK_CHALLENGE,
        '',
        'What is actually true here, in their own figures. Name one or two of these specifically,',
        'never the whole list, and never as a correction:',
        ...challengeEvidence(reading),
        '',
        'Do it as curiosity and not as a verdict. A week that has barely moved usually means the',
        'change felt impossible rather than undesirable, so ask what would have to be true for it to',
        'look different, and let the answer stand. If they say this is the week they want, that is a',
        'real answer and the audit carries on from it. Do not offer this twice.'
      );
    }

    // The section's closing picture, and the order it has to run in.
    //
    // This phase draws the designed week over the reported one once all four of its questions are
    // answered — the total, the spread, the deep-work block and the protected commitment. The chart is
    // placed in the transcript under the turn it appeared on, so the reflection cannot share that
    // turn: a coach that records the last reading and asks what stands out in the same breath puts its
    // question above the picture the question is about. That is what a tester met, and the only thing
    // that separates the two beats is this instruction, because the model is the one deciding where
    // the turn ends.
    //
    // The first branch is guidance and never a gate. A leader who will not put a figure on one area
    // can still close this section — the reflection's own note below says so, and holding the closing
    // question behind a reading nobody may ever give is the deadlock that note exists to avoid.
    if (!reading.designComplete) {
      parts.push(
        '',
        'There is no picture on their screen yet. This section ends with the week they have designed',
        'drawn over the week they described, and it appears once all four of the questions in this',
        'section are recorded. So finish the four first, and do not ask what stands out to them',
        'before the picture is there for them to look at.'
      );
    } else if (!reflected) {
      parts.push(
        '',
        'The week they designed is now drawn on their screen, over the week they described, area by',
        'area. It arrived because the last of the four readings landed, which makes this the section',
        'closing rather than another question inside it, and it comes before anything on the capture',
        'list below.',
        '',
        'Say briefly what the picture shows: the total they are aiming at, and the two or three areas',
        'that move the most, in hours and by name. Then ask one question, close to "what stands out to',
        'you here?", and stop. Do not interpret it for them, do not add observations of your own, and',
        'do not move them on. Their own noticing comes first, and your reading of it comes after.',
        '',
        'If the reading that completed the four has only just been recorded, this is the next turn and',
        'not that one. Confirm what they said, and let the picture arrive: a turn that records the last',
        'answer and asks what stands out in the same breath asks about a picture they have not seen.'
      );
    }

    return parts;
  }

  if (phaseKey === 'phase-4-gap') {
    const lines = gapLines(answers, bucketLabels);
    if (lines.length === 0) return [];

    // I13's refer-back, read from THIS run rather than deferred to "elsewhere in your context".
    // "Elsewhere" meant the framework's module context, which injects slot *heads* — cross-run by
    // definition. So on a second audit the coach was being pointed at audit one's answers for the one
    // beat the Brief calls "a data-flow requirement, not just prompt text". `readRunAnswers` has
    // already fetched the whole run by the time we get here, so the correct values were sitting
    // unused two lines away. Costs nothing, and closes a defect nobody would have seen until a leader
    // repeated their audit.
    const keepingUp = answers['reclaim_setup_keeping_me_up'];
    const whyNow = answers['reclaim_setup_why_now'];
    const priorities = answers['reclaim_setup_priorities'];
    const chart = buildChartData(answers, bucketLabels);
    const nearZero = nearZeroAreas(chart, answers);

    // The threshold comes from the bands, so moving it is a config edit rather than a code one. The
    // unsustainable band is the last one — the highest `lowerHours` with no upper bound above it.
    const topBand = [...content.hourBands].sort((a, b) => b.lowerHours - a.lowerHours)[0];
    const weeklyHours = Number(
      answers['reclaim_setup_weekly_hours']?.valueJson ??
        answers['reclaim_setup_weekly_hours']?.value ??
        chart.totalHours
    );
    const unsustainable =
      topBand !== undefined && Number.isFinite(weeklyHours) && weeklyHours >= topBand.lowerHours;

    // Whether phase 3 already spent a challenge on this leader. Derived rather than stored: the
    // reflection existing means they passed through that phase, and the reading says whether it
    // fired. Two challenges in ten minutes is one challenge repeated.
    const challengedAtPhase3 =
      answers['reclaim_reflection_p3'] !== undefined &&
      readIdealWeek(answers, bucketLabels).shouldChallenge;

    return [
      '',
      'The gap, in their own figures. Do not recalculate these and do not quote a number that is not',
      'here:',
      ...lines,
      ...(keepingUp !== undefined || whyNow !== undefined
        ? [
            '',
            'What they said at the start of this audit, from this audit and not an earlier one:',
            ...(keepingUp !== undefined
              ? [
                  `- What keeps them up at night: "${presentAnswer('reclaim_setup_keeping_me_up', keepingUp, presentation)}"`,
                ]
              : []),
            ...(whyNow !== undefined
              ? [
                  `- Why they wanted to do this now: "${presentAnswer('reclaim_setup_why_now', whyNow, presentation)}"`,
                ]
              : []),
          ]
        : []),
      '',
      'Open this phase by putting the two weeks side by side and naming what sits between them, in',
      'these numbers. Then put their own words from the start of the audit next to it, as they said',
      'them and not as your summary of them, and ask what they notice. One question, then stop.',
      // Naming the absence, in the form the source gives it at the gap: "which priorities currently
      // have no protected time, and what would change if they did?" The join is deliberately left to
      // the model — `reclaim_setup_priorities` is free text, "grow the fellowship programme" has no
      // bucket, and no deterministic mapping exists. Both halves are rendered; the reading is theirs.
      ...(priorities !== undefined && nearZero.length > 0
        ? [
            '',
            'Then the question this phase is really for. These are the priorities they named at the',
            `start: "${presentAnswer('reclaim_setup_priorities', priorities, presentation)}". And these`,
            `are the areas with no protected time in this week: ${nearZero.join(', ')}.`,
            'Say which of their own priorities is sitting in one of those areas, name it as theirs',
            'rather than as a finding, and ask what would change if it had some time in it. Record',
            'their answer as reclaim_gap_unfunded_priorities. This is often the most useful thing in',
            'the whole audit, and it is only visible because they told you both halves.',
          ]
        : []),
      // The unsustainable-hours note, fired from the bands rather than a literal 55. `hourBands` is
      // already operator-editable and already given to this phase, so where the line sits is
      // Rashmir's to move without a deploy — which is the repo's own rule for her "or something like
      // that" numbers.
      ...(unsustainable
        ? [
            '',
            'Their weekly total is in the band where the hours themselves are the question, not only',
            'how the hours are spent. Name that directly rather than reallocating around it:',
            RECLAIM_HOURS_55_NOTE,
          ]
        : []),
      ...permissionChallenge(answers, presentation, challengedAtPhase3),
      ...(content.strategyMirror && answers['reclaim_gap_strategy_mirror'] === undefined
        ? [
            '',
            'Once, where it lands naturally and not as a set piece, ask them this and let it sit:',
            RECLAIM_STRATEGY_MIRROR,
            'Record what they say as reclaim_gap_strategy_mirror, in their words. If they would rather',
            'not answer it, let it go and do not return to it.',
          ]
        : []),
    ];
  }

  if (phaseKey === 'phase-5-action') {
    // The client fires this phase's opening automatically on arrival, sending the coach "open it the
    // way your context describes" — and until now the context described nothing here, so the coach
    // opened a beat it had no figures for. Three options built without the numbers are three pieces
    // of general advice, which is the complaint this whole change exists to answer. The arithmetic is
    // `gapLines`, the same helper phase 4 uses, because the options are answers to the same gap.
    const lines = gapLines(answers, bucketLabels);
    const peak = answers['reclaim_energy_peak_description'];
    const block = answers['reclaim_ideal_deep_block_when'];
    const commitment = answers['reclaim_ideal_protected_commitment'];
    if (lines.length === 0 && peak === undefined && commitment === undefined) return [];

    return [
      '',
      "What the options have to be built from. These are this leader's own figures and answers, so",
      'build the three entry points out of them and do not offer anything generic while these are in',
      'front of you.',
      ...(lines.length > 0
        ? ['', 'The gap they have just looked at, area by area:', ...lines]
        : []),
      ...(peak !== undefined
        ? [
            '',
            `When they are at their best: "${peak.value}". An option that puts something in that`,
            'window, or takes something out of it, is worth more than one that does not touch it.',
          ]
        : []),
      ...(block !== undefined ? [`Where they said deep work would sit: "${block.value}".`] : []),
      ...(commitment !== undefined
        ? [
            `The one protected commitment they named: "${commitment.value}". One of the three options`,
            'should be that, made concrete enough to start. They have already told you what would',
            'make the biggest difference, so do not go looking for something cleverer.',
          ]
        : []),
    ];
  }

  return [];
}

/**
 * What this audit already holds from the phases behind the current one.
 *
 * **The gap this closes.** Three things put prior answers in front of the coach, and until now only
 * two of them were this run's. The capture list is run-scoped but covers the current phase only. The
 * refer-back is run-scoped and covers two slugs. Everything else — the leader's hours at phase 3,
 * their energy window at phase 5 — reached the model solely through the framework's module context,
 * which injects slot *heads* (`loadModuleContext`). Heads are cross-run by definition, so on a repeat
 * audit they still carry audit one's answers, undated and unlabelled, indistinguishable from this
 * week's. The coach could not tell which audit it was reading.
 *
 * It also makes the opportunism in the worklist guidance safe across the whole audit rather than
 * inside one phase: a coach invited to follow the leader wherever they go needs to know what has
 * already been said everywhere, or it asks again for something from two phases ago.
 *
 * Capped, and deliberately terse — one line per reading, no source type, no confidence. This is
 * background the coach reads to avoid repeating itself, not a worklist; the phase's own list is the
 * worklist and it carries the detail.
 */
const DIGEST_CAP = 40;

function earlierPhaseDigest(
  currentPhaseKey: string,
  answers: RunAnswers,
  bucketLabels: Record<string, string>,
  presentation: PresentationPolicy
): string[] {
  const currentNumber = phaseNumber(currentPhaseKey);
  if (currentNumber === null) return [];

  const earlier = RECLAIM_PHASES.filter((p) => {
    const n = phaseNumber(p.key);
    return n !== null && n < currentNumber;
  });

  const lines: string[] = [];
  for (const phase of earlier) {
    for (const slot of phaseCaptureSlots(phase.key, {
      fundraisingRelevant: truthy(answers[FUNDRAISING_RELEVANT]),
      bucketLabels,
    })) {
      const recorded = answers[slot.slug];
      if (recorded === undefined) continue;
      lines.push(`- ${slot.label}: ${presentAnswer(slot.slug, recorded, presentation)}`);
      if (lines.length >= DIGEST_CAP) break;
    }
    if (lines.length >= DIGEST_CAP) break;
  }

  if (lines.length === 0) return [];
  return [
    '',
    'What this audit has already established, in the phases behind this one. All of it is from this',
    'audit and none of it from any earlier one, whatever undated values appear elsewhere in your',
    'context. Use it so you do not ask again for something they have told you, and so what you say',
    'here connects to what they said earlier:',
    ...lines,
  ];
}

/**
 * The one reading this turn's question goes to, chosen here rather than left to the model.
 *
 * **Why this is arithmetic and not another paragraph.** The block already tells the coach, at length
 * and in three separate places, that every turn ends with a question drawn from the capture list. It
 * was observed ignoring all three: at phase 0 with three readings outstanding it said "we have
 * gathered quite a bit about your current context and priorities. If there is anything else you would
 * like to add or clarify, feel free to do so", which is the open invitation the prose explicitly
 * forbids, twice in the same conversation. Adding a fourth paragraph saying the same thing would have
 * been the same instruction shouted louder.
 *
 * What the prose was actually asking for is a decision: read a list of nineteen lines, work out which
 * are outstanding, which do not apply, which are captured but thin, and pick one. That is a
 * deterministic selection over data this function already holds, and a model asked to make it in the
 * middle of composing a warm reply will sometimes not make it at all. So it is made here, and the
 * coach is handed a slug and a label rather than a rule.
 *
 * The order is the order the phase is worth having: a reading nobody has asked beats one that is
 * recorded, and an inference the leader has not seen beats a note that could be an account, because
 * an unconfirmed reading means the audit currently claims something they never said.
 *
 * It stays a default rather than a command. The opportunistic rule above tells the coach to follow the
 * leader wherever they go, and that rule is why this conversation is not a form; this one names where
 * to go when the leader's own message did not open a door.
 *
 * ## Why two, and not one
 *
 * This whole block is built **before** the turn runs, from `readRunAnswers` as it stands when the
 * leader's message arrives and before anything in that message has been recorded. So on the one turn
 * that matters most — the turn where the leader answers the very reading this function named — the
 * directive names a question that has just been answered, and the coach is left with nothing to do
 * with it.
 *
 * Observed, at phase 0, exactly there: the named reading was the period being audited, the leader
 * said "last month", and the coach recorded it and then said "we have a clear view of your current
 * context and priorities. When you're ready, you can move on to the next phase" — the two things the
 * prose above spends a paragraph each forbidding. Three thin readings were sitting on its list. It
 * did not go to them, because nothing pointed at one and the only pointer it had was spent.
 *
 * A named fallback closes that without making the selection a judgement again: the second reading is
 * chosen by the same ordering as the first, and the instruction that carries it says the one condition
 * under which it is the live one. Two, not three, because the case it covers is the leader answering
 * the question they were asked, and a leader who answers two readings in one message has volunteered
 * the second — which the opportunistic rule already handles better than a list can.
 */
interface NextQuestion {
  kind: 'unasked' | 'unconfirmed' | 'short';
  slot: PhaseSlot;
  /** Followers asked inside the same question. Only ever populated for an unasked anchor. */
  alongside: PhaseSlot[];
  /** What the audit holds today, for the two kinds that go back to a reading already captured. */
  shown?: string;
}

/** The reading to ask, and the one to fall to when the leader has just answered it. */
const NEXT_QUESTION_DEPTH = 2;

function nextQuestionsFor(
  slots: PhaseSlot[],
  answers: RunAnswers,
  presentation: PresentationPolicy,
  paired: boolean
): NextQuestion[] {
  const byslug = new Map(slots.map((slot) => [slot.slug, slot]));
  const found: NextQuestion[] = [];
  // Followers riding along inside an earlier candidate's question. Naming one of those as the
  // fallback would offer, as the thing to ask instead, a reading already inside the thing to ask.
  const spokenFor = new Set<string>();

  // Declaration order, and followers are not skipped: an anchor that is captured while its follower
  // is not leaves the follower as the outstanding reading, and it is the one to ask.
  for (const slot of slots) {
    if (found.length >= NEXT_QUESTION_DEPTH) break;
    if (spokenFor.has(slot.slug)) continue;
    if (answers[slot.slug] !== undefined) continue;
    if (slotApplies(slot.askOnlyIf, answers) === false) continue;
    const alongside = (paired ? (slot.pairedWith ?? []) : [])
      .map((slug) => byslug.get(slug))
      .filter((follower): follower is PhaseSlot => follower !== undefined)
      .filter(
        (follower) =>
          answers[follower.slug] === undefined && slotApplies(follower.askOnlyIf, answers) !== false
      );
    for (const follower of alongside) spokenFor.add(follower.slug);
    found.push({ kind: 'unasked', slot, alongside });
  }

  // Deliberately independent of `SHORT_FLAG_CAP`. That cap governs how many flags are *shown*, so the
  // list does not read as eleven things to go back for; which readings the turn may end on is a
  // different question and must not be silently truncated out of existence.
  for (const wanted of ['unconfirmed', 'short'] as const) {
    for (const slot of slots) {
      if (found.length >= NEXT_QUESTION_DEPTH) break;
      const recorded = answers[slot.slug];
      if (recorded === undefined) continue;
      if (answerFlag(slot.slug, slot.dataType, recorded) !== wanted) continue;
      found.push({
        kind: wanted,
        slot,
        alongside: [],
        shown: presentAnswer(slot.slug, recorded, presentation),
      });
    }
  }

  return found;
}

/** How one named reading is described: what it is, and where this run stands on it. */
function namedQuestion(next: NextQuestion): string {
  const named = `${next.slot.label} (${next.slot.slug})`;
  switch (next.kind) {
    case 'unasked':
      return `${named}, which nobody has asked in this audit yet.`;
    case 'unconfirmed':
      return `${named}, which this audit currently holds as "${next.shown}" and which they have never confirmed.`;
    default:
      return `${named}, which this audit currently holds as "${next.shown}".`;
  }
}

/** What to do with one named reading, once the coach has been pointed at it. */
function howToAsk(next: NextQuestion): string[] {
  return [
    ...(next.kind === 'unasked' && next.alongside.length > 0
      ? [
          `Ask it as one question, in one breath, together with ${next.alongside
            .map((follower) => `${follower.label} (${follower.slug})`)
            .join(' and ')}, in that order.`,
        ]
      : []),
    ...(next.kind === 'unconfirmed'
      ? [
          'Offer your reading of it back in your own words, as something for them to put right rather',
          'than as something to agree to.',
        ]
      : []),
    ...(next.kind === 'short'
      ? [
          'Go back to it once and ask for the rest of it: what it actually looks like, or what sits',
          'behind it. Once only, and if they leave it where it is, leave it there.',
        ]
      : []),
    'Ask it in your own words and in theirs. Never read the label or the slug out, and put it in the',
    'final paragraph so it is the last thing they read.',
    // Named against the reading the turn was already told to end on, which is the point: this
    // instruction and the question it governs cannot come apart, because the same `NextQuestion`
    // produced both. The offer is only mentioned for a question that is actually being asked, so a
    // turn that follows the leader somewhere else carries no instruction to offer anything.
    //
    // And never for an anchor with followers riding along. The line above has just told the coach to
    // ask this reading and its partner as one question; a set of answers under a two-part question
    // answers half of it, and the leader is left looking at Yes / No beneath "how does that shape the
    // way you lead?". See `compoundQuestionSlugs` for the failure this closes.
    ...(next.alongside.length === 0 && hasChoices(next.slot.slug)
      ? [
          `This reading is answered from a fixed set, so call offer_choices for ${next.slot.slug} in`,
          'this same turn, straight after asking. The answers appear under your question on their',
          'screen, so ask it as an open question in your own words and do not list them or hint at',
          'them: shown and read out is the same question twice. They can still type something else.',
        ]
      : []),
  ];
}

/** The closing directive: the named question, its fallback, or the honest tail case with neither. */
function nextQuestionLines(next: NextQuestion[]): string[] {
  const [first, second] = next;
  if (first === undefined) {
    return [
      'Every reading this phase captures that applies to this leader has landed, and none of them is',
      'short or waiting to be confirmed, so there is no reading left to go back for. Stay with whatever',
      'they raise next and answer it properly. Still do not tell them the phase is finished and do not',
      'invite them to move on: their screen is what offers that, and it is already offering it.',
    ];
  }

  const opening =
    first.kind === 'unasked'
      ? [
          'The question this turn ends with, worked out for you so that no turn can end without one. Unless',
          "the leader's last message has just opened onto a different reading from the list above, in which",
          'case go there while it is live, this is the one:',
        ]
      : [
          'Every reading this phase asks that applies to this leader has been captured, so the question goes',
          first.kind === 'unconfirmed'
            ? 'to one you worked out rather than one you were told. This is it:'
            : 'to the one you have a note of rather than an account of. This is it:',
        ];

  return [
    ...opening,
    namedQuestion(first),
    ...howToAsk(first),
    // The fallback, and the whole of why it is here. This block is built from the run as it stood
    // *before* the leader's message was read, so the reading named above is the one most likely to be
    // the very thing they have just answered — that is what being asked a question and answering it
    // looks like from here. Without somewhere to go next, the coach that has just been handed a spent
    // pointer says the phase is finished and offers a way onward it cannot see. Both are forbidden a
    // few paragraphs above, and it said them anyway, because a rule about what not to do is no use to
    // a model that has nothing left to do instead.
    //
    // "Nothing else that belonged to it" is the second half, and it was written after a live audit
    // took this branch correctly and still got the screen wrong: handed the period it had asked for,
    // the coach recorded it, asked the fallback question, and called `offer_choices` for the period
    // anyway, because the instruction to offer sits a few lines above under the reading it named. The
    // leader met four periods to choose from under a question about what stands out to them. The
    // capability now refuses that outright (`settled-reading.ts`) and this is the prose that stops it
    // being attempted, which is worth having as well: a refusal costs the coach an iteration it can
    // spend on the turn instead.
    //
    // It says "their last message" rather than "the message you are replying to", and the difference
    // is a live audit. Asked how much deep work they wanted, the leader said "10"; the provider threw
    // 429 before the coach spoke, and the client picked the turn back up. Nothing had swept the "10" —
    // a turn that dies has no `done` frame to sweep from — so this block named deep work again, and
    // the escape hatch below did not fire, because on a resumed turn the message being replied to is a
    // stage direction (`COACH_RESUME_TRIGGER`) and not an answer to anything. The coach asked for a
    // figure that was three lines above it in the transcript. The route now sweeps before it resumes,
    // which is the half of the fix that does not depend on prose; this is the half that still holds
    // when that sweep could not run, which after a provider refusal is exactly when it could not.
    ...(second === undefined
      ? []
      : [
          '',
          'And if that one is what they have already answered, which is likely, because it is the question',
          'you last asked: record what they said, do not ask it again, and do not offer its answers either,',
          'because the question they belonged to is over. Read their last message to decide that, not only',
          'the message you are replying to: a turn you are picking back up is answered by the message before',
          'the one that asked you to pick it up.',
          'Then let the turn end on this instead:',
          namedQuestion(second),
          ...howToAsk(second),
        ]),
  ];
}

/**
 * The note that marks a reading as one the leader picks rather than writes.
 *
 * Deliberately says the set exists without saying what is in it. The options are the product's
 * (`coach/slot-choices.ts`) and reach the leader through the tool, so spelling them out here would
 * put a second copy in the model's context, which is the copy that eventually gets paraphrased into
 * the reply. The coach needs to know only that this question closes on a set, and to name the
 * reading; the screen does the rest.
 *
 * `insideCompound` is the one case where a reading that has a set must not be told it has one. The
 * list draws those under "Ask these as one question", and the coach did exactly as it was told: it
 * asked the pair in one breath *and* offered the anchor's yes-or-no, so a leader asked how a
 * distributed team shapes their leadership got two buttons that answer a different question. The set
 * belongs to the reading; the question on screen is the pair. See `compoundQuestionSlugs`.
 */
function choiceNote(slug: string, insideCompound: boolean): string {
  // The line it is appended to ends on the label, which carries no full stop of its own, so this
  // opens with one. Without it the note runs straight on from the label into a sentence.
  return !insideCompound && hasChoices(slug)
    ? '. This one has a fixed set of answers, so offer them.'
    : '';
}

/** What a typed slot needs before it may be recorded, in the words the coach should act on. */
function typedValueNote(dataType: string): string {
  switch (dataType) {
    case 'number':
      return 'needs a figure';
    case 'boolean':
      return 'needs a yes or a no';
    case 'date':
      return 'needs a date';
    case 'json':
      return 'needs a structured value';
    default:
      return '';
  }
}

/**
 * The answers this turn's question closes on, worked out without asking the model anything.
 *
 * ## Why this exists beside the tool rather than instead of it
 *
 * The coach is told, every turn, which reading to end on and whether that reading has a fixed set of
 * answers, and it can say so by calling `offer_choices`. Observed on a live audit, it called the tool
 * on the first turn, then asked the very same question three more times without calling anything and
 * narrated "you can choose from the options on your screen" while the leader looked at a text box.
 * That is not a wording problem and another paragraph of prose will not fix it: having called the
 * tool once, the model believes the answers are still up.
 *
 * This is the same failure `capture-sweep.ts` was built for, and it takes the same answer. The model
 * still calls the tool, and should: it knows when it has followed the leader somewhere other than the
 * reading it was pointed at, and this function cannot. But when it does not call, the offer no longer
 * simply fails to happen, because **which reading the turn's question is about was decided here in
 * the first place**. `nextQuestionFor` made that choice before the turn ran; this reads the same
 * decision back.
 *
 * ## What it deliberately does not do
 *
 * It does not try to tell whether the coach *actually* asked that question. It cannot: the reply is
 * free prose. The context tells it to follow the leader wherever they go, so a turn that went
 * somewhere else would get answers belonging to a question nobody asked. Three things keep that from
 * being a trap, and they are the reason this is safe to do deterministically: the control names the
 * reading it is for, it sits beside a way to type instead, and taking that way out is reversible. A
 * mismatched offer is a visible, dismissible wrong guess rather than a silent one.
 *
 * `presentation` is passed as the shipped default because it cannot change *which* slot comes back —
 * it only formats a captured value for display. The selection itself is the ordering in
 * `nextQuestionFor`.
 *
 * ## And it stands down for a two-part question
 *
 * Pairing, by contrast, does change what comes back, so it is read rather than assumed. An anchor with
 * followers riding along is asked as one question with an open half in it, and a set of answers under
 * that question answers the wrong half — the failure `compoundQuestionSlugs` documents. `alongside` is
 * populated by the same call that chose the reading, so the fallback cannot offer a set for a question
 * the coach was told to ask two ways at once.
 */
export async function pendingChoiceOffer(input: {
  userId: string;
  runId: string;
  phaseKey: string;
}): Promise<{ slotSlug: string; label: string; options: string[] } | null> {
  const [answers, bucketLabels, questioning] = await Promise.all([
    readRunAnswers(input.userId, input.runId),
    readBucketLabels(input.userId).catch(() => ({})),
    readReclaimQuestioning(),
  ]);
  const slots = phaseCaptureSlots(input.phaseKey, {
    fundraisingRelevant: truthy(answers[FUNDRAISING_RELEVANT]),
    bucketLabels,
  });
  if (slots.length === 0) return null;

  // The first of them, which is the reading the turn was told to end on. The fallback beside it is
  // for a coach that has just had this one answered, and the answers on screen follow the question
  // that was asked rather than the one that might be asked next.
  const [next] = nextQuestionsFor(
    slots,
    answers,
    DEFAULT_PRESENTATION,
    questioning.pairing === 'paired'
  );
  if (next === undefined) return null;
  if (next.alongside.length > 0) return null;

  const options = choicesFor(next.slot.slug);
  if (options === null) return null;
  return { slotSlug: next.slot.slug, label: next.slot.label, options: [...options] };
}

/**
 * The capture block for a leader's active run, or `''` when there is nothing useful to say (no run in
 * progress, or a phase that captures nothing conversationally, which is the summary phase).
 *
 * Returning empty rather than a "there is nothing here" sentence is deliberate: `buildContext` frames
 * whatever comes back as locked context, and a block whose content is its own absence spends tokens
 * teaching the coach nothing.
 */
export async function buildCoachPhaseContext(userId: string): Promise<string> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { userId, status: 'in_progress' },
    select: { id: true, coachOpenings: true },
  });
  if (run === null) return '';

  // The reveal is claimed on the run *before* the turn is generated (`coach/stream/route.ts`), so on
  // the very turn the leader asks to see their week this already reads true. That ordering is what
  // lets the reveal beat and its question be one turn instead of two.
  const openings = run.coachOpenings ?? [];
  const revealed = chartRevealed(openings);

  const { currentPhaseKey } = await loadPhaseProgress(userId, run.id);
  const phase = RECLAIM_PHASES.find((p) => p.key === currentPhaseKey);
  const number = phaseNumber(currentPhaseKey);
  if (phase === undefined || number === null) return '';

  // Whether this phase is one the coach opens. Phase 6 is not: its takeaway is asked on the screen,
  // and its close fires after the summary has rendered.
  const opens = arrivalMomentFor(currentPhaseKey) !== null;

  // One read of the run, one of the labels, one of the content, one of the cards, then everything
  // below is arithmetic.
  const [answers, bucketLabels, content, signposts] = await Promise.all([
    readRunAnswers(userId, run.id),
    readBucketLabels(userId).catch(() => ({})),
    readReclaimCoachContent(userId),
    readReclaimSignposts().catch(() => []),
  ]);

  const fundraisingRelevant = truthy(answers[FUNDRAISING_RELEVANT]);
  const slots = phaseCaptureSlots(currentPhaseKey, { fundraisingRelevant, bucketLabels });

  // The summary phase captures nothing conversationally — the coach may not write a reflection or a
  // sharing choice — but it is not silent. It asks the takeaway before the artifact exists, and it
  // closes. So it gets its own block rather than the capture list's early exit.
  if (currentPhaseKey === FINAL_PHASE_KEY) {
    return [
      `This audit is at section ${number} of 6: ${phase.label}.`,
      // The leader's screen calls these sections, and this briefing calls them phases throughout
      // because that is the word the code, the slugs and the run's own state use. Only one of those
      // two is spoken aloud, so the rule is stated once, here, where the count is.
      'The parts of this audit are called sections wherever the leader can see them. Say section to',
      'them, never phase, whatever the rest of this briefing calls it.',
      '',
      ...contentForPhase(currentPhaseKey, content, fundraisingRelevant),
      ...cardLinesFor(currentPhaseKey, signposts, opens),
      ...(await closingContext(userId, answers, content.presentation)),
    ].join('\n');
  }

  if (slots.length === 0) return '';

  const paired = content.questioning.pairing === 'paired';

  // The readings that will be asked two-at-a-time, so neither half is told it has buttons behind it.
  const compound = compoundQuestionSlugs(slots, answers, paired);

  // At most this many `short` flags per block. Deterministic, needs no extra read, and it is what
  // actually holds the restraint rule up: a coach shown eleven short readings and told to go back for
  // them is a coach conducting an interview. `unconfirmed` is not capped, because it is an honesty
  // obligation about what the audit now claims the leader said rather than a request for more depth.
  const SHORT_FLAG_CAP = 3;
  let shortFlagsShown = 0;
  let anyFlagged = false;

  /** One reading's line: what it is, and where this run stands on it. */
  const lineFor = (slot: PhaseSlot, indent: string): string => {
    const recorded = answers[slot.slug];
    const need = typedValueNote(slot.dataType);
    const suffix = need.length > 0 ? ` (${need})` : '';
    if (recorded !== undefined) {
      // Presented rather than raw: which of the reading's two strings belongs in a worklist is a
      // policy (`slots/present.ts`), and the capture list is the surface that most wants the tidy one.
      const shown = presentAnswer(slot.slug, recorded, content.presentation);
      let flag = answerFlag(slot.slug, slot.dataType, recorded);
      if (flag === 'short') {
        if (shortFlagsShown >= SHORT_FLAG_CAP) flag = null;
        else shortFlagsShown += 1;
      }
      if (flag !== null) anyFlagged = true;
      // Appended after the closing parenthesis rather than inside it, so the shape every existing
      // reader depends on is unchanged and a flag reads as a note about the reading.
      return `${indent}- ${slot.slug}: captured as "${shown}" (${recorded.sourceType}, confidence ${recorded.confidence})${answerFlagNote(flag)}. ${slot.label}`;
    }
    // A reading whose condition came back the other way is not missing, it is finished. Saying so
    // deterministically is what stops the coach reading the list as permanently unfinished, and it is
    // the difference between "nobody asked" and "this one was never for them".
    const applies = slotApplies(slot.askOnlyIf, answers);
    if (applies === false) {
      return `${indent}- ${slot.slug}: does not apply to this leader, so it is complete as it stands. Do not ask it. ${slot.label}`;
    }
    // Whether this reading is one the leader picks from. Only on the unasked lines, because it is a
    // note about how to *ask*: a reading already captured is not going to be asked again, and telling
    // the coach an answered question has four buttons behind it is an invitation to re-offer them.
    return `${indent}- ${slot.slug}: not yet captured in this audit. ${slot.label}${suffix}${choiceNote(slot.slug, compound.has(slot.slug))}`;
  };

  const byslug = new Map(slots.map((slot) => [slot.slug, slot]));

  /**
   * Which followers get asked inside their anchor's question — the same set `compound` names.
   *
   * A pair whose follower does not apply to this leader is not a pair: asking someone who has a
   * protected deep-work block "and what gets in its way?" is asking about something that does not
   * exist. Nor is a pair whose anchor this audit already holds, because the follower is then the
   * outstanding reading and it is asked on its own. Either way the reading dropped from its group must
   * still appear on the list somewhere, at its own position — silently removing it would leave the
   * coach with no way to tell a reading that is finished from one nobody thought to include, which is
   * the ambiguity this whole mechanism exists to remove.
   *
   * Read off `compound` rather than derived a second time, and that is the point: the header saying
   * "ask these as one question" and the note saying "this one has a fixed set of answers" have to come
   * from the same arithmetic, or the list contradicts itself in the way that put Yes / No under an
   * open question.
   */
  const groupedFollowers = new Set(
    slots
      .filter((slot) => slot.pairedTo !== undefined && compound.has(slot.slug))
      .map((s) => s.slug)
  );

  const lines: string[] = [];
  for (const slot of slots) {
    // A follower asked inside its anchor's question is not listed again at its own position.
    if (groupedFollowers.has(slot.slug)) continue;

    const live = (paired ? (slot.pairedWith ?? []) : []).filter((slug) =>
      groupedFollowers.has(slug)
    );
    if (live.length === 0) {
      lines.push(lineFor(slot, ''));
      continue;
    }

    lines.push('- Ask these as one question, in this order:');
    lines.push(lineFor(slot, '  '));
    for (const slug of live) {
      const follower = byslug.get(slug);
      if (follower !== undefined) lines.push(lineFor(follower, '  '));
    }
  }

  // The reflection is the phase's closing beat, and it is listed with the readings rather than
  // described beside them: the coach reads the capture list as its worklist, and a gate mentioned in
  // a footnote is a gate the model treats as somebody else's problem. It carries its own state
  // because it is the one reading that cannot be inferred and cannot be recorded early.
  //
  // **What it must never say is "once the readings above are captured".** That was the condition, and
  // on phase 1 it cannot be met: the capture list holds nineteen slugs, one of which
  // (`reclaim_current_deep_block_blocker`) exists only for a leader who has *no* protected block, so a
  // leader who has one leaves a slot that will never be filled. The coach read the list as its
  // worklist, found it unfinished, and kept gathering — while the panel beneath the composer promised
  // a question that could therefore never arrive. A phase's closing beat cannot be gated on a list
  // that includes readings which do not apply to this leader.
  //
  // Phase 1 gets a trigger that is an event rather than a count: the reveal. The leader has seen the
  // picture, so the question follows it — that is I12's shape, and the same beat `momentForPhase`
  // opens. Every other phase gets the un-deadlockable wording instead of a threshold, because "enough
  // of the phase has been covered" is a judgement and inventing a fraction to stand in for it would
  // only move the arbitrary line rather than remove it.
  // Phase 3 gets the same shape as phase 1 for the same reason, and it is the one other phase that
  // can have it. Its closing beat is also a picture — the week they designed, drawn over the week they
  // described — and that picture appears on an event rather than at a threshold: the last of the
  // phase's four questions landing. So "the moment is here" is a fact about the run rather than a
  // judgement, and the reflection can be told to follow it. Every other phase keeps the
  // un-deadlockable wording below, because for them "enough has been covered" is a judgement and a
  // fraction invented to stand in for it would only move the arbitrary line.
  const reflectionSlug = reflectionSlugForLeaving(currentPhaseKey);
  const reflectionRecorded = reflectionSlug === null ? undefined : answers[reflectionSlug];

  /**
   * Whether the leader's screen is offering the way onward as this turn is built.
   *
   * The same three conditions the screen ANDs together (`phase-conversation.tsx`): coverage, the
   * reflection where the phase has one (I9), and the chart having been seen where the phase reveals
   * one (I12). Coverage comes from `coach/coverage.ts` so that the two surfaces cannot answer it
   * differently — which they did, silently, until a leader was told they could move on by a coach
   * that had no way of knowing whether they could.
   *
   * Read only. Nothing here writes, and nothing the model says reaches it.
   */
  const wayOnwardOffered =
    phaseCoverage(slots, answers, content.phaseCoveredPercent).covered &&
    (reflectionSlug === null || reflectionRecorded !== undefined) &&
    (currentPhaseKey !== CHART_REVEAL_PHASE || revealed);
  const reflectionDueNow =
    (currentPhaseKey === CHART_REVEAL_PHASE && revealed) ||
    (currentPhaseKey === 'phase-3-ideal' && readIdealWeek(answers, bucketLabels).designComplete);
  const reflectionNote =
    reflectionSlug === null
      ? 'This phase has no reflection pause.'
      : reflectionRecorded !== undefined
        ? `The reflection for this phase is recorded (${reflectionSlug}): "${reflectionRecorded.value}". Do not ask for it again. The leader can change it beside the conversation whenever they like. Whether you may mention moving on is settled below, from what their screen is actually offering; until they take it there is still a question worth asking from the list above.`
        : reflectionDueNow
          ? `This phase closes with the leader's own reflection (${reflectionSlug}), and the phase cannot be left until it is recorded. They have now seen the picture, so that moment is here: ask the question, and ask it before you return to anything on the list above. Readings still missing are not a reason to hold it back. When they answer, offer back what you heard in their own words and record it with record_answers as ${reflectionSlug}. Never infer it and never write it before they have said it: an inferred reflection is refused. Then carry on with the readings that are still open: do not announce that the phase is done. Whether you may mention moving on is settled below, from what their screen is actually offering.`
          : `This phase closes with the leader's own reflection (${reflectionSlug}), and the phase cannot be left until it is recorded. Completing the list is not the condition for closing: some readings only ever apply to some leaders, and waiting for those would be a gate nobody can pass. But a reading nobody asked about is not a reading that does not apply, so cover the substance of this phase first, and where most of it is still unasked, that is a phase that has not happened yet rather than one ready to close. When it has been covered, ask one genuine question, close to "what stands out to you here?", and stop. When they answer, offer back what you heard in their own words and record it with record_answers as ${reflectionSlug}. Never infer it and never write it before they have said it: an inferred reflection is refused. Then carry on with the readings that are still open: do not announce that the phase is done. Whether you may mention moving on is settled below, from what their screen is actually offering.`;

  const cardLines = cardLinesFor(currentPhaseKey, signposts, opens);

  // Chosen from the same list the coach is reading, by the same rules the prose above states, so the
  // two can never point at different readings. See `nextQuestionsFor` for why the choice is made here,
  // and why there are two of them rather than one.
  const nextQuestions = nextQuestionsFor(slots, answers, content.presentation, paired);

  return [
    `This audit is at section ${number} of 6: ${phase.label}.`,
    // The leader's screen calls these sections, and this briefing calls them phases throughout
    // because that is the word the code, the slugs and the run's own state use. Only one of those
    // two is spoken aloud, so the rule is stated once, here, where the count is.
    'The parts of this audit are called sections wherever the leader can see them. Say section to',
    'them, never phase, whatever the rest of this briefing calls it.',
    '',
    ...contentForPhase(currentPhaseKey, content, fundraisingRelevant),
    ...cardLines,
    ...momentForPhase(currentPhaseKey, answers, bucketLabels, content, {
      revealed,
      reflected: reflectionRecorded !== undefined,
    }),
    ...earlierPhaseDigest(currentPhaseKey, answers, bucketLabels, content.presentation),
    '',
    'What this phase captures, and what this run has so far. Anything listed as not yet captured has',
    'not been said in this audit, whatever earlier values appear elsewhere in your context.',
    ...lines,
    '',
    "How to work from this list. Ask about one or two of these at a time, in the leader's own",
    'language, and never read the list out. Record each reading with record_answers as soon as it is',
    'clear, including readings the leader gave in passing while answering something else. Do not ask',
    'again for anything already captured unless the leader revisits it themselves. A slot that needs a',
    'figure or a yes or no is refused without one, so offer a specific value and record it once the',
    'leader agrees. A reading the leader corrects is recorded again with the new value, which',
    'supersedes the old one, so offer that whenever they say a figure looks wrong.',
    'Where you have their own sentence for something, send it as the verbatim alongside your reading of',
    'it, in their words and not tidied. Some of what they say here is read back to them later, and it',
    'should be theirs when it is.',
    '',
    // The failure this paragraph exists for, observed on a live audit: the coach replied "I'll record
    // that you're the Head of Engineering, overseeing 25 people across 5 teams" and made no call, so
    // the panel beside the leader stayed at nought of fifteen while the transcript said otherwise.
    // The system prompt already says to record silently; what it never said is that a sentence about
    // recording is not a recording. Restated here rather than there because this block is rebuilt
    // every turn and sits closest to the readings it governs.
    'Recording is a tool call and it is never a sentence. Saying that you will record something, or',
    'that you have, does nothing at all: the reading exists only once record_answers has run, and the',
    'leader is watching a panel beside this conversation that stays empty until it does. So if a',
    'sentence like "I will record that" is forming, make the call instead, in the same turn as the',
    'answer that prompted it. Do not announce it, do not promise it for later, and do not wait to be',
    'asked.',
    '',
    // This list is a checklist of what is outstanding, and it was being read as a running order.
    // Nothing said to follow the leader, so the coach worked top to bottom and treated anything the
    // leader raised early as a digression to file rather than a door to walk through. Capture was
    // always opportunistic (`record_answers` says to send readings given in passing); only the asking
    // was sequential, and that asymmetry is exactly what made the conversation feel like a form.
    ...(content.questioning.opportunistic
      ? [
          'The order here is not a running order. It is what is still outstanding, so use it to see what',
          'is left rather than to decide what comes next. Let the leader set the route: when something',
          'they say opens onto another reading in this phase, go there while it is live and ask it then,',
          'rather than finishing the one you were on and coming back. Following them is how this stays a',
          'conversation, and the list is what makes it safe to do, because you cannot lose your place in',
          'something that is telling you what is missing.',
          '',
        ]
      : []),
    ...(content.questioning.pairing === 'paired'
      ? [
          'Where the list groups readings as one question, ask them as one question, in one breath, and',
          'in the order given. They are grouped because they are one thing a person would say: how much',
          'time, and what that time is actually like; where they are at their best, and whether the week',
          'protects it. Split apart, the first arrives and the second quietly never does, because a',
          'figure closes cleanly and a description always feels like it can wait. Record each of them',
          'against its own slot when the leader has answered, in one call.',
          '',
        ]
      : []),
    // The coach used to have to work out for itself which missing readings did not apply, from a
    // sentence describing the rule. It now reads that off the list, because the conditions are
    // declared (`SLOT_CONDITIONS` in `coach/phase-slots.ts`) and resolved against this run's own
    // answers. What is left for prose is the part that is a judgement rather than a fact: an unasked
    // reading is not an inapplicable one, and a phase that feels finished is not the same as a phase
    // that has happened.
    // Rendered only when at least one line carries a flag. A paragraph about what to do with short
    // readings, printed for a phase that has none, is an invitation to go hunting for one.
    ...(anyFlagged
      ? [
          'A reading marked short or not yet confirmed is captured, and it counts. Never ask for either',
          'as though it were missing. Short means they answered in a handful of words where the',
          'question was asking what something actually looks like, so you have a note rather than an',
          'account. A short answer is not a bad answer, and some things are genuinely short. Not yet',
          'confirmed means you worked the reading out rather than being told it, and were not very sure',
          'of it, so the audit currently claims something they have not said.',
          'Before this phase closes, go back once to one or two of the short ones and ask what that',
          'time actually looks like, and offer the unconfirmed ones back in your own summary of them so',
          'they can put you right. In their own language, once each, and if they leave it where it is,',
          'leave it there.',
          '',
        ]
      : []),
    'Anything still listed as not yet captured is a question you have not asked. A reading that does',
    'not apply to this leader says so on its own line, so it is not waiting for you and there is',
    'nothing to work out. A phase whose readings are mostly unasked has not been explored, however',
    'comfortably it is going.',
    '',
    // The failure this replaces, observed on a live audit at phase 0 with two readings still
    // outstanding: "We have gathered quite a bit about your current context and priorities. If there
    // is anything else you would like to add or clarify, feel free to do so. Otherwise, when you are
    // ready, you can move on to the next phase." Both halves are wrong in the same way. The open
    // invitation asks a leader to work out what is wanted, which is what they came here not to have
    // to do; and the coach cannot see the button, so it offered a way onward the screen was not
    // showing. The screen is the only thing that knows whether the phase has been covered.
    'So there is always a next question, and it comes from this list. While anything here is still',
    "open, ask about one of them, in the leader's own language rather than read off the list. Where",
    'everything that applies has landed but a reading is thin or you were not sure of it, the question',
    'goes there instead: offer your reading back in your own words for them to put right, or ask what',
    'a kind of time actually looks like. One of those two is always available to you, and the one to',
    'ask is the most useful one you have.',
    '',
    'What must never stand in for it is an open invitation: asking whether there is anything else they',
    'would like to add, or anything they would like to clarify, or anything they have not mentioned.',
    'That hands the work back to the person who came to be taken through this, and they have no way of',
    'knowing what you are waiting for. If you know what is missing, ask for it by name.',
    '',
    // What used to be here was a flat prohibition, resting on "you cannot see that". The coach was
    // told never to mention the move onward, because a turn that announced it would either
    // contradict the screen or close a phase that was still open. It announced it anyway — observed
    // live on phase 5, "whenever you're ready, you can move on to the next section", beside a screen
    // offering nothing, because a reading only the coach could author was holding the gate shut.
    //
    // A rule a model is asked to follow is a rule it follows most of the time, which is the same
    // reasoning that put `runCaptureSweep` and the `offer_choices` fallback where they are. So the
    // ignorance is removed instead of policed: the gate is computed here, from the same module and
    // the same threshold the screen uses (`coach/coverage.ts`), and the coach is told which of the
    // two states it is in. Mentioning the move is now safe in one of them and still refused in the
    // other, and in both cases the coach and the screen are saying the same thing.
    //
    // The direction of trust is unchanged and load-bearing: this reports what is already true and
    // never makes it true. Nothing the model says can open a phase.
    ...(wayOnwardOffered
      ? [
          'Their screen is offering the way onward right now, with what is still open written beside',
          'it. So you may say that moving on is available whenever they are ready, once, plainly, and',
          'only after your question. Do not press it and do not repeat it on later turns: the offer is',
          'on the screen and it is theirs to take. Do not tell them the phase is finished or that you',
          'have gathered enough. What is still open is still worth asking for, and the button does not',
          'mean the conversation is over.',
        ]
      : [
          'Their screen is not offering the way onward yet, so do not tell them the phase is finished,',
          'that you have gathered enough, or that they can move on to the next one. A turn that',
          'announces it contradicts what is in front of them. Moving on is theirs to choose and the',
          'product is what offers it. Your job is the next question.',
        ]),
    '',
    // Three tiers, where there was one. The source's restraint rule ("Do not wait indefinitely or
    // probe repeatedly. The goal is to surface their own insight first, not to run a coaching
    // session") opens by naming its own scope: "at key moments, particularly after presenting the
    // Phase 1 visual and after the gap analysis, ask the client what they are noticing". It governs
    // the reflection pause. Capture is governed by a different passage, which gives no opt-out:
    // "explore each bucket in turn, one at a time, conversationally. For each bucket ask: roughly how
    // many hours per week? What does that time actually look like in practice?"
    //
    // Applying the reflection's restraint to capture is how a two-word answer to the question this
    // phase exists for became something to accept and move past. The three tiers below are the
    // correction, and the limiter in the middle one is not decoration: I18 says a leader who has gone
    // quiet or got emotional is not someone to ask again, and it sits in this paragraph rather than
    // in the system prompt because that is where it has to be read.
    'How hard to press, which is not the same everywhere. Three kinds of thing, and they are',
    'different. Anything the leader is being offered rather than asked, the calendar upload, a',
    'challenge, sharing their results, moving on, is theirs to decline: make the offer once, take no',
    'for an answer without persuading, and do not return to it.',
    '',
    'The readings above are the other kind. They are what this phase is for, so ask them properly, and',
    'where the first answer does not land, ask again in different words. A one-line answer to what a',
    'kind of time actually looks like is a note rather than an account, and going back once is not',
    'doubting them, it is the difference between an audit and a survey. Two things end it and either',
    'one is enough: a leader who says they would rather not, and a leader who has just said something',
    'they are still sitting with. Let it go then, and do not come back to it. An approximate answer is',
    'a real answer, so say you are working with an estimate and move on. Once each. You are asking a',
    'second time because the first did not land, never because you want a fuller record.',
    '',
    // The other half of the change that made the coach open each phase. Opening proactively is worth
    // little if the coach then hands the conversation back: a turn that ends on an observation leaves
    // the leader deciding what this tool wants from them next, and they are here precisely so they do
    // not have to. Every turn therefore closes on something to answer or something to do.
    'End every turn with a question, put last so it is the final thing they read. Not something to',
    'think about and not a place they could go next: a question, about a named reading from the list',
    'above, which is either one nobody has asked yet or one you want to be surer of. Never end on an',
    'observation alone, and never leave the next move to them to work out. Where they have just said',
    'something they are still sitting with, the thing you leave them with can be small, an invitation',
    'to stay with it rather than another question, but it is still yours to offer and it is still',
    'specific. The only turn that ends without a question is one where the leader has asked you to',
    'stop.',
    reflectionNote,
    '',
    // Last, and last on purpose, and now two things rather than one.
    //
    // The instruction to record is already in the system prompt and twice in this block, and it is
    // still the thing that gets dropped. The observed shape of the failure is exact and worth naming:
    // the coach records reliably when a leader opens with a paragraph of facts, and skips when they
    // answer the single question it just asked. "I end up spending more time with the Manchester
    // people to compensate for not being located there" is the whole of
    // `reclaim_profile_distributed_impact`, given in reply to a question about exactly that, and it
    // was not recorded. Neither was "change happens all the time, life at work is chaotic".
    //
    // A model weights the end of its prompt most heavily, and everything above this is context about
    // what to say. These two are the ones about what to *do*, so they go where they will be read last,
    // in the order a turn actually happens: take in what they just said, then ask the next thing.
    // Nothing in either is new; they are the same two rules, put where they land.
    "One last thing, before you write anything at all. Read the leader's last message again and ask",
    'what it just told you. Then record all of it with record_answers, in the same turn, before your',
    'reply. An answer to the question you just asked is the most likely thing to be lost this way,',
    'because it arrives as one sentence rather than a list and it feels like conversation rather than',
    'data. It is both. A turn where the leader answered and nothing was recorded is a turn that threw',
    'their answer away, and they are watching a panel that shows it.',
    '',
    // And the other half. The prose above says a hundred lines earlier that the question comes from
    // the list; this says which one, because the coach was observed reading all of that and ending on
    // "if there is anything else you would like to add or clarify, feel free to do so" regardless.
    ...nextQuestionLines(nextQuestions),
  ].join('\n');
}
