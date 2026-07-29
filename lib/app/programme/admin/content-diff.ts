/**
 * The editable content view, with each field marked against the source document (F10 t-4).
 *
 * **Why a leaf form exists at all** (plan D6). Daybreak already ships a generic module-config form,
 * and F10 should not rebuild what the tier below provides. But that form derives its fields from the
 * Zod schema through a walker that is deliberately bounded to flat primitives and **falls back to a
 * raw JSON textarea for arrays** — and `buckets` and `hourBands` are arrays, which is to say the
 * entire body of Rashmir's content is exactly the part that degrades. "Content editing exists" and
 * "she rewords a bucket without a deploy" turned out to be different sentences. So the leaf owns the
 * *form* and the framework keeps owning everything else: validation, the `ModuleVersion` snapshot,
 * the change summary and the admin audit entry all still happen in `saveModuleConfig`.
 *
 * **Why a divergence marker exists** (plan D7). The I11 guard has two hops — `sources/` →
 * `content-source.md` → the config defaults in code — and both stop at the code. The moment this
 * screen ships, what users read comes from `Module.config` in the database, which no guard covers. So
 * Rashmir edits a bucket description, entirely legitimately, and the running product quietly diverges
 * from the read-only originals with nothing recording it.
 *
 * The answer is to **show** the divergence, not prevent it. I11 exists so that *we* never paraphrase
 * her, not so that *she* cannot revise herself. What it does require is that nobody can rewrite her
 * words and have it look original — a per-field marker plus the framework's version history is
 * exactly that, and it costs a comparison against the code default we already hold.
 */

import { reclaimConfigSchema, type ReclaimConfig } from '@/lib/app/programme/module';
import { RECLAIM_PROCESS_OUTLINE } from '@/lib/app/programme/content';

/**
 * Who wrote a field originally, which decides what "edited" is a statement about.
 *
 * `rashmir` — her words, pinned to `sources/` by the I11 guard. A difference here means she has
 * revised herself, and the marker should say so plainly because that is the fact worth surfacing.
 *
 * `authored` — copy this app wrote: the phase signposts, the calendar orientation. It has no source
 * document, so "differs from source" would be a claim about a thing that does not exist, and worse,
 * it would quietly attribute our writing to her on her own editing screen. That is the inverse of
 * what I11 protects, which is why the distinction is data rather than a comment.
 */
export type ContentSourceKind = 'rashmir' | 'authored';

/** One editable string, and whether it still matches what it started as. */
export interface ContentField {
  /** Dotted path into the config — `buckets.0.title`, `footnote`. The save posts these back. */
  key: string;
  label: string;
  value: string;
  /** False once the stored value differs from the code default the I11 guard pins to `sources/`. */
  matchesSource: boolean;
  sourceKind: ContentSourceKind;
}

export interface ContentBucketView {
  bucketSlug: string;
  title: ContentField;
  description: ContentField;
  /** The benchmark range as Rashmir wrote it ("15–20%", "ceiling 10–15%"). Prose, not the bounds. */
  benchmarkNote: ContentField;
}

export interface ContentSignpostView {
  phaseKey: string;
  involves: ContentField;
  duration: ContentField;
  /** One field per opening beat, so a paragraph of hers stays separately comparable from ours. */
  opening: ContentField[];
}

export interface ContentView {
  buckets: ContentBucketView[];
  bands: Array<{ id: string; label: ContentField }>;
  /** How each phase opens itself, before anyone speaks. */
  signposts: ContentSignpostView[];
  /** The standalone prose fields — the governing frame, the deep-work note, the footnote. */
  prose: ContentField[];
  /**
   * The operator's own numbers, which are not Rashmir's content but are the only other thing she
   * needs to change without a deploy: the stall rule, the anonymity floor, and how much of a phase
   * has to have happened before a leader is offered the next one.
   *
   * They live here because the client list's help text sends her to this screen for them, and a
   * screen that tells you where to change something and then does not offer it is worse than one
   * that stays quiet. They are marked against the defaults like everything else, though "differs
   * from source" means something milder for a threshold than it does for a diagnostic.
   */
  rules: Array<ContentField & { min: number; max: number }>;
  /** How many fields differ from the source, so the page can say so once at the top. */
  editedCount: number;
}

/** The defaults, which the I11 hop-2 test pins character-identical to `content-source.md`. */
function sourceDefaults(): ReclaimConfig {
  return reclaimConfigSchema.parse({});
}

