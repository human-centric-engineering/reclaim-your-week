/**
 * Board/feature-doc consistency check (F12 t-3) — the runner.
 *
 * Asserts that every `ryw-*.md` in `.context/app/planning/` and every `| F<N> |` row on a board
 * agree about what exists and what has shipped. Exits 1 on any disagreement. The rules, and the
 * reasoning for each, are in `./lib.ts`; this file is filesystem, logging and the exit code.
 *
 * **Why a third member of `leaf:checks`.** `leaf:content-diff` proves the content chain (I11) and
 * `leaf:invariants` proves the code rules, and neither can see a status column. The board is the
 * file a reader opens to find out what is left, and it had described itself inaccurately four times
 * — twice naming shipped items as outstanding, once leaving P22 at `in flight` after it merged, and
 * once letting work reach `main` with no row at all. Its own margin already carried the instruction
 * to reconcile it first. The instruction did not work, which is the argument for this script: an
 * instruction written in the file the instruction is about is not a control.
 *
 * Usage: `npm run leaf:board-check`, and via `npm run leaf:checks` on every PR.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { logger } from '@/lib/logging';
import {
  checkBoard,
  describe,
  parseBoardRows,
  parseFeatureDoc,
  type BoardRow,
  type FeatureDoc,
} from '@/scripts/planning/lib';

const ROOT = process.cwd();
const PLANNING = path.join(ROOT, '.context/app/planning');
/** The two boards. `plan.md` holds the closed `RYW v1` epic; `post-v1.md` holds everything after. */
const BOARDS = ['plan.md', 'post-v1.md'];

function main(): void {
  logger.info('Planning board consistency check (post-v1 P21/P23)...');

  const docFiles = readdirSync(PLANNING)
    .filter((file) => file.startsWith('ryw-') && file.endsWith('.md'))
    .sort();

  if (docFiles.length === 0) {
    logger.error(`  FAIL  No ryw-*.md found in ${path.relative(ROOT, PLANNING)}`);
    logger.error(
      'Either the planning tree moved or this check is pointed at the wrong directory. An empty match must fail rather than pass silently.'
    );
    process.exit(1);
  }

  const docs: FeatureDoc[] = docFiles.map((file) =>
    parseFeatureDoc(file, readFileSync(path.join(PLANNING, file), 'utf8'))
  );

  const boardText = new Map<string, string>();
  const rows: BoardRow[] = [];
  for (const board of BOARDS) {
    const text = readFileSync(path.join(PLANNING, board), 'utf8');
    boardText.set(board, text);
    rows.push(...parseBoardRows(board, text));
  }

  const features = docs.filter((doc) => doc.featureId !== null).length;
  const records = docs.length - features;
  logger.info(
    `  Checked ${features} feature docs and ${records} record docs against ${rows.length} board rows`
  );

  const findings = checkBoard({ docs, rows, boardText });
  if (findings.length === 0) {
    logger.info('  OK    Every feature doc and its board row agree.');
    process.exit(0);
  }

  for (const finding of findings) logger.error(`  FAIL  ${describe(finding)}`);
  logger.error(
    `${findings.length} disagreement${findings.length === 1 ? '' : 's'} between the planning docs and the boards. The board is a coordination surface; a wrong one is worse than none.`
  );
  process.exit(1);
}

main();
