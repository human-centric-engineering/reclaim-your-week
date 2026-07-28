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
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { readBucketLabels } from '@/lib/app/programme/buckets/labels';
import { loadPhaseProgress } from '@/lib/app/programme/runs/journey';
import { hasCompletedAudit } from '@/lib/app/programme/compare';
import { phaseCaptureSlots } from '@/lib/app/programme/coach/phase-slots';
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
import { signpostFor, type PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import {
  RECLAIM_UNDER_DELEGATION_INVITATION,
  RECLAIM_CALENDAR_OFFER,
  RECLAIM_BUCKETS,
  bucketToken,
} from '@/lib/app/programme/content';

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
        'How to explore an area. Take them one at a time, in this order, and ask two things in the',
        'same breath: roughly how many hours a week go here, and what that time actually looks like in',
        'practice. The second is not optional and it is not a follow-up for later. It is where the',
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
 */
function cardLinesFor(phaseKey: string, signposts: PhaseSignpost[]): string[] {
  const card = signpostFor(phaseKey, signposts.length > 0 ? signposts : undefined);
  if (card === null || card.opening.length === 0) return [];
  return [
    '',
    'The leader has already read this phase on screen, and it said:',
    ...card.opening.map((paragraph) => `"${paragraph}"`),
    'Do not restate any of that. Begin from where it leaves off.',
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
async function closingContext(userId: string, answers: Answers): Promise<string[]> {
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
      `They have said what they are taking away: "${takeaway.value}". Acknowledge it in their own`,
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
  answers: Answers,
  bucketLabels: Record<string, string>,
  revealed: boolean,
  reflected: boolean
): string[] {
  if (phaseKey === CHART_REVEAL_PHASE) {
    // Two beats live in this phase and they run in this order in the source: the calendar branch is
    // offered once every area has a figure (`:136`), and the picture is revealed afterwards (`:229`),
    // whichever way the branch went. So both are assembled here rather than one returning early.
    const parts: string[] = [];
    const uploaded = truthy(answers['reclaim_calendar_uploaded']);
    const completeness = answers['reclaim_calendar_completeness'];
    const everyAreaAnswered = everyVisibleAreaHasHours(answers);

    if (uploaded) {
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
    } else if (everyAreaAnswered) {
      // Gated on the data rather than on the model's sense of "have we finished", so the offer can
      // never arrive halfway through the areas.
      parts.push(
        '',
        'Every area now has a figure, which is the point at which the calendar branch is offered. Offer',
        'it once, close to these words, and take no for an answer without persuading:',
        RECLAIM_CALENDAR_OFFER,
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
        ...(chart.unallocated.length > 0
          ? [
              `No time at all this period: ${chart.unallocated.join(', ')}. Wonder about these gently rather than only noting them.`,
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
                'ask what that time actually looks like. One offer, in their own language, take a no.',
                'Then tell them they can move on to the next phase whenever they are ready. The button',
                'to do that is on their screen and pressing it is theirs.',
              ])
      );
    }

    // The leading '' of each beat is a blank line in the assembled block; there is nothing to strip,
    // because every conditional entry above is spread in rather than pushed as an empty string.
    return parts;
  }

  if (phaseKey === 'phase-4-gap') {
    const lines = gapLines(answers, bucketLabels);
    if (lines.length === 0) return [];
    return [
      '',
      'The gap, in their own figures. Do not recalculate these and do not quote a number that is not',
      'here:',
      ...lines,
      '',
      'Open this phase by putting the two weeks side by side and naming what sits between them, in',
      'these numbers. Their own words about what keeps them up at night and why they are doing this now',
      'are elsewhere in your context: use them here, quoted as they said them, and then ask what they',
      'notice. One question, then stop.',
    ];
  }

  return [];
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
  const revealed = chartRevealed(run.coachOpenings ?? []);

  const { currentPhaseKey } = await loadPhaseProgress(userId, run.id);
  const phase = RECLAIM_PHASES.find((p) => p.key === currentPhaseKey);
  const number = phaseNumber(currentPhaseKey);
  if (phase === undefined || number === null) return '';

  // One read of the run, one of the labels, one of the content, one of the cards, then everything
  // below is arithmetic.
  const [answers, bucketLabels, content, signposts] = await Promise.all([
    readRunAnswers(userId, run.id),
    readBucketLabels(userId).catch(() => ({})),
    readReclaimCoachContent(),
    readReclaimSignposts().catch(() => []),
  ]);

  const fundraisingRelevant = truthy(answers[FUNDRAISING_RELEVANT]);
  const slots = phaseCaptureSlots(currentPhaseKey, { fundraisingRelevant, bucketLabels });

  // The summary phase captures nothing conversationally — the coach may not write a reflection or a
  // sharing choice — but it is not silent. It asks the takeaway before the artifact exists, and it
  // closes. So it gets its own block rather than the capture list's early exit.
  if (currentPhaseKey === FINAL_PHASE_KEY) {
    return [
      `This audit is at phase ${number} of 6: ${phase.label}.`,
      '',
      ...contentForPhase(currentPhaseKey, content, fundraisingRelevant),
      ...cardLinesFor(currentPhaseKey, signposts),
      ...(await closingContext(userId, answers)),
    ].join('\n');
  }

  if (slots.length === 0) return '';

  const lines = slots.map((slot) => {
    const recorded = answers[slot.slug];
    const need = typedValueNote(slot.dataType);
    const suffix = need.length > 0 ? ` (${need})` : '';
    if (recorded === undefined) {
      return `- ${slot.slug}: not yet captured in this audit. ${slot.label}${suffix}`;
    }
    return `- ${slot.slug}: captured as "${recorded.value}" (${recorded.sourceType}, confidence ${recorded.confidence}). ${slot.label}`;
  });

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
  const reflectionSlug = reflectionSlugForLeaving(currentPhaseKey);
  const reflectionRecorded = reflectionSlug === null ? undefined : answers[reflectionSlug];
  const reflectionDueNow = currentPhaseKey === CHART_REVEAL_PHASE && revealed;
  const reflectionNote =
    reflectionSlug === null
      ? 'This phase has no reflection pause.'
      : reflectionRecorded !== undefined
        ? `The reflection for this phase is recorded (${reflectionSlug}): "${reflectionRecorded.value}". Do not ask for it again. The leader can change it beside the conversation whenever they like, and the move to the next phase is theirs to take.`
        : reflectionDueNow
          ? `This phase closes with the leader's own reflection (${reflectionSlug}), and the phase cannot be left until it is recorded. They have now seen the picture, so that moment is here: ask the question, and ask it before you return to anything on the list above. Readings still missing are not a reason to hold it back. When they answer, offer back what you heard in their own words and record it with record_answers as ${reflectionSlug}. Never infer it and never write it before they have said it: an inferred reflection is refused. Then leave the move to the next phase to them.`
          : `This phase closes with the leader's own reflection (${reflectionSlug}), and the phase cannot be left until it is recorded. Completing the list is not the condition for closing: some readings only ever apply to some leaders, and waiting for those would be a gate nobody can pass. But a reading nobody asked about is not a reading that does not apply, so cover the substance of this phase first, and where most of it is still unasked, that is a phase that has not happened yet rather than one ready to close. When it has been covered, ask one genuine question, close to "what stands out to you here?", and stop. When they answer, offer back what you heard in their own words and record it with record_answers as ${reflectionSlug}. Never infer it and never write it before they have said it: an inferred reflection is refused. Then leave the move to the next phase to them.`;

  const cardLines = cardLinesFor(currentPhaseKey, signposts);

  return [
    `This audit is at phase ${number} of 6: ${phase.label}.`,
    '',
    ...contentForPhase(currentPhaseKey, content, fundraisingRelevant),
    ...cardLines,
    ...momentForPhase(
      currentPhaseKey,
      answers,
      bucketLabels,
      revealed,
      reflectionRecorded !== undefined
    ),
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
    '',
    // Two different reasons a reading is missing, and they were being treated as one. Some readings
    // genuinely do not apply — a leader who has a protected deep-work block is never asked what gets
    // in its way — and holding a phase open for those would be a gate nobody can pass. But "not yet
    // captured" mostly means "not yet asked", and the guidance that stopped the list being a gate
    // was read as licence to leave two thirds of it alone.
    'Two things can put a reading in the "not yet captured" list, and they are not the same. Some do',
    'not apply to this leader. Nobody with a protected deep-work block is asked what gets in its way,',
    'and those are complete as they are. Everything else is simply a question you have not asked',
    'yet, and a phase whose readings are mostly unasked has not been explored, however comfortably it',
    'is going. Before you say this phase is done, look at what is still missing, and offer the ones',
    "that were never asked: name two or three of them in the leader's own language rather than",
    'reading the list out, and take a no. Then say so and leave the decision to move on to them.',
    reflectionNote,
  ].join('\n');
}
