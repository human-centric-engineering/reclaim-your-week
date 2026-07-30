/**
 * Unit: the board/feature-doc consistency rules (F12 t-3).
 *
 * **The negative cases are the point of this file.** The whole reason `leaf:board-check` exists is
 * that the board went wrong four times while a paragraph told people not to let it, and the whole
 * reason F12 t-2 found `smoke:reclaim-coach` red is that an assertion which cannot fail passes for
 * the wrong reason. So every rule here is tested by constructing the disagreement it is supposed to
 * catch, not only by confirming that the current repository is clean.
 *
 * Pure functions over strings — no filesystem, matching the split in `scripts/planning/lib.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  checkBoard,
  describe as explain,
  isClaimed,
  isShipped,
  parseBoardRows,
  parseFeatureDoc,
  type BoardRow,
  type FeatureDoc,
} from '@/scripts/planning/lib';

/** A feature doc, with only the fields a test cares about spelled out. */
function doc(over: Partial<FeatureDoc> = {}): FeatureDoc {
  return {
    file: 'ryw-thing.md',
    name: 'ryw-thing',
    featureId: 'F20',
    featureSlug: 'ryw-thing',
    shipped: false,
    // No task rows by default, so the all-tasks-done rule is silent unless a test asks for it.
    tasks: { total: 0, done: 0 },
    ...over,
  };
}

function row(over: Partial<BoardRow> = {}): BoardRow {
  return {
    board: 'post-v1.md',
    featureId: 'F20',
    featureSlug: 'ryw-thing',
    shipped: false,
    claimed: true,
    line: 10,
    ...over,
  };
}

/** `checkBoard` needs the board text only for the record-doc link rule. */
const noText = new Map<string, string>();

describe('isShipped / isClaimed', () => {
  it('reads the free-form status values this repository actually uses', () => {
    // Real values from ryw-phases.md, ryw-provenance.md and ryw-firstlight.md.
    expect(isShipped('shipped')).toBe(true);
    expect(isShipped('shipped (#39)')).toBe(true);
    expect(isShipped('shipped (t-1/t-2/t-3 done, #25)')).toBe(true);
    expect(isShipped('**shipped**')).toBe(true);
    expect(isShipped('in flight')).toBe(false);
    expect(isShipped('ready ▲')).toBe(false);
  });

  it('separates "somebody has picked this up" from "this is done"', () => {
    expect(isClaimed('in flight')).toBe(true);
    expect(isClaimed('**shipped**')).toBe(true);
    // An unclaimed row is a feature on the board that nobody has started, and it is supposed to
    // have no plan doc yet — see BoardRow.claimed.
    expect(isClaimed('ready ▲')).toBe(false);
    expect(isClaimed('blocked → F14')).toBe(false);
    expect(isClaimed('parked')).toBe(false);
  });
});

