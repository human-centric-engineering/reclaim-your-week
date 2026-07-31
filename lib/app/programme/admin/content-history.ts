/**
 * The content editor's own version history, and the way back to a previous one.
 *
 * The framework has kept a `ModuleVersion` snapshot behind every content save since F10 t-4, and the
 * editor has always *demanded* a change summary for it — a required field whose whole justification
 * is that "version history without it is a list of anonymous diffs". The list it was feeding was
 * reachable only from the framework's own module screen, two tiers down and phrased in that tier's
 * vocabulary (module config, JSON snapshots, restore). So the person writing the summaries was the
 * one person who could not see them, and "every version is kept" was a promise the screen made and
 * did not show. This module is the leaf's reading of that history, in the words of the screen that
 * wrote it.
 *
 * **Nothing here writes.** `restoreContentVersion` forwards to the framework's `restoreModuleVersion`
 * for the same reason the save forwards to `saveModuleConfig` (plan D6): re-validation against the
 * *current* schema, the new snapshot, the audit entry. A restore rolls history **forward** — the old
 * config is written back and snapshotted as a new version — so a restore is itself reversible and
 * nothing is ever lost by taking one.
 *
 * **What changed, in her words rather than in paths.** A version is only readable as history if it
 * says which writing moved — and naming the field is not saying it. "Setup: roughly how long" tells
 * an operator where to look, not what it now says, so every change carries the wording on both sides.
 * `buildContentView` already enumerates every editable field with a label, so diffing two snapshots
 * is a walk over two views comparing values by key — no second description of the content shape to
 * keep in step with the first.
 *
 * **Version 0 is the wording as supplied**, and it is synthetic. `ModuleVersion` counts from 1 and
 * its first row is written by the first save, so the state every save departed from — Rashmir's
 * documents as they were handed over — is the one thing a list of stored snapshots cannot show.
 * `sourceDefaults()` is that state, and it is both listed and restorable, so a screen whose whole
 * promise is "nothing here is ever lost" is not quietly missing the original.
 */

