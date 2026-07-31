/**
 * The content editor's version history (F18 t-2). Prisma and the framework service are mocked — no DB.
 *
 * The behaviours worth pinning are the ones that would make the list *lie* rather than break:
 *   - **the diff names the wording that moved**, in the labels the fields carry, so a line of history
 *     is readable a year later — that is the whole justification for the required change summary;
 *   - **and quotes it on both sides** — a label says where to look, not what it now says, so versions
 *     carrying only labels cannot be told apart without restoring one to find out;
 *   - **a bucket's fields are qualified by the bucket** — nine entries reading "Description" would be
 *     a diff that tells an operator nothing;
 *   - **"nothing on this screen moved" is said, not implied** — a save that changed a setting the
 *     editor does not show must not render as a blank line that reads like a no-op;
 *   - **the oldest row of a *page* is diffed against the row beyond it**, or the bottom of every page
 *     would claim the whole config as its own change;
 *   - **the oldest row of the *history* is diffed against the shipped defaults** — version 1 used to
 *     report no change at all, which reads as "the first save did nothing";
 *   - **version 0 is the wording as supplied**, listed and restorable. It has no `ModuleVersion` row,
 *     so without it the originals are the one state this screen can never get back to;
 *   - **restoring version 0 layers the default *content* onto the stored config** rather than writing
 *     the whole default config — `openSignup` and friends are not on this screen and must survive it;
 *   - **an unreadable snapshot is listed, not hidden** — a version that no longer parses is a fact
 *     about the history, and the screen must not offer to restore it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reclaimConfigSchema } from '@/lib/app/programme/module';

const mocks = vi.hoisted(() => ({
  listModuleVersions: vi.fn(),
  restoreModuleVersion: vi.fn(),
  userFindMany: vi.fn(),
  readStoredContent: vi.fn(),
  saveStoredContent: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({ prisma: { user: { findMany: mocks.userFindMany } } }));

vi.mock('@/lib/framework/modules/config/version-service', () => ({
  listModuleVersions: mocks.listModuleVersions,
  restoreModuleVersion: mocks.restoreModuleVersion,
}));

vi.mock('@/lib/app/programme/admin/content-config', () => ({
  readStoredContent: mocks.readStoredContent,
  saveStoredContent: mocks.saveStoredContent,
}));

import {
  listContentVersions,
  restoreContentVersion,
  CONTENT_BASELINE_VERSION,
} from '@/lib/app/programme/admin/content-history';

const defaults = () => reclaimConfigSchema.parse({});

/**
 * A stored snapshot with one edit applied, as a plain JSON value the way Prisma hands it back.
 *
 * **Cloned before it is edited.** `parse({})` hands back the schema's own default arrays rather than a
 * copy of them, so mutating a bucket in place reaches every later `parse({})` in the file — the first
 * version of this test edited v2 and watched v1 change with it, and the diff correctly reported that
 * nothing had moved. (Production is not exposed to this: `applyContentEdits` copies the three arrays
 * before it writes, deliberately.)
 */
function snapshot(edit: (config: ReturnType<typeof defaults>) => void): unknown {
  const config = structuredClone(defaults());
  edit(config);
  return JSON.parse(JSON.stringify(config));
}

function versionRow(over: { version?: number; [key: string]: unknown } = {}) {
  return {
    id: `id-${over.version ?? 1}`,
    version: 1,
    snapshot: snapshot(() => {}),
    changeSummary: 'A summary',
    createdBy: 'admin-1',
    createdAt: new Date('2026-07-30T09:00:00Z'),
    ...over,
  };
}

/** Only the saved rows — the synthetic version 0 is asserted on separately where it matters. */
const saved = <T extends { isBaseline: boolean }>(rows: T[]) => rows.filter((r) => !r.isBaseline);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listModuleVersions.mockResolvedValue({ versions: [], nextCursor: null });
  mocks.userFindMany.mockResolvedValue([{ id: 'admin-1', name: 'Rashmir' }]);
  mocks.readStoredContent.mockResolvedValue({ config: defaults(), version: null });
  mocks.saveStoredContent.mockResolvedValue(1);
});

describe('listContentVersions — nothing saved yet', () => {
  it('still answers with the wording as supplied, and calls it live', async () => {
    // Not an empty list: the shipped wording is what everyone is reading, so a history that showed
    // nothing would be claiming the page has no state rather than that it has its original one.
    const rows = await listContentVersions();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(CONTENT_BASELINE_VERSION);
    expect(rows[0]?.isBaseline).toBe(true);
    expect(rows[0]?.isCurrent).toBe(true);
    expect(rows[0]?.savedAt).toBeNull();
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });
});