/**
 * Whether a signpost's opening beat started life as Rashmir's writing.
 *
 * Exactly one does: phase 0's second paragraph is her process outline, guarded verbatim by I11
 * hop 2. Everything else in a signpost is our orientation copy.
 *
 * **Asked of the shipped default, never of the stored value.** Authorship is a fact about which
 * field this is, not about whether it has since been edited — so her outline stays marked as hers
 * after she revises it, which is what keeps it in the diverged count that heads the page. Derived
 * from the defaults rather than pinned to an index, so inserting a beat before hers cannot silently
 * re-point the marker at one of ours.
 */
function isRashmirBeat(defaults: ReclaimConfig, phaseKey: string, beat: number): boolean {
  const signpost = defaults.phaseSignposts.find((s) => s.phaseKey === phaseKey);
  return signpost?.opening[beat] === RECLAIM_PROCESS_OUTLINE;
}

function field(
  key: string,
  label: string,
  value: string,
  source: string | undefined,
  sourceKind: ContentSourceKind = 'rashmir'
): ContentField {
  return { key, label, value, matchesSource: value === source, sourceKind };
}

/**
 * Build the view from a stored config. Pure — takes the config rather than reading it — so a test can
 * hand it an edited bucket and assert exactly one field reports as diverged.
 */
export function buildContentView(stored: ReclaimConfig): ContentView {
  const defaults = sourceDefaults();

  const buckets = stored.buckets.map((bucket, index) => {
    // Match the default by slug, not by position: a config that reordered the array must still
    // compare each bucket against its own source text rather than its neighbour's.
    const source = defaults.buckets.find((b) => b.slug === bucket.slug);
    return {
      bucketSlug: bucket.slug,
      title: field(`buckets.${index}.title`, 'Title', bucket.title, source?.title),
      description: field(
        `buckets.${index}.description`,
        'Description',
        bucket.description,
        source?.description
      ),
      benchmarkNote: field(
        `buckets.${index}.benchmarkNote`,
        'Benchmark range',
        bucket.benchmark.note,
        source?.benchmark.note
      ),
    } satisfies ContentBucketView;
  });

  // Bands carry one editable string each. `lowerHours` / `upperHours` are the machine-readable
  // bounds the bands are chosen by, and are deliberately not on this screen: changing a number that
  // decides which message a leader sees is a different act from rewording the message.
  const bands = stored.hourBands.map((band, index) => {
    const source = defaults.hourBands.find((b) => b.slug === band.slug);
    return {
      id: band.slug,
      label: field(`hourBands.${index}.label`, `Band: ${band.slug}`, band.label, source?.label),
    };
  });

  const prose: ContentField[] = [
    field('governingFrame', 'The governing frame', stored.governingFrame, defaults.governingFrame),
    field('deepWorkNote', 'The deep-work note', stored.deepWorkNote, defaults.deepWorkNote),
    field('footnote', 'The summary footnote', stored.footnote, defaults.footnote),
    field(
      'consultationEmail',
      'Where the consultation invitation points',
      stored.consultationEmail,
      defaults.consultationEmail
    ),
  ];

  // How each phase opens itself. Mostly ours, with one exception: phase 0's second beat is Rashmir's
  // process outline, and it is marked as hers so the screen tells the truth about which paragraph is
  // whose. That is exactly why `opening` is an array — the two are separate fields, comparable
  // separately, rather than one paragraph with her sentence buried in it.
  const signposts = stored.phaseSignposts.map((signpost, index) => {
    const source = defaults.phaseSignposts.find((s) => s.phaseKey === signpost.phaseKey);
    return {
      phaseKey: signpost.phaseKey,
      involves: field(
        `phaseSignposts.${index}.involves`,
        'What this phase involves',
        signpost.involves,
        source?.involves,
        'authored'
      ),
      duration: field(
        `phaseSignposts.${index}.duration`,
        'Roughly how long',
        signpost.duration,
        source?.duration,
        'authored'
      ),
      opening: signpost.opening.map((paragraph, beat) =>
        field(
          `phaseSignposts.${index}.opening.${beat}`,
          signpost.opening.length > 1 ? `Opening, part ${beat + 1}` : 'Opening',
          paragraph,
          source?.opening[beat],
          isRashmirBeat(defaults, signpost.phaseKey, beat) ? 'rashmir' : 'authored'
        )
      ),
    } satisfies ContentSignpostView;
  });

  const rules = [
    {
      ...field(
        'abandonedAfterDays',
        'Days of silence before an audit reads as stalled',
        String(stored.abandonedAfterDays),
        String(defaults.abandonedAfterDays),
        'authored'
      ),
      min: 1,
      max: 365,
    },
    {
      ...field(
        'aggregateMinimumCohort',
        'Smallest group an aggregate figure may be shown for',
        String(stored.aggregateMinimumCohort),
        String(defaults.aggregateMinimumCohort),
        'authored'
      ),
      min: 2,
      max: 100,
    },
    {
      ...field(
        'phaseCoveredPercent',
        'How much of a phase must be covered before a leader is offered the next one (%)',
        String(stored.phaseCoveredPercent),
        String(defaults.phaseCoveredPercent),
        'authored'
      ),
      min: 50,
      max: 100,
    },
  ];

  const all = [
    ...buckets.flatMap((b) => [b.title, b.description, b.benchmarkNote]),
    ...bands.map((b) => b.label),
    ...prose,
    ...signposts.flatMap((s) => [s.involves, s.duration, ...s.opening]),
  ];

  // Counted over Rashmir's fields only. The number heads the page as "n fields differ from the
  // source documents", and an edit to our own orientation copy differs from no source document at
  // all — folding it in would make that sentence false and the count useless as a review signal.
  const editedCount = all.filter((f) => !f.matchesSource && f.sourceKind === 'rashmir').length;

  return { buckets, bands, prose, signposts, rules, editedCount };
}

