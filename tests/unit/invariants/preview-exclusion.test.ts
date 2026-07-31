/**
 * F19 — test accounts must not move the published figures, and the guard has to outlive the feature.
 *
 * ## Why this file exists rather than five unit tests
 *
 * The exclusion is a **read-time filter**. There is no column on `User`, no database constraint, and no
 * type that distinguishes a preview account from a client — by design, because a preview account signs
 * in and runs the audit through exactly the same routes a leader does. The only thing keeping a
 * fabricated audit out of the published numbers is that five specific queries remember to ask.
 *
 * `lib/auth/account.ts` documents what happens to a predicate like that when nothing holds it in place:
 * the same rule written out at each call site drifted, and the admin screens miscounted (PR #279). The
 * failure mode is not that someone edits these five files wrongly. It is that someone adds a **sixth**
 * counting query next quarter, in good faith, and nothing objects — and a screen quietly starts
 * publishing invented hours as though a real cohort produced them.
 *
 * So this is a completeness assertion, in the shape `product-voice.test.ts` uses: three lists, and a
 * check that their union is exactly the set of cohort-wide readers on disk. A new one fails the suite
 * until somebody classifies it. It is brittle in the one direction that helps.
 *
 * ## The three lists
 *
 * - **MUST_EXCLUDE** — anything that counts, publishes or emails. A preview account here is a real
 *   harm, and the two worst are worth naming: `readAggregate` suppresses below a k-anonymity
 *   threshold, so one fabricated audit can tip a cohort of four over a threshold of five and publish
 *   made-up hours as evidence; and the quarterly nudge **sends actual email**.
 * - **MUST_BADGE** — the operator's own screens. These deliberately still show preview accounts,
 *   flagged, because she cannot clean up accounts she cannot see. The cost is that the row count on
 *   the clients table includes them, which is acceptable precisely because each one is labelled.
 * - **NEITHER** — readers that take a `userId` and answer about one leader. Nothing to exclude: the
 *   caller already chose whose data this is.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PREDICATE_MODULE = '@/lib/app/programme/preview/accounts';

/** Counts, publishes or emails across leaders. A preview account in any of these is a real harm. */
const MUST_EXCLUDE = [
  // The k-anonymity-suppressed cohort figures. The highest-severity site in the app.
  'lib/app/programme/admin/aggregate.ts',
  // Return rate, referral conversion, client counts, the completion timeline.
  'lib/app/programme/admin/measures.ts',
  // Sends real email to whoever is in the cohort.
  'lib/app/programme/nudges/tick.ts',
];

/** Operator surfaces. These show preview accounts, badged — hiding them would strand them. */
const MUST_BADGE = ['lib/app/programme/admin/clients.ts', 'lib/app/programme/admin/inbox.ts'];

/**
 * Cohort-wide readers that legitimately need no filter, each with the reason. A file lands here only
 * because somebody looked at it — that is the whole value of the list.
 */
const NEITHER: ReadonlyArray<{ path: string; because: string }> = [
  {
    path: 'lib/app/programme/admin/export.ts',
    because:
      'buildClientExport(userId) — one leader, chosen by the operator. Exporting a test account is a reasonable thing to want to do.',
  },
  {
    path: 'lib/app/programme/admin/transcript.ts',
    because: 'One conversation, addressed by userId + runId.',
  },
  {
    path: 'lib/app/programme/admin/reach-out.ts',
    because:
      'Bounded by ids the caller passes in, so it inherits whatever the clients list decided. Writing to a test account is deliberate.',
  },
  {
    path: 'lib/app/programme/admin/preview-list.ts',
    because:
      'Lists preview accounts on purpose, so the operator can manage them. Excluding them would leave the screen permanently empty.',
  },
  {
    path: 'lib/app/programme/admin/content-config.ts',
    because:
      'Reads `module` and `module_version` — the published wording and audit rules. Config, not people; there is no userId in any query here.',
  },
  {
    path: 'lib/app/programme/admin/content-history.ts',
    because:
      'The content editor’s version list. Its one `user` read resolves names for the admin ids already on the version rows, so the set is decided by who saved wording, not by any cohort — and a preview account cannot reach an admin-only write in the first place.',
  },
];

