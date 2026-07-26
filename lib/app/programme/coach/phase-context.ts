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
import { phaseCaptureSlots } from '@/lib/app/programme/coach/phase-slots';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';
import { phaseNumber, reflectionSlugForLeaving } from '@/lib/app/programme/runs/phases';
import { truthy } from '@/lib/app/programme/chart/series';
import { readReclaimCoachContent, type ReclaimCoachContent } from '@/lib/app/programme/config';
import { RECLAIM_UNDER_DELEGATION_INVITATION } from '@/lib/app/programme/content';

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

  // One read of the run, one of the labels, one of the content, then everything below is arithmetic.
  const [answers, bucketLabels, content] = await Promise.all([
    readRunAnswers(userId, run.id),
    readBucketLabels(userId).catch(() => ({})),
    readReclaimCoachContent(),
  ]);

  const fundraisingRelevant = truthy(answers[FUNDRAISING_RELEVANT]);
  const slots = phaseCaptureSlots(currentPhaseKey, { fundraisingRelevant, bucketLabels });
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

  return [
    `This audit is at phase ${number} of 6: ${phase.label}.`,
    '',
    ...contentForPhase(currentPhaseKey, content, fundraisingRelevant),
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