import { prisma } from '@/lib/db/client';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';
import { reclaimConfigSchema, RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import {
  buildContentView,
  applyContentEdits,
  sourceDefaults,
} from '@/lib/app/programme/admin/content-diff';
import { readStoredContent, saveStoredContent } from '@/lib/app/programme/admin/content-config';
import {
  listModuleVersions,
  restoreModuleVersion,
} from '@/lib/framework/modules/config/version-service';

/**
 * The version number of the wording as supplied — the state before anyone edited anything.
 *
 * It is not a stored row. `ModuleVersion` counts from 1 and its first entry is written by the first
 * *save*, so the thing every one of those saves departed from has no snapshot of its own. The config
 * defaults are that snapshot, pinned character-identical to `content-source.md` by the I11 hop-2
 * guard, so the list can show it and the restore can write it back without inventing anything.
 */
export const CONTENT_BASELINE_VERSION = 0;

/**
 * How many changed fields a version describes in full before it starts merely counting them.
 *
 * Every history row carries the *wording* on both sides of its change, because "Setup: roughly how
 * long" names a field without saying what it now says — which was the whole complaint about a diff
 * that lists paths. Restoring version 0 over a heavily edited config is the one save that can move
 * forty-odd fields at once, and putting forty before-and-afters on the wire for each of twenty-five
 * rows is a page weight no one asked for. The first twelve are described; the rest are counted.
 */
const DESCRIBED_CHANGES = 12;

/** One field's wording, before and after a version moved it. */
export interface ContentFieldChange {
  /** The field's label, qualified by its group — "Ideal week: roughly how long". */
  label: string;
  /** What it said before. Null for a field the previous snapshot did not have at all. */
  from: string | null;
  /** What it says in this version. */
  to: string;
}

/** One saved version, as this screen tells it. */
export interface ContentVersionRow {
  version: number;
  /** True for the synthetic version 0 — the wording as supplied, which nobody saved. */
  isBaseline: boolean;
  /** Required by the editor, optional in the framework — hence nullable for versions saved elsewhere. */
  changeSummary: string | null;
  /** Null for the baseline, which was shipped rather than saved and so has no moment. */
  savedAt: string | null;
  /** Who saved it, or null once that admin's own account has been erased. */
  savedByName: string | null;
  /** True for the version that is live. Always the newest: history rolls forward, never rewinds. */
  isCurrent: boolean;
  /**
   * The content fields whose wording differs from the version before it, with both readings. Empty
   * for a version with nothing behind it to compare against, and empty for a save that moved
   * something this screen does not show — which `changedElsewhere` is what distinguishes from a save
   * that moved nothing at all.
   */
  changes: ContentFieldChange[];
  /** Fields that also moved but are past `DESCRIBED_CHANGES`: counted rather than quoted. */
  moreChanged: number;
  /** A version that changed the module's config but no wording on this screen. */
  changedElsewhere: boolean;
  /**
   * A snapshot that no longer parses against the current schema. It is listed rather than hidden — an
   * unreadable version is a fact about the history — but it cannot be diffed, and the framework will
   * refuse to restore it.
   */
  unreadable: boolean;
}

/** The phase's human name, so a changed opening reads as "Ideal week" rather than as an index. */
function phaseLabel(phaseKey: string): string {
  return RECLAIM_PHASES.find((phase) => phase.key === phaseKey)?.label ?? phaseKey;
}

/**
 * Every editable field of a config as `key → (label, value)`, with the labels qualified.
 *
 * `buildContentView` labels a bucket's fields "Title" and "Description" because the form draws them
 * under the bucket they belong to, and the position says the rest. A history line has no position to
 * lean on: nine "Description" entries would be a diff that tells you nothing. So the group's own name
 * is carried into the label here rather than changed in the view, because the form is right.
 */
function labelledFields(config: unknown): Map<string, { label: string; value: string }> {
  const parsed = reclaimConfigSchema.safeParse(config);
  if (!parsed.success) return new Map();

  const view = buildContentView(parsed.data);
  const out = new Map<string, { label: string; value: string }>();
  const add = (label: string, field: { key: string; value: string }) =>
    out.set(field.key, { label, value: field.value });

  for (const bucket of view.buckets) {
    const name = bucket.title.value;
    add(`${name}: title`, bucket.title);
    add(`${name}: description`, bucket.description);
    add(`${name}: benchmark range`, bucket.benchmarkNote);
  }
  for (const signpost of view.signposts) {
    const name = phaseLabel(signpost.phaseKey);
    add(`${name}: what this phase involves`, signpost.involves);
    add(`${name}: roughly how long`, signpost.duration);
    for (const beat of signpost.opening) add(`${name}: ${beat.label.toLowerCase()}`, beat);
  }
  for (const band of view.bands) add(band.label.label, band.label);
  for (const field of view.prose) add(field.label, field);
  for (const field of view.rules) add(field.label, field);

  return out;
}

/**
 * The fields that differ between two snapshots, newer read against older, with both readings.
 *
 * A field the older snapshot did not have counts as changed and reports `from: null`; one the newer
 * has dropped does not, on the grounds that a history line describes what the version *says*.
 * Neither happens today — the shape is fixed by the schema — but a later schema that grows a bucket
 * should not need this revisited.
 */
function changesBetween(newer: unknown, older: unknown): ContentFieldChange[] {
  const a = labelledFields(newer);
  const b = labelledFields(older);
  if (a.size === 0) return [];

  const changes: ContentFieldChange[] = [];
  for (const [key, field] of a) {
    const before = b.get(key);
    if (before?.value !== field.value) {
      changes.push({ label: field.label, from: before?.value ?? null, to: field.value });
    }
  }
  return changes;
}

/** The wording as supplied, as the last row of a history that has reached its own beginning. */
function baselineRow(isCurrent: boolean): ContentVersionRow {
  return {
    version: CONTENT_BASELINE_VERSION,
    isBaseline: true,
    changeSummary: null,
    savedAt: null,
    savedByName: null,
    isCurrent,
    changes: [],
    moreChanged: 0,
    changedElsewhere: false,
    unreadable: false,
  };
}

/**
 * The saved versions, newest first, with the wording as supplied beneath them as version 0.
 *
 * Reads one row beyond `limit` and uses it only as the diff baseline for the oldest row shown — the
 * bottom line of a *page* would otherwise claim its whole config as "changed" for want of anything to
 * compare it against. When that extra read comes back empty the page has reached the beginning of the
 * history, and there the defaults are the honest comparison: version 1 used to report no change at
 * all, which read as "the first save did nothing" rather than "this is what the first save moved".
 */
export async function listContentVersions(limit = 25): Promise<ContentVersionRow[]> {
  const { versions } = await listModuleVersions(RECLAIM_MODULE_SLUG, { limit: limit + 1 });
  // Nothing saved: the shipped wording is not merely the oldest version, it is the live one.
  if (versions.length === 0) return [baselineRow(true)];

  /** True once the rows in hand include the oldest there is, which is what makes version 0 reachable. */
  const atBeginning = versions.length <= limit;
  const origin = atBeginning ? sourceDefaults() : undefined;

  const page = versions.slice(0, limit);
  const authorIds = [
    ...new Set(page.map((v) => v.createdBy).filter((id): id is string => id !== null)),
  ];
  // `createdBy` carries no Prisma relation (the framework keeps a reverse field off the core `User`
  // model), so the names are a second read rather than an include.
  const authors =
    authorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true },
        });
  const authorName = new Map(authors.map((user) => [user.id, user.name]));

  const live = versions[0]?.version ?? null;

  const rows = page.map((row, index) => {
    // The row beyond the page where there is one, the shipped defaults where the page has reached
    // the beginning, and nothing at all where neither holds — in which case no change is claimed.
    const previous = versions[index + 1]?.snapshot ?? origin;
    const readable = reclaimConfigSchema.safeParse(row.snapshot).success;
    const changed = previous === undefined ? [] : changesBetween(row.snapshot, previous);
    const movedSomething =
      previous !== undefined && JSON.stringify(row.snapshot) !== JSON.stringify(previous);

    return {
      version: row.version,
      isBaseline: false,
      changeSummary: row.changeSummary,
      savedAt: row.createdAt.toISOString(),
      savedByName: row.createdBy === null ? null : (authorName.get(row.createdBy) ?? null),
      isCurrent: row.version === live,
      changes: changed.slice(0, DESCRIBED_CHANGES),
      moreChanged: Math.max(0, changed.length - DESCRIBED_CHANGES),
      changedElsewhere: movedSomething && changed.length === 0,
      unreadable: !readable,
    } satisfies ContentVersionRow;
  });

  return atBeginning ? [...rows, baselineRow(false)] : rows;
}

