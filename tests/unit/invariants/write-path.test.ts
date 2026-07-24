/**
 * I3 — one write path to slots (F4 t-2).
 *
 * Asserts `appendSlotValue` is referenced in exactly one leaf file — `saveAnswer`'s `write.ts` —
 * across `lib/app/**` and `app/api/v1/app/**`. Routing every slot write through one function is what
 * makes masking (I5) and run-stamping (F1) hold by construction; a second caller would bypass both.
 * This fails the moment one appears. Wired into `leaf:checks` via the `tests/unit/invariants` dir.
 *
 * A static source scan (like `eslint-app-boundary`), not a behavioural test — it guards the *shape*
 * of the tree, which no runtime assertion can.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The two trees a leaf slot write could live in: domain logic and the leaf API surface. */
const ROOTS = ['lib/app', 'app/api/v1/app'];
const WRITE_PATH = 'lib/app/programme/slots/write.ts';

/** Every `.ts`/`.tsx` file under `dir` (recursive); `[]` when the tree does not exist yet. */
function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(p));
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('I3 — one write path to slots', () => {
  it('appendSlotValue is referenced only in write.ts (saveAnswer)', () => {
    const callers = ROOTS.flatMap(tsFiles)
      .filter((f) => readFileSync(f, 'utf8').includes('appendSlotValue'))
      .map((f) => f.split(/[\\/]/).join('/'))
      .sort();
    expect(callers).toEqual([WRITE_PATH]);
  });
});
