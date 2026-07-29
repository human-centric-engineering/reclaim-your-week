/**
 * Board/feature-doc consistency — the pure half (F12 t-3).
 *
 * No filesystem, no logging, no `process.exit`. Everything here is a pure function over strings, so
 * the rules can be stated exactly in a test rather than inferred from a run. The runner
 * (`board-check.ts`) does the IO and the exit code, the same split `scripts/content-source/` uses.
 *
 * **What this exists to catch.** `.context/app/planning/post-v1.md` has now described itself
 * inaccurately four times: twice listing shipped items as outstanding, once leaving P22 at
 * `in flight` after it merged, and once letting the `offer_choices` work reach `main` with no row at
 * all. Each time the cause was structural rather than careless — the status row is written by the
 * branch doing the work, and nothing flips it when that branch merges. The board is the one file
 * here with no gate behind it: `leaf:content-diff` proves content and `leaf:invariants` proves code,
 * and neither can see a status column.
 *
 * The margin of `post-v1.md` already carries the instruction to reconcile the board first, and the
 * instruction did not work. That is the finding worth generalising: **an instruction written in the
 * file the instruction is about is not a control.**
 */

/** A `ryw-*.md` planning document, as its frontmatter describes itself. */
export interface FeatureDoc {
  /** Basename, e.g. `ryw-hygiene.md`. */
  file: string;
  /** The `name:` key, falling back to the filename stem for a doc with no frontmatter. */
  name: string;
  /** `F12` from `feature: F12 · ryw-hygiene`, or `null` for a record doc that names no feature. */
  featureId: string | null;
  /** `ryw-hygiene` from the same line, or `null`. */
  featureSlug: string | null;
  /** Whether `status:` begins with "shipped". `null` when the doc carries no `status:` key. */
  shipped: boolean | null;
}

/** One `| F12 | ... |` row on a board table. */
export interface BoardRow {
  /** Which board it was found on, e.g. `post-v1.md`. */
  board: string;
  featureId: string;
  featureSlug: string | null;
  shipped: boolean;
  /**
   * Whether anyone has picked this feature up — `in flight`, `shipped` or `done`.
   *
   * The distinction is what makes the missing-doc rule match the actual process.
   * `building-a-feature.md` step 1 is "claim it on the board **and** write the plan", both in the
   * same docs PR, so a row nobody has claimed (`ready ▲`, `blocked → X`, `parked`) is a feature that
   * is *supposed* to have no doc yet. Demanding one would either force stub plans — which is worse
   * than none, on the same reasoning P2 gives about unwritten tests that read as written — or push
   * people to leave planned work off the board entirely, which is the failure this whole script
   * exists to catch.
   */
  claimed: boolean;
  /** 1-indexed line within the board file, for the failure message. */
  line: number;
}

export type Finding =
  /** A feature doc exists and no board has a row for it — P23's shape. */
  | { kind: 'no_row'; feature: string; file: string }
  /** A board row exists and no feature doc does. */
  | { kind: 'no_doc'; feature: string; board: string; line: number }
  /** Two boards both claim the feature. */
  | { kind: 'two_rows'; feature: string; boards: string[] }
  /** The doc says shipped and the row does not, or the reverse. */
  | {
      kind: 'status';
      feature: string;
      file: string;
      docShipped: boolean;
      board: string;
      line: number;
      rowShipped: boolean;
    }
  /** The row names a different slug than the doc's own frontmatter. */
  | { kind: 'slug'; feature: string; file: string; docSlug: string; board: string; rowSlug: string }
  /** A record doc (no `feature:` key) that no board file mentions. */
  | { kind: 'orphan_record'; file: string; name: string };

/**
 * The statuses a board cell may hold, lower-cased.
 *
 * Only "shipped" is compared; the rest exist so a status cell can be told apart from a description
 * cell without depending on column order. The two boards were written a month apart and their
 * columns do not line up, so positional parsing would break on the next board someone adds.
 */
const STATUS_WORDS = ['shipped', 'in flight', 'ready', 'blocked', 'parked', 'waiting', 'done'];

