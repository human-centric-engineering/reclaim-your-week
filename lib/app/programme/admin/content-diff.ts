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

/** One editable string, and whether it still matches the source document. */
export interface ContentField {
  /** Dotted path into the config — `buckets.0.title`, `footnote`. The save posts these back. */
  key: string;
  label: string;
  value: string;
  /** False once the stored value differs from the code default the I11 guard pins to `sources/`. */
  matchesSource: boolean;
}

export interface ContentBucketView {
  bucketSlug: string;
  title: ContentField;
  description: ContentField;
  /** The benchmark range as Rashmir wrote it ("15–20%", "ceiling 10–15%"). Prose, not the bounds. */
  benchmarkNote: ContentField;
}

export interface ContentView {
  buckets: ContentBucketView[];
  bands: Array<{ id: string; label: ContentField }>;
  /** The standalone prose fields — the governing frame, the deep-work note, the footnote. */
  prose: ContentField[];
  /**
   * The operator's own numbers, which are not Rashmir's content but are the only other thing she
   * needs to change without a deploy: the stall rule and the anonymity floor.
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

function field(
  key: string,
  label: string,
  value: string,
  source: string | undefined
): ContentField {
  return { key, label, value, matchesSource: value === source };
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

  const rules = [
    {
      ...field(
        'abandonedAfterDays',
        'Days of silence before an audit reads as stalled',
        String(stored.abandonedAfterDays),
        String(defaults.abandonedAfterDays)
      ),
      min: 1,
      max: 365,
    },
    {
      ...field(
        'aggregateMinimumCohort',
        'Smallest group an aggregate figure may be shown for',
        String(stored.aggregateMinimumCohort),
        String(defaults.aggregateMinimumCohort)
      ),
      min: 2,
      max: 100,
    },
  ];

  const all = [
    ...buckets.flatMap((b) => [b.title, b.description, b.benchmarkNote]),
    ...bands.map((b) => b.label),
    ...prose,
  ];

  return { buckets, bands, prose, rules, editedCount: all.filter((f) => !f.matchesSource).length };
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
  };

  for (const [key, value] of Object.entries(edits)) {
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
    // The two numeric rules arrive as strings from a text input. A non-numeric value is DROPPED
    // rather than coerced: `Number('')` is 0 and `Number('abc')` is NaN, and either silently written
    // into the stall rule would make every audit read as stalled, or none. The schema would reject
    // both, but failing here means the rest of a legitimate save is not lost to a stray keystroke.
    else if (key === 'abandonedAfterDays' || key === 'aggregateMinimumCohort') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed)) {
        if (key === 'abandonedAfterDays') next.abandonedAfterDays = parsed;
        else next.aggregateMinimumCohort = parsed;
      }
    }
    // Anything else: deliberately dropped.
  }

  return next;
}