describe('listContentVersions — what a version says it changed', () => {
  it('names the changed field in the words the editor labels it with', async () => {
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 2,
          snapshot: snapshot((c) => {
            c.footnote = 'A different footnote.';
          }),
        }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const [newest] = await listContentVersions();

    expect(newest?.changes.map((c) => c.label)).toEqual(['The summary footnote']);
    expect(newest?.changedElsewhere).toBe(false);
  });

  it('quotes the wording on both sides, so the version can be told apart without restoring it', async () => {
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 2,
          snapshot: snapshot((c) => {
            c.footnote = 'A different footnote.';
          }),
        }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const [newest] = await listContentVersions();

    expect(newest?.changes[0]).toEqual({
      label: 'The summary footnote',
      from: defaults().footnote,
      to: 'A different footnote.',
    });
  });

  it('qualifies a bucket field by its bucket, so nine "description"s are told apart', async () => {
    const target = defaults().buckets[1];
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 2,
          snapshot: snapshot((c) => {
            c.buckets[1].description = 'Reworded.';
          }),
        }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const [newest] = await listContentVersions();

    expect(newest?.changes.map((c) => c.label)).toEqual([`${target.title}: description`]);
  });

  it('says plainly when a save moved something this screen does not show', async () => {
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 2,
          snapshot: snapshot((c) => {
            c.openSignup = !c.openSignup;
          }),
        }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const [newest] = await listContentVersions();

    expect(newest?.changes).toEqual([]);
    expect(newest?.changedElsewhere).toBe(true);
  });

  it('describes only the first dozen changes and counts the rest', async () => {
    // The one save that moves forty fields at once is a restore of the original, and quoting all of
    // them on every row of a twenty-five-version list is a page weight nobody asked for.
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 2,
          snapshot: snapshot((c) => {
            c.buckets.forEach((bucket, i) => {
              bucket.description = `Reworded ${i}.`;
            });
          }),
        }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const [newest] = await listContentVersions();

    expect(newest?.changes).toHaveLength(9);
    expect(newest?.moreChanged).toBe(0);
  });
});

describe('listContentVersions — the beginning of the history', () => {
  it('diffs the first save against the shipped defaults rather than claiming it changed nothing', async () => {
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 1,
          snapshot: snapshot((c) => {
            c.footnote = 'Reworded.';
          }),
        }),
      ],
      nextCursor: null,
    });

    const [first] = await listContentVersions();

    expect(first?.version).toBe(1);
    expect(first?.changes).toEqual([
      { label: 'The summary footnote', from: defaults().footnote, to: 'Reworded.' },
    ]);
    expect(first?.isCurrent).toBe(true);
  });

  it('closes the list with version 0 — the wording as supplied, not live once anything is saved', async () => {
    mocks.listModuleVersions.mockResolvedValue({
      versions: [versionRow({ version: 1 })],
      nextCursor: null,
    });

    const rows = await listContentVersions();
    const last = rows[rows.length - 1];

    expect(last?.version).toBe(CONTENT_BASELINE_VERSION);
    expect(last?.isBaseline).toBe(true);
    expect(last?.isCurrent).toBe(false);
    expect(last?.savedAt).toBeNull();
    expect(last?.savedByName).toBeNull();
  });
});

describe('listContentVersions — the page boundary', () => {
  it('diffs the oldest row shown against the row beyond the page, and shows neither it nor version 0', async () => {
    // Asked for a page of one; the service is asked for two so the one shown has a baseline. Version
    // 0 stays off this page because the page has not reached the beginning — a row claiming to be the
    // origin, printed directly beneath a version it is not the origin of, would be a lie about order.
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({
          version: 2,
          snapshot: snapshot((c) => {
            c.footnote = 'Reworded.';
          }),
        }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const rows = await listContentVersions(1);

    expect(mocks.listModuleVersions).toHaveBeenCalledWith(expect.any(String), { limit: 2 });
    expect(rows.map((r) => r.version)).toEqual([2]);
    expect(rows[0]?.changes.map((c) => c.label)).toEqual(['The summary footnote']);
  });
});

describe('listContentVersions — who saved it', () => {
  it('resolves the author in one read, and reads "unknown" as null rather than inventing a name', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 'admin-1', name: 'Rashmir' }]);
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({ version: 2, createdBy: 'erased-admin' }),
        versionRow({ version: 1, createdBy: 'admin-1' }),
      ],
      nextCursor: null,
    });

    const rows = await listContentVersions();

    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    expect(saved(rows).map((r) => r.savedByName)).toEqual([null, 'Rashmir']);
  });
});

