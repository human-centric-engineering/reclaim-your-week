/**
 * What Rashmir's draft becomes (F18 t-1) — the editable fields, arranged by where they land.
 *
 * The content editor proves *what* changed: every field carries a marker against its source document
 * and every save is versioned and attributed (I11's third hop). What it has never shown is *what the
 * change becomes* — a signpost is edited as a bare string in a text input, and the only place to read
 * it as a leader reads it was a leader's screen, after saving.
 *
 * **Built from the editor's own field list, not from the config.** The input is the flattened
 * `ContentView` the form already renders plus its unsaved drafts, which buys two properties worth more
 * than the convenience: a field the editor does not expose cannot appear in the preview, and a draft
 * previews with nothing written to the database.
 *
 * **And it says where each field actually goes**, because for some of Rashmir's writing the honest
 * answer is "the coach, and never a leader's screen". The area descriptions are confidential by
 * instruction (`coach/phase-context.ts` tells the coach to recognise what it hears with them and never
 * to quote them), so `reach: 'coach'` is not a gap in those cases, it is the design. Where it *is* a
 * gap — the area titles, which a leader reads on every chart while the config's copy reaches only the
 * model — that is [[post-v1#P25]], found by building this.
 */

import { RECLAIM_PHASES } from '@/lib/app/programme/map';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import type { ContentField, ContentView } from '@/lib/app/programme/admin/content-diff';

/**
 * Where a field lands.
 *
 * `screen` — a leader reads these words, character for character, on a page.
 * `coach` — the model is given them as briefing for the conversation. A leader meets them only as
 *   whatever the coach makes of them, which is why the preview shows them as briefing rather than
 *   pretending to render a screen that does not exist.
 */
export type ContentReach = 'screen' | 'coach';

/** One previewed string: the draft text, and the honest statement of where it goes. */
export interface PreviewLine {
  /** The editor field this came from, so a preview block can be traced to the input above it. */
  key: string;
  label: string;
  text: string;
  reach: ContentReach;
}

/** A phase as it opens itself, ready for the leader's own `<Signpost>`. */
export interface PreviewPhase {
  phaseKey: string;
  /** The section number a leader sees beside the phase label. */
  index: number;
  label: string;
  signpost: PhaseSignpost;
}

/** One area, as the leader's list draws it and as the coach is briefed on it. */
export interface PreviewArea {
  slug: string;
  title: PreviewLine;
  description: PreviewLine;
  benchmarkNote: PreviewLine;
}

export interface ContentPreview {
  phases: PreviewPhase[];
  areas: PreviewArea[];
  /** The summary document's own words: the footnote a leader reads under their audit. */
  summary: PreviewLine[];
  /** The frame, the deep-work note and the bands — briefing, every one of them. */
  briefing: PreviewLine[];
  /**
   * Editor fields this preview deliberately shows nothing for, by key.
   *
   * The three numeric rules: a threshold has no rendering, and inventing one ("this is what a stalled
   * badge looks like") would be a picture of the product rather than a preview of her words. Named
   * rather than silently dropped, so the guard below can insist every other field is previewed.
   */
  notPreviewed: string[];
}

/**
 * The label and the section number beside a phase, taken from the **map**.
 *
 * `RECLAIM_PHASES` is what a leader actually reads: the journey read serves those labels
 * (`runs/journey.ts`) and the shell hands them to `<Signpost>` with the array index as the section
 * number. Copying them here to save an import is exactly how a preview starts describing a screen
 * nobody has. Falls back to the key for a phase the config carries and the map has dropped, so an
 * orphaned signpost previews as itself rather than disappearing.
 */
function phaseLabelFor(phaseKey: string): { index: number; label: string } {
  const found = RECLAIM_PHASES.findIndex((p) => p.key === phaseKey);
  if (found === -1) return { index: 0, label: phaseKey };
  return { index: found, label: RECLAIM_PHASES[found]?.label ?? phaseKey };
}

