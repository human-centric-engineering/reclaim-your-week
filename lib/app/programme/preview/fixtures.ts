/**
 * Canned content for fabricated preview audits (F19). Pure — no Prisma, no model.
 *
 * ## What this is for
 *
 * Everything in a finished audit falls out of the slot values a fabricator writes, except one field:
 * `ReclaimAuditRun.analystReading` (the column kept its name; the agent that fills it did not), which
 * is the only part of the report a language model produces.
 * Pre-writing it is what lets a fast-forwarded audit reach a complete, renderable state without
 * spending money on a provider call — `ensureReportReading` is write-once and returns early when the
 * column is already set, which `scripts/smoke/reclaim-report.ts` has relied on since F7.
 *
 * ## Why the reading is derived rather than written out
 *
 * `parseReportReading` refuses a gap anchored to an area the run's own buckets do not contain
 * (`report/reading.ts`, reached through `summary.ts`'s token set). A hard-coded token list would
 * therefore be correct only for as long as the fabricator's hour map stayed the same, and the day
 * somebody changed which buckets get filled in the fixture would be the day the summary quietly lost
 * its reading — with a refusal in the log and two empty panels on screen.
 *
 * So the gaps are computed from the hours actually written. The tokens can only be ones present, and
 * the observations describe the numbers they are about, which is also what makes a fabricated summary
 * worth looking at: an operator reviewing the screen sees prose that matches the chart beside it.
 *
 * ## The prose rules this has to clear
 *
 * `offends()` refuses a banned-lexicon term, a U+2014 em dash, or an imperative opener, and the three
 * fields have length caps (220 / 160 / 200). Everything below is written to the same register as the
 * fixture in `smoke/reclaim-report.ts`, which passes today. Two consequences worth naming, because
 * they look like style and are not:
 *   - **No em dash anywhere in this file's strings.** Use a comma or a full stop.
 *   - **No step may begin with a verb.** "Two protected mornings a week" is a step; "Protect two
 *     mornings" is the tool telling a leader what to do, which is the thing I1 exists to prevent.
 *
 * This file is listed in `COACH_VOICED` in `tests/unit/invariants/product-voice.test.ts`, because a
 * tester reads this prose in the summary and in the PDF exactly as a leader would.
 */

/** One area's hours, as the fabricator wrote them. */
export interface PreviewHours {
  current: number;
  ideal: number;
}

export interface PreviewGap {
  token: string;
  observation: string;
}

export interface PreviewStep {
  horizon: 'now' | 'next' | 'later';
  step: string;
  difference: string;
}

/** One chapter of the arc, in the shape `parseReportReading` accepts. */
export interface PreviewChapter {
  section: 'the_week' | 'what_you_chose' | 'what_you_take';
  paragraphs: string[];
}

export interface PreviewReading {
  chapters: PreviewChapter[];
  gaps: PreviewGap[];
  pathway: PreviewStep[];
  closing: string;
}

/** How many gaps to name. `parseReportReading` accepts two to four; two is the honest minimum. */
const GAP_COUNT = 2;

/**
 * Hours in words, so an observation reads as prose rather than as a data dump.
 *
 * Words rather than digits because that is the register the report writes in, and because a single
 * sentence must not mix the two: "holds 22 hours, where ten was the intention" is the seam between two
 * styles showing. Compounds are built from these up to ninety-nine, which covers any hours a week can
 * hold; above that, digits, on the grounds that a sentence saying "104" beats one saying nothing.
 */
const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
] as const;

const TENS: Record<number, string> = {
  20: 'twenty',
  30: 'thirty',
  40: 'forty',
  50: 'fifty',
  60: 'sixty',
  70: 'seventy',
  80: 'eighty',
  90: 'ninety',
};

function inWords(n: number): string {
  const rounded = Math.round(n);
  const unit = UNITS[rounded];
  if (unit !== undefined) return unit;

  const tens = TENS[Math.floor(rounded / 10) * 10];
  const remainder = rounded % 10;
  if (tens === undefined) return String(rounded);
  // "twenty two", not "twenty-two": the hyphen is correct English but reads as a range in a sentence
  // full of hour counts, and the reading's own fixture established the spaced form.
  return remainder === 0 ? tens : `${tens} ${UNITS[remainder]}`;
}

/** The area title as prose, from its token. `deep_work` reads as "Deep work". */
function areaPhrase(token: string): string {
  const words = token.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A reading in the report agent's shape, anchored to the two largest gaps in the hours supplied.
 *
 * Largest-gap-first rather than an arbitrary two, because that is what the real agent is asked to
 * do, and because a fabricated report whose observations pick out the wrong areas is a worse test
 * artefact than one that picks the right ones: the whole point of looking at the screen is to judge
 * whether it reads coherently.
 *
 * Returns `null` when fewer than `GAP_COUNT` areas were supplied. A caller with too little to say
 * should write no reading at all and let the summary show its own "not generated" state, rather than
 * pad the section with invented areas.
 */
export function previewReportReading(
  hoursByToken: Readonly<Record<string, PreviewHours>>
): PreviewReading | null {
  const ranked = Object.entries(hoursByToken)
    .map(([token, hours]) => ({ token, ...hours, gap: Math.abs(hours.current - hours.ideal) }))
    // Ties broken by token so the fixture is deterministic. A fabricator that produced a different
    // reading on each run would make a screenshot impossible to compare against the last one.
    .sort((a, b) => b.gap - a.gap || a.token.localeCompare(b.token))
    .slice(0, GAP_COUNT);

  if (ranked.length < GAP_COUNT) return null;

  const gaps = ranked.map(({ token, current, ideal }) => ({
    token,
    observation:
      current < ideal
        ? `${areaPhrase(token)} sits at ${inWords(current)} hours against the ${inWords(ideal)} you wanted.`
        : `${areaPhrase(token)} holds ${inWords(current)} hours of the week, where ${inWords(ideal)} was the intention.`,
  }));

  return {
    // Two chapters short of the real thing's minimum, and that is the honest fixture: a fabricator
    // that wrote a leader's narrative would be inventing the one part of this document that is
    // supposed to come from what somebody actually said. An operator looking at a preview sees the
    // structure and the register; they do not see a life story nobody lived.
    chapters: [
      {
        section: 'the_week' as const,
        paragraphs: [
          'This is a fabricated preview, so the chapters a real report would carry are not written here. The figures, the areas and the shape of the page are all real.',
        ],
      },
      {
        section: 'what_you_chose' as const,
        paragraphs: [
          'A real report writes this chapter from what the leader said they were starting, and from what they said they would put down to make room for it.',
        ],
      },
      {
        section: 'what_you_take' as const,
        paragraphs: [
          'And it closes on their own words about what they are taking away, which are the last word on their own audit.',
        ],
      },
    ],
    closing: 'A preview, so this line stands in for the one a leader would read.',
    gaps,
    // Fixed, and deliberately generic. A pathway derived from the numbers would be the fabricator
    // pretending to reason, and this content is only ever read by somebody checking that the screen
    // renders. The register is what matters: noun phrases, nothing beginning with a verb.
    pathway: [
      {
        horizon: 'now',
        step: 'Two protected mornings a week',
        difference: 'Room to think before the day starts asking.',
      },
      {
        horizon: 'next',
        step: 'One recurring meeting handed over',
        difference: 'Two hours back, and somebody else grows into it.',
      },
      {
        horizon: 'later',
        step: 'A standing monthly review of where the week went',
        difference: 'The drift gets noticed while it is still small.',
      },
    ],
  };
}