describe('parseFeatureDoc', () => {
  it('reads the id and slug out of a "F12 · ryw-hygiene" line', () => {
    const parsed = parseFeatureDoc(
      'ryw-hygiene.md',
      '---\nname: ryw-hygiene\nfeature: F12 · ryw-hygiene\nstatus: in flight\n---\n\n# heading\n'
    );
    expect(parsed).toMatchObject({ featureId: 'F12', featureSlug: 'ryw-hygiene', shipped: false });
  });

  it('tolerates the decorated forms already in the tree', () => {
    // F3 carries a ★, and its status names three tasks and a PR.
    const parsed = parseFeatureDoc(
      'ryw-firstlight.md',
      '---\nname: ryw-firstlight\nfeature: F3 · ryw-firstlight ★\nstatus: shipped (t-1/t-2/t-3 done, #25)\n---\n'
    );
    expect(parsed).toMatchObject({
      featureId: 'F3',
      featureSlug: 'ryw-firstlight',
      shipped: true,
    });
  });

  it('treats a doc with no frontmatter as a record doc named after its file', () => {
    // ryw-conversational.md opens straight into a heading; it records P18 rather than a feature.
    const parsed = parseFeatureDoc('ryw-conversational.md', '# `ryw-conversational` — the audit\n');
    expect(parsed).toMatchObject({
      name: 'ryw-conversational',
      featureId: null,
      featureSlug: null,
      shipped: null,
    });
  });

  it('distinguishes "no status key" from "not shipped"', () => {
    // ryw-chat-ux.md has frontmatter but no status — there is nothing to disagree with, so the
    // comparison must be skipped rather than read as "not shipped".
    const parsed = parseFeatureDoc(
      'ryw-chat-ux.md',
      '---\nname: ryw-chat-ux\nparent: post-v1.md\n---\n'
    );
    expect(parsed.shipped).toBeNull();
  });

  it('counts task rows and ignores the header of the table they are in', () => {
    const parsed = parseFeatureDoc(
      'ryw-thing.md',
      [
        '---',
        'feature: F20 · ryw-thing',
        'status: in flight',
        '---',
        '',
        '| t-N | What | Status | PR |',
        '| --- | ---- | ------ | -- |',
        '| t-1 | A thing | done | — |',
        '| t-2 | Another | in flight | — |',
        '',
        '| F20 | ryw-thing | John | shipped | — |',
      ].join('\n')
    );

    // Two task rows: the `t-N` header is not one, and the board-style `F20` row is not either.
    expect(parsed.tasks).toEqual({ total: 2, done: 1 });
  });
});

describe('parseBoardRows', () => {
  it('finds rows by cell shape rather than column position', () => {
    // plan.md and post-v1.md put status in different columns. Both must parse.
    const planShape = '| F8  | `ryw-access` | John | **shipped** | F4 | 4 | Tiered invites |';
    const otherShape = '| F8 | John | `ryw-access` | 4 | **shipped** |';
    for (const table of [planShape, otherShape]) {
      const [parsed] = parseBoardRows('plan.md', table);
      expect(parsed).toMatchObject({ featureId: 'F8', featureSlug: 'ryw-access', shipped: true });
    }
  });

  it('ignores headers, separators and P-board rows', () => {
    const text = [
      '| #   | Feature | Owner | Status |',
      '| --- | ------- | ----- | ------ |',
      '| P21 | Two key-less smokes | John | **shipped** |',
      '| F12 | `ryw-hygiene` | John | in flight |',
      'not a table row at all',
    ].join('\n');
    const rows = parseBoardRows('post-v1.md', text);
    expect(rows.map((r) => r.featureId)).toEqual(['F12']);
    expect(rows[0].line).toBe(4);
  });
});