/** Where a cohort reader could plausibly appear. Held to account by the completeness assertion. */
const SWEPT_DIRS = ['lib/app/programme/admin', 'lib/app/programme/nudges'];

/**
 * Files under the swept directories that are not readers at all — pure computation over rows handed to
 * them, or config. Excluded from the sweep because they hold no query to filter.
 */
function isCohortReader(source: string): boolean {
  // A cohort read is a Prisma read with no `userId` pinned to a single value in its `where`. Crude on
  // purpose: over-matching costs somebody a line in `NEITHER`, under-matching costs a silent miscount.
  return /prisma\.\w+\.(findMany|count|groupBy|aggregate|findFirst)\(/.test(source);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const read = (path: string): string => readFileSync(path, 'utf8');

describe('F19 — every cohort reader is classified', () => {
  it('leaves none unclassified, so a new counting query cannot join the app unguarded', () => {
    const onDisk = SWEPT_DIRS.flatMap((dir) => walk(dir))
      .filter((p) => p.endsWith('.ts'))
      .filter((p) => isCohortReader(read(p)))
      .sort();

    const classified = [...MUST_EXCLUDE, ...MUST_BADGE, ...NEITHER.map((n) => n.path)]
      .filter((p) => SWEPT_DIRS.some((dir) => p.startsWith(dir)))
      .sort();

    // If this fails, a file that reads across leaders was added or removed. Classify it:
    //   MUST_EXCLUDE — it counts, publishes or emails. Add `excludeIds(await previewUserIds())`.
    //   MUST_BADGE   — an operator screen. Add `previewUserIdSet()` and an `isPreview` field.
    //   NEITHER      — it answers about one leader. Say why, in the list.
    // Do not delete the assertion.
    expect(classified).toEqual(onDisk);
  });

  it('classifies each file exactly once', () => {
    const all = [...MUST_EXCLUDE, ...MUST_BADGE, ...NEITHER.map((n) => n.path)];
    expect(all.length).toBe(new Set(all).size);
  });

  it('gives a reason for every unfiltered reader', () => {
    // An empty reason is how this list becomes an allowlist of unexamined files.
    for (const entry of NEITHER) expect(entry.because.length).toBeGreaterThan(30);
  });
});

describe('F19 — the counting surfaces exclude test accounts', () => {
  it.each(MUST_EXCLUDE)('%s reads the predicate from the one module that owns it', (path) => {
    // Not an inline `where`, and not a second copy of the rule. One module, for PR #279's reason.
    expect(read(path)).toContain(PREDICATE_MODULE);
  });

  it.each(MUST_EXCLUDE)('%s applies the exclusion rather than merely importing it', (path) => {
    const source = read(path);
    expect(source).toContain('previewUserIds');
    expect(source).toContain('excludeIds');
  });

  it.each(MUST_EXCLUDE)('%s does not merely badge — it must filter the query', (path) => {
    // `previewUserIdSet` is the badging helper. On a counting surface it would mean the rows were
    // fetched and then labelled, which is not the same as leaving them out of the total.
    expect(read(path)).not.toContain('previewUserIdSet');
  });
});

describe('F19 — the operator surfaces still show test accounts', () => {
  it.each(MUST_BADGE)('%s badges them rather than dropping them', (path) => {
    const source = read(path);
    expect(source).toContain(PREDICATE_MODULE);
    expect(source).toContain('previewUserIdSet');
    expect(source).toContain('isPreview');
  });

  it.each(MUST_BADGE)('%s does not silently filter them out of the operator’s view', (path) => {
    // Hiding them here is the failure this list exists to prevent: an operator who cannot see a test
    // account cannot remove it, and it then sits in the clients table forever with nothing to explain
    // why the totals elsewhere disagree.
    expect(read(path)).not.toContain('excludeIds');
  });
});

describe('F19 — the predicate module stays narrow', () => {
  it('reads only the registry table, so the nudge tick can import it', () => {
    // `nudges/tick.ts` is not an admin route. If this module grew a cross-user read, that read would
    // become reachable without `withAdminAuth`, which `admin-support.test.ts` exists to prevent.
    const source = read('lib/app/programme/preview/accounts.ts');
    const tables = [...source.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]);

    expect([...new Set(tables)]).toEqual(['reclaimPreviewAccount']);
  });
});