/**
 * Put the wording as supplied back, as a new version. Returns the number it was written as.
 *
 * **Not a restore of the whole default config**, which is why this cannot go through the framework's
 * `restoreModuleVersion` even in spirit. `reclaimConfigSchema.parse({})` carries settings this screen
 * has never shown — `openSignup`, `policyVersion`, `clientWindowMonths` — and writing it wholesale
 * would reset an operator's signup policy because they wanted a bucket description back. So the
 * defaults are turned into the same dotted-key edit map a save posts, and layered onto the *stored*
 * config through `applyContentEdits`: exactly the fields this screen offers, and nothing else.
 *
 * `readStoredContent(true)` for the same reason the save uses it — a stored config that no longer
 * parses must fail loudly here rather than be quietly replaced by defaults.
 */
async function restoreOriginalWording(input: {
  userId: string;
  clientIp: string | null;
}): Promise<number> {
  const { config } = await readStoredContent(true);
  const original = Object.fromEntries(
    [...labelledFields(sourceDefaults())].map(([key, field]) => [key, field.value])
  );

  return saveStoredContent({
    config: applyContentEdits(config, original),
    changeSummary: 'Restored the original wording, as supplied.',
    userId: input.userId,
    clientIp: input.clientIp,
  });
}

/**
 * Put a previous version back, as a new version. Returns the number it was written as.
 *
 * The framework re-validates the old snapshot against the schema as it stands now and refuses a
 * version that no longer fits it, which is the case this leaf must not paper over: a config written
 * before a schema change would otherwise be restored into a shape the running code cannot read.
 *
 * Version 0 is the exception, and takes the leaf's own path above: it is the shipped wording rather
 * than a stored snapshot, so there is nothing for the framework to look up.
 */
export async function restoreContentVersion(input: {
  version: number;
  userId: string;
  clientIp: string | null;
}): Promise<number> {
  if (input.version === CONTENT_BASELINE_VERSION) {
    return restoreOriginalWording({ userId: input.userId, clientIp: input.clientIp });
  }

  const result = await restoreModuleVersion({
    slug: RECLAIM_MODULE_SLUG,
    version: input.version,
    userId: input.userId,
    clientIp: input.clientIp,
  });
  return result.version.version;
}