/** The draft value for a field, or its stored value where it has not been touched. */
function draftOf(field: ContentField, drafts: Record<string, string>): string {
  return drafts[field.key] ?? field.value;
}

function line(
  field: ContentField,
  drafts: Record<string, string>,
  reach: ContentReach
): PreviewLine {
  return { key: field.key, label: field.label, text: draftOf(field, drafts), reach };
}

/**
 * The preview, from the editor's view and its unsaved drafts.
 *
 * Pure, so a test can hand it one edited field and assert exactly that field's preview moved. Every
 * key the view emits appears in exactly one block or in `notPreviewed` —
 * `content-preview.test.ts` asserts it, which is what stops a field added to the editor later from
 * quietly having nowhere to be read.
 */
export function buildContentPreview(
  view: ContentView,
  drafts: Record<string, string> = {}
): ContentPreview {
  const phases: PreviewPhase[] = view.signposts.map((signpost) => {
    const { index, label } = phaseLabelFor(signpost.phaseKey);
    return {
      phaseKey: signpost.phaseKey,
      index,
      label,
      signpost: {
        phaseKey: signpost.phaseKey,
        involves: draftOf(signpost.involves, drafts),
        duration: draftOf(signpost.duration, drafts),
        opening: signpost.opening.map((beat) => draftOf(beat, drafts)),
      },
    };
  });

  const areas: PreviewArea[] = view.buckets.map((bucket) => ({
    slug: bucket.bucketSlug,
    // The title is marked `screen` because a leader reads an area name on the chart, in the summary
    // table and in the PDF. That is what a leader reads; whether they read *this* string is P25.
    title: line(bucket.title, drafts, 'screen'),
    description: line(bucket.description, drafts, 'screen'),
    // The range in her own words is given to the coach and rendered nowhere. The editor's help text
    // said otherwise until this task; see the plan's "what the build found".
    benchmarkNote: line(bucket.benchmarkNote, drafts, 'coach'),
  }));

  const summary = view.prose
    // `consultationEmail` is an address, not prose, and previewing it as a sentence a leader reads
    // would be the same category error as previewing a threshold.
    .filter((field) => field.key === 'footnote')
    .map((field) => line(field, drafts, 'screen'));

  const briefing: PreviewLine[] = [
    ...view.prose
      .filter((field) => field.key === 'governingFrame' || field.key === 'deepWorkNote')
      .map((field) => line(field, drafts, 'coach')),
    ...view.bands.map((band) => line(band.label, drafts, 'coach')),
  ];

  const notPreviewed = [
    ...view.rules.map((rule) => rule.key),
    ...view.prose.filter((field) => field.key === 'consultationEmail').map((field) => field.key),
  ];

  return { phases, areas, summary, briefing, notPreviewed };
}

/** Every editable key the view carries — the denominator the preview's coverage is asserted against. */
export function editableKeys(view: ContentView): string[] {
  return [
    ...view.buckets.flatMap((b) => [b.title.key, b.description.key, b.benchmarkNote.key]),
    ...view.bands.map((b) => b.label.key),
    ...view.prose.map((f) => f.key),
    ...view.signposts.flatMap((s) => [
      s.involves.key,
      s.duration.key,
      ...s.opening.map((o) => o.key),
    ]),
    ...view.rules.map((r) => r.key),
  ];
}

/** Every key the preview actually shows, in the order the panel renders them. */
export function previewedKeys(preview: ContentPreview, view: ContentView): string[] {
  const signpostKeys = view.signposts.flatMap((s) => [
    s.involves.key,
    s.duration.key,
    ...s.opening.map((o) => o.key),
  ]);
  return [
    // The phase block renders a whole signpost, so its coverage is the fields that composed it.
    ...(preview.phases.length > 0 ? signpostKeys : []),
    ...preview.areas.flatMap((a) => [a.title.key, a.description.key, a.benchmarkNote.key]),
    ...preview.summary.map((l) => l.key),
    ...preview.briefing.map((l) => l.key),
  ];
}