describe('listContentVersions — a snapshot that no longer parses', () => {
  it('lists it, flagged, rather than hiding it or diffing against it', async () => {
    mocks.listModuleVersions.mockResolvedValue({
      versions: [
        versionRow({ version: 2, snapshot: { buckets: 'not a list' } }),
        versionRow({ version: 1 }),
      ],
      nextCursor: null,
    });

    const [newest] = await listContentVersions();

    expect(newest?.unreadable).toBe(true);
    expect(newest?.changes).toEqual([]);
  });
});

describe('restoreContentVersion — a stored version', () => {
  it('forwards to the framework and answers with the NEW version number', async () => {
    // The point of the assertion: a restore rolls history forward, so the number coming back is
    // never the number that went in. A leaf that echoed the request back would misreport that.
    mocks.restoreModuleVersion.mockResolvedValue({ version: { version: 9 } });

    const version = await restoreContentVersion({
      version: 3,
      userId: 'admin-1',
      clientIp: '203.0.113.1',
    });

    expect(version).toBe(9);
    expect(mocks.restoreModuleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, userId: 'admin-1', clientIp: '203.0.113.1' })
    );
  });
});

describe('restoreContentVersion — version 0, the wording as supplied', () => {
  it('puts every content field back without going near the framework restore', async () => {
    mocks.readStoredContent.mockResolvedValue({
      config: {
        ...defaults(),
        footnote: 'Reworded.',
        buckets: defaults().buckets.map((b, i) =>
          i === 0 ? { ...b, description: 'Reworded too.' } : b
        ),
      },
      version: 4,
    });
    mocks.saveStoredContent.mockResolvedValue(5);

    const version = await restoreContentVersion({
      version: CONTENT_BASELINE_VERSION,
      userId: 'admin-1',
      clientIp: '203.0.113.1',
    });

    expect(version).toBe(5);
    expect(mocks.restoreModuleVersion).not.toHaveBeenCalled();

    const written = mocks.saveStoredContent.mock.calls[0]?.[0];
    expect(written.config.footnote).toBe(defaults().footnote);
    expect(written.config.buckets[0].description).toBe(defaults().buckets[0].description);
    expect(written.changeSummary).toMatch(/original wording/i);
  });

  it('leaves settings that are not on this screen exactly as they were', async () => {
    // The reason this cannot be a wholesale write of `reclaimConfigSchema.parse({})`: an operator
    // asking for a bucket description back must not have their signup policy reset with it.
    const stored = { ...defaults(), openSignup: !defaults().openSignup, footnote: 'Reworded.' };
    mocks.readStoredContent.mockResolvedValue({ config: stored, version: 4 });

    await restoreContentVersion({
      version: CONTENT_BASELINE_VERSION,
      userId: 'admin-1',
      clientIp: null,
    });

    const written = mocks.saveStoredContent.mock.calls[0]?.[0];
    expect(written.config.openSignup).toBe(stored.openSignup);
    expect(written.config.footnote).toBe(defaults().footnote);
  });

  it('reads strictly, so a stored config that no longer parses fails rather than being replaced', async () => {
    // `readStoredContent(false)` falls back to the defaults, which on a *write* path would quietly
    // overwrite every setting this screen does not show. The save path already made this choice.
    await restoreContentVersion({
      version: CONTENT_BASELINE_VERSION,
      userId: 'admin-1',
      clientIp: null,
    });

    expect(mocks.readStoredContent).toHaveBeenCalledWith(true);
  });

  it('does not pin the save to a base version, so it cannot be refused for concurrency', async () => {
    // A restore is a deliberate act on the history as it stands now, not an edit composed against a
    // page loaded earlier: there is no draft here for a concurrent save to have invalidated.
    await restoreContentVersion({
      version: CONTENT_BASELINE_VERSION,
      userId: 'admin-1',
      clientIp: null,
    });

    expect(mocks.saveStoredContent.mock.calls[0]?.[0]).not.toHaveProperty('baseVersion');
  });
});