/** Strip markdown emphasis, backticks and the `▲` marker so a cell can be compared as words. */
function plain(cell: string): string {
  return cell.replace(/[*`_]/g, '').replace(/[▲★]/g, '').trim();
}

/** Whether a status string means shipped. Loose by design — see `parseFeatureDoc`. */
export function isShipped(status: string): boolean {
  return /^shipped\b/i.test(plain(status));
}

/** Whether a status string means somebody has picked the feature up. See `BoardRow.claimed`. */
export function isClaimed(status: string): boolean {
  return /^(shipped|in flight|done)\b/i.test(plain(status));
}

/**
 * Read a `ryw-*.md`'s frontmatter.
 *
 * **`status` is compared loosely, on purpose.** Real values in this repository include `shipped`,
 * `shipped (#39)` and `shipped (t-1/t-2/t-3 done, #25)`. Demanding an exact match would force a
 * format nobody wants and would fail on history that is perfectly honest about itself.
 *
 * A doc with no `feature:` key is a **record** doc rather than a feature — `ryw-chat-ux.md` (P19)
 * and `ryw-conversational.md` (P18) are both records of post-v1 items. They are not failed for
 * lacking a field they were never meant to have; `checkBoard` requires them to be linked from a
 * board instead. `ryw-conversational.md` has no frontmatter at all, which is why `name` falls back
 * to the filename.
 */
export function parseFeatureDoc(file: string, text: string): FeatureDoc {
  const stem = file.replace(/\.md$/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const front = match?.[1] ?? '';

  const key = (k: string): string | null => {
    const found = new RegExp(`^${k}:[ \\t]*(.+)$`, 'm').exec(front);
    return found === null ? null : found[1].trim();
  };

  const feature = key('feature');
  // `feature: F3 · ryw-firstlight ★` — the id, then the slug, then anything decorative.
  const featureId = feature === null ? null : (/\b(F\d+)\b/.exec(feature)?.[1] ?? null);
  const featureSlug = feature === null ? null : (/\b(ryw-[a-z0-9-]+)/.exec(feature)?.[1] ?? null);
  const status = key('status');

  return {
    file,
    name: key('name') ?? stem,
    featureId,
    featureSlug,
    shipped: status === null ? null : isShipped(status),
  };
}

/**
 * Read every `| F<N> | … |` row out of a board file.
 *
 * **Cells are identified by shape, not by position.** `plan.md`'s features table and `post-v1.md`'s
 * epic table were written a month apart and their columns differ, so the slug is the first cell that
 * looks like one and the status is the first cell that reads as a status word. A board someone adds
 * later in a third shape keeps working, which matters because the alternative — hardcoded indices —
 * fails silently by reading a description cell as a status.
 */
export function parseBoardRows(board: string, text: string): BoardRow[] {
  const rows: BoardRow[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, index) => {
    if (!raw.trimStart().startsWith('|')) return;
    const cells = raw
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => plain(cell));
    if (cells.length < 3) return;

    const featureId = /^(F\d+)$/.exec(cells[0])?.[1];
    if (featureId === undefined) return;

    const rest = cells.slice(1);
    const featureSlug = rest
      .map((c) => /^(ryw-[a-z0-9-]+)$/.exec(c)?.[1])
      .find((c) => c !== undefined);
    const statusCell = rest.find((c) => STATUS_WORDS.some((w) => c.toLowerCase().startsWith(w)));

    rows.push({
      board,
      featureId,
      featureSlug: featureSlug ?? null,
      shipped: statusCell !== undefined && isShipped(statusCell),
      claimed: statusCell !== undefined && isClaimed(statusCell),
      line: index + 1,
    });
  });

  return rows;
}

export interface BoardInput {
  /** Every `ryw-*.md`, already parsed. */
  docs: FeatureDoc[];
  /** Every board row across every board file. */
  rows: BoardRow[];
  /** Raw text of each board file, keyed by basename — used only for the record-doc link check. */
  boardText: Map<string, string>;
}

/**
 * Compare the docs against the boards, both directions.
 *
 * **The reverse direction is the half that matters.** A doc whose row is missing is exactly P23's
 * shape, and it is the one a "did you update the board?" habit never catches, because in P23's case
 * the work had no doc either — so there was nothing to remind anybody.
 *
 * **What this deliberately does not check: task-row statuses inside a feature doc.** They change
 * several times per feature and are read by whoever is building it, not by someone deciding what is
 * left. Gating them would make the check noisy enough to be worked around, which is how a gate stops
 * being one.
 *
 * It also cannot prove the board is *right* — a feature whose doc and row both say `shipped` while
 * the code is half-built passes. That is the correct scope: consistency is mechanically checkable
 * and truthfulness is not, and every one of the four failures this exists for was an inconsistency.
 */
export function checkBoard({ docs, rows, boardText }: BoardInput): Finding[] {
  const findings: Finding[] = [];
  const byFeature = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const list = byFeature.get(row.featureId) ?? [];
    list.push(row);
    byFeature.set(row.featureId, list);
  }

  const documented = new Set<string>();

  for (const doc of docs) {
    if (doc.featureId === null) {
      // A record doc. It must at least be reachable from a board, or it is a plan nobody links to.
      const linked = [...boardText.values()].some((text) => text.includes(doc.name));
      if (!linked) findings.push({ kind: 'orphan_record', file: doc.file, name: doc.name });
      continue;
    }
    documented.add(doc.featureId);

    const matches = byFeature.get(doc.featureId) ?? [];
    if (matches.length === 0) {
      findings.push({ kind: 'no_row', feature: doc.featureId, file: doc.file });
      continue;
    }
    if (matches.length > 1) {
      findings.push({
        kind: 'two_rows',
        feature: doc.featureId,
        boards: [...new Set(matches.map((m) => m.board))],
      });
    }

    for (const row of matches) {
      if (
        row.featureSlug !== null &&
        doc.featureSlug !== null &&
        row.featureSlug !== doc.featureSlug
      ) {
        findings.push({
          kind: 'slug',
          feature: doc.featureId,
          file: doc.file,
          docSlug: doc.featureSlug,
          board: row.board,
          rowSlug: row.featureSlug,
        });
      }
      // A doc with no `status:` key states nothing to disagree with, so there is nothing to compare.
      if (doc.shipped !== null && doc.shipped !== row.shipped) {
        findings.push({
          kind: 'status',
          feature: doc.featureId,
          file: doc.file,
          docShipped: doc.shipped,
          board: row.board,
          line: row.line,
          rowShipped: row.shipped,
        });
      }
    }
  }

  for (const [featureId, matches] of byFeature) {
    if (documented.has(featureId)) continue;
    // Only a *claimed* row owes a plan. An unclaimed row is a feature on the board and not yet
    // picked up, which is exactly the state `building-a-feature.md` describes before step 1 — see
    // `BoardRow.claimed` for why demanding a doc there would make the board worse rather than better.
    const claimed = matches.find((row) => row.claimed);
    if (claimed === undefined) continue;
    findings.push({
      kind: 'no_doc',
      feature: featureId,
      board: claimed.board,
      line: claimed.line,
    });
  }

  return findings;
}

/** One line of operator-facing explanation per finding. */
export function describe(finding: Finding): string {
  switch (finding.kind) {
    case 'no_row':
      return `${finding.feature} (${finding.file}) has no row on any board. Add one, or the feature ships invisibly — this is what happened to the offer_choices work in #59 (post-v1 P23).`;
    case 'no_doc':
      return `${finding.board}:${finding.line} claims ${finding.feature} and no ryw-*.md describes it. Claiming a feature and writing its plan are one step (building-a-feature.md §1), so write the plan or put the row back to "ready".`;
    case 'two_rows':
      return `${finding.feature} has a row on more than one board (${finding.boards.join(', ')}). One feature, one board.`;
    case 'status':
      return `${finding.feature}: ${finding.file} says ${finding.docShipped ? 'shipped' : 'not shipped'} but ${finding.board}:${finding.line} says ${finding.rowShipped ? 'shipped' : 'not shipped'}. Reconcile the board as the first act of a branch, not the last act of the old one.`;
    case 'slug':
      return `${finding.feature}: ${finding.file} calls itself ${finding.docSlug}, ${finding.board} calls it ${finding.rowSlug}.`;
    case 'orphan_record':
      return `${finding.file} names no feature and no board mentions "${finding.name}". A record doc nobody links to is a plan nobody will find.`;
  }
}