/**
 * Apply `key → value` edits onto a config. Only the paths `buildContentView` emits are honoured;
 * anything else is ignored rather than written, so a hand-crafted request cannot reach a field this
 * form does not expose (the access-policy numbers, the open-signup door). The result is handed to the
 * framework's `saveModuleConfig`, which validates it against the real Zod schema regardless — this is
 * a narrowing, not the validation.
 */
export function applyContentEdits(
  stored: ReclaimConfig,
  edits: Record<string, string>
): ReclaimConfig {
  const next: ReclaimConfig = {
    ...stored,
    buckets: stored.buckets.map((b) => ({ ...b, benchmark: { ...b.benchmark } })),
    hourBands: stored.hourBands.map((b) => ({ ...b })),
    phaseSignposts: stored.phaseSignposts.map((s) => ({ ...s, opening: [...s.opening] })),
  };

  for (const [key, value] of Object.entries(edits)) {
    const signpost = /^phaseSignposts\.(\d+)\.(involves|duration|opening\.(\d+))$/.exec(key);
    if (signpost !== null) {
      const target = next.phaseSignposts[Number(signpost[1])];
      if (target !== undefined) {
        if (signpost[2] === 'involves') target.involves = value;
        else if (signpost[2] === 'duration') target.duration = value;
        else {
          // An opening beat. Only an existing index is written: a save must not be able to grow the
          // array, because a beat with no default behind it has nothing to compare against and would
          // render as permanently diverged copy nobody wrote.
          const beat = Number(signpost[3]);
          if (beat < target.opening.length) target.opening[beat] = value;
        }
      }
      continue;
    }

    const bucket = /^buckets\.(\d+)\.(title|description|benchmarkNote)$/.exec(key);
    if (bucket !== null) {
      const target = next.buckets[Number(bucket[1])];
      if (target !== undefined) {
        if (bucket[2] === 'title') target.title = value;
        else if (bucket[2] === 'description') target.description = value;
        else target.benchmark.note = value;
      }
      continue;
    }

    const band = /^hourBands\.(\d+)\.label$/.exec(key);
    if (band !== null) {
      const target = next.hourBands[Number(band[1])];
      if (target !== undefined) target.label = value;
      continue;
    }

    if (key === 'governingFrame') next.governingFrame = value;
    else if (key === 'deepWorkNote') next.deepWorkNote = value;
    else if (key === 'footnote') next.footnote = value;
    else if (key === 'consultationEmail') next.consultationEmail = value;
    // The numeric rules arrive as strings from a text input. A non-numeric value is DROPPED rather
    // than coerced: `Number('')` is 0 and `Number('abc')` is NaN, and either silently written into
    // the stall rule would make every audit read as stalled, or none. The schema would reject both,
    // but failing here means the rest of a legitimate save is not lost to a stray keystroke.
    else if (
      key === 'abandonedAfterDays' ||
      key === 'aggregateMinimumCohort' ||
      key === 'phaseCoveredPercent'
    ) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed)) {
        if (key === 'abandonedAfterDays') next.abandonedAfterDays = parsed;
        else if (key === 'aggregateMinimumCohort') next.aggregateMinimumCohort = parsed;
        else next.phaseCoveredPercent = parsed;
      }
    }
    // Anything else: deliberately dropped.
  }

  return next;
}
