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
 * **It names the refusals rather than letting the coach discover them.** A typed slot refuses prose,
 * and reflections and sharing consent refuse the coach entirely (I6). Each of those is a wasted turn
 * if the coach learns it from an error, so the block states them up front.
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
      parts.push('', 'On deep work, which cuts across the others:', content.deepWorkNote);
    }
  }

  if (phaseKey === 'phase-4-gap') {
    parts.push(
      '',
      'The total-hours bands, for reading what their weekly total means:',
      ...content.hourBands.map(
        (band) => `- ${band.lowerHours} to ${band.upperHours ?? 'more'} hours: ${band.label}`
      ),
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
    'This is the close. Nothing here is captured by you: the summary is produced on screen, the',
    "sharing choices are the leader's consent to give, and the takeaway below is theirs to save.",
  ];

  if (takeaway === undefined) {
    parts.push(
      '',
      'They have not yet written what they are taking away, and the summary does not appear until they',
      'have. Ask them, once, and let it land. You may offer their own words back for them to save. Do',
      'not produce a summary of the audit yourself and do not list what they should have learned.'
    );
  } else {
    parts.push(
      '',
      `They have written what they are taking away: "${takeaway.value}". Acknowledge it in their own`,
      'words. Do not improve on it.'
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
  bucketLabels: Record<string, string>
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
        'When they arrive at this moment, name what the figures show, specifically and in numbers. Then',
        'ask one question, close to "what stands out to you here?", and stop. Do not interpret, do not',
        'add observations, and do not move them on. After they answer, acknowledge what they noticed and',
        'only then add what they may have missed.'
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
    select: { id: true },
  });
  if (run === null) return '';

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

  const reflectionSlug = reflectionSlugForLeaving(currentPhaseKey);
  const reflectionNote =
    reflectionSlug === null
      ? 'This phase has no reflection pause.'
      : `Before this phase can be left, the leader records their own reflection (${reflectionSlug}) on screen. You may ask what they notice and offer their words back, and only they can save it.`;

  const cardLines = cardLinesFor(currentPhaseKey, signposts);

  return [
    `This audit is at phase ${number} of 6: ${phase.label}.`,
    '',
    ...contentForPhase(currentPhaseKey, content, fundraisingRelevant),
    ...cardLines,
    ...momentForPhase(currentPhaseKey, answers, bucketLabels),
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
    'leader agrees. When every reading here is captured, say so and leave the decision to move on to',
    'them.',
    reflectionNote,
  ].join('\n');
}