describe('checkBoard', () => {
  it('passes when the doc and its row agree', () => {
    expect(
      checkBoard({
        docs: [doc({ shipped: true })],
        rows: [row({ shipped: true })],
        boardText: noText,
      })
    ).toEqual([]);
  });

  it('catches a feature doc with no row anywhere — P23s shape', () => {
    const findings = checkBoard({ docs: [doc()], rows: [], boardText: noText });
    expect(findings).toEqual([{ kind: 'no_row', feature: 'F20', file: 'ryw-thing.md' }]);
    // Found on this check's very first run against the real tree: F11 (ryw-join-links) had shipped
    // in the post-v1 epic and never had a board row.
    expect(explain(findings[0])).toContain('no row on any board');
  });

  it('catches a claimed row with no plan doc', () => {
    const findings = checkBoard({
      docs: [],
      rows: [row({ claimed: true, shipped: false })],
      boardText: noText,
    });
    expect(findings).toEqual([{ kind: 'no_doc', feature: 'F20', board: 'post-v1.md', line: 10 }]);
  });

  it('allows an unclaimed row to have no plan doc', () => {
    // F13-F18 sat on the board as `ready ▲` before anyone claimed them. Demanding a plan there
    // would force stub docs, which is the failure P2 describes one artefact along.
    expect(checkBoard({ docs: [], rows: [row({ claimed: false })], boardText: noText })).toEqual(
      []
    );
  });

  it('catches a status disagreement in both directions', () => {
    const docSaysShipped = checkBoard({
      docs: [doc({ shipped: true })],
      rows: [row({ shipped: false })],
      boardText: noText,
    });
    expect(docSaysShipped[0]).toMatchObject({
      kind: 'status',
      docShipped: true,
      rowShipped: false,
    });

    // The direction that actually happened, four times: the row lags behind the merged work.
    const rowSaysShipped = checkBoard({
      docs: [doc({ shipped: false })],
      rows: [row({ shipped: true })],
      boardText: noText,
    });
    expect(rowSaysShipped[0]).toMatchObject({
      kind: 'status',
      docShipped: false,
      rowShipped: true,
    });
  });

  it('says nothing about a doc that carries no status key', () => {
    expect(
      checkBoard({
        docs: [doc({ shipped: null })],
        rows: [row({ shipped: true })],
        boardText: noText,
      })
    ).toEqual([]);
  });

  it('catches a feature whose every task is done while it still says in flight', () => {
    // F12's own shape, found on 2026-07-30: `ryw-hygiene.md` sat at `in flight` with all three tasks
    // `done` for five features, and this check was green because the doc and its row agreed — which
    // is the only thing the status rule compares.
    const findings = checkBoard({
      docs: [doc({ tasks: { total: 3, done: 3 } })],
      rows: [row()],
      boardText: noText,
    });

    expect(findings).toEqual([
      { kind: 'all_tasks_done', feature: 'F20', file: 'ryw-thing.md', tasks: 3 },
    ]);
    expect(explain(findings[0])).toContain('all 3 of its tasks done');
  });

  it('stays quiet part way through a feature, and once it has shipped', () => {
    // The noisy version of this rule is the one that gates each task row. Two of three done is the
    // normal state of a feature being built and must never fail a branch.
    expect(
      checkBoard({
        docs: [doc({ tasks: { total: 3, done: 2 } })],
        rows: [row()],
        boardText: noText,
      })
    ).toEqual([]);

    // And a shipped feature is allowed to carry a task that was deferred rather than done.
    expect(
      checkBoard({
        docs: [doc({ shipped: true, tasks: { total: 3, done: 2 } })],
        rows: [row({ shipped: true })],
        boardText: noText,
      })
    ).toEqual([]);
  });

  it('catches a slug that disagrees, and a feature claimed by two boards', () => {
    const renamed = checkBoard({
      docs: [doc({ featureSlug: 'ryw-thing' })],
      rows: [row({ featureSlug: 'ryw-other' })],
      boardText: noText,
    });
    expect(renamed[0]).toMatchObject({ kind: 'slug', docSlug: 'ryw-thing', rowSlug: 'ryw-other' });

    const twice = checkBoard({
      docs: [doc()],
      rows: [row(), row({ board: 'plan.md' })],
      boardText: noText,
    });
    expect(twice.find((f) => f.kind === 'two_rows')).toMatchObject({
      boards: ['post-v1.md', 'plan.md'],
    });
  });

  it('requires a record doc to be linked from a board, and accepts one that is', () => {
    const record = doc({
      file: 'ryw-chat-ux.md',
      name: 'ryw-chat-ux',
      featureId: null,
      featureSlug: null,
      shipped: null,
    });

    expect(checkBoard({ docs: [record], rows: [], boardText: noText })).toEqual([
      { kind: 'orphan_record', file: 'ryw-chat-ux.md', name: 'ryw-chat-ux' },
    ]);

    const linked = new Map([['post-v1.md', 'P19 is tracked in [[ryw-chat-ux]].']]);
    expect(checkBoard({ docs: [record], rows: [], boardText: linked })).toEqual([]);
  });
});
