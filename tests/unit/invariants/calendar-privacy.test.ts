/**
 * I4 — the calendar never persists per-event data (F5).
 *
 * A static source scan (like the I3 write-path guard): the calendar path must categorise via
 * `runStructuredCompletion` (which writes no `AiMessage`) and must **never** import `streamChat`
 * (which would persist meeting titles as chat messages) — the structural half of I4. The behavioural
 * half (no title anywhere in the DB after a real upload) is `smoke:reclaim-calendar`.
 *
 * ## The question F5 asked and never answered (post-v1 P10)
 *
 * `ryw-calendar.md` t-2 was told to note whether `runStructuredCompletion`'s non-persistence is a
 * **contract** or merely how it currently behaves, and to file an upstream row if the latter. Nobody
 * recorded an answer. Reading it now: **it is incidental.** The function imports `calculateCost`
 * (pure arithmetic) and no database client, so nothing is written — but its docstring promises only
 * that it is a "neutral LLM utility — no evaluation coupling, no Next.js imports", which is a
 * statement about layering, not about writes. An upstream change that started logging prompts for
 * debugging would be entirely consistent with everything that file says about itself, and would break
 * I4 without touching a single line of ours.
 *
 * So the last assertion below is a **canary on Sunrise-owned code**: it fails if the structured
 * completion path acquires a route to the database. It cannot prove non-persistence transitively (a
 * provider implementation could in principle write), which is why the ask is also filed upstream
 * (sunrise#472) for the guarantee to be made contractual where it belongs.
 *
 * Wired into `leaf:checks` via the `tests/unit/invariants` directory glob.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The two trees the calendar branch lives in. */
const CALENDAR_ROOTS = [
  'lib/app/programme/calendar',
  join('app/api/v1/app/reclaim/runs/[runId]/calendar'),
];

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(p));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Strip line + block comments so the scan sees real code, not prose that names the banned symbol. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('I4 — the calendar never persists per-event data', () => {
  const files = CALENDAR_ROOTS.flatMap(tsFiles);
  const sources = files.map((f) => ({ file: f, code: stripComments(readFileSync(f, 'utf8')) }));

  it('has calendar path files to scan (guard against a silent empty match)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never imports or calls streamChat (which would persist meeting titles as AiMessage)', () => {
    // Prose in doc comments may name streamChat as the thing to avoid; only real code counts.
    const offenders = sources.filter((s) => /\bstreamChat\b/.test(s.code)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('categorises through runStructuredCompletion (the no-persistence path)', () => {
    const usesStructured = sources.some((s) => s.code.includes('runStructuredCompletion'));
    expect(usesStructured).toBe(true);
  });
});

describe('I4 — the categorise path has no route to the database (post-v1 P10)', () => {
  /** The Sunrise-owned module the calendar's LLM call goes through. */
  const STRUCTURED_COMPLETION = 'lib/orchestration/llm/structured-completion.ts';

  it('runStructuredCompletion imports no database client', () => {
    // A canary on code we do not own. I4 currently holds because this file happens not to persist
    // anything; nothing in it promises that, so this fails loudly on the day it changes rather than
    // letting a meeting title reach a table quietly.
    const source = readFileSync(STRUCTURED_COMPLETION, 'utf8');

    for (const forbidden of ['@/lib/db/client', '@prisma/client', 'PrismaClient', 'prisma.']) {
      expect(
        source.includes(forbidden),
        `${STRUCTURED_COMPLETION} now references ${forbidden} — I4's non-persistence was never ` +
          'contractual (see sunrise#472) and may just have stopped being true'
      ).toBe(false);
    }
  });

  it('the calendar path never calls a provider directly, only through that one function', () => {
    // `getProvider` IS expected here — the calendar resolves the coach agent's provider and hands it
    // to `runStructuredCompletion`. What must not appear is a direct `.chat(...)` on it, which would
    // route event summaries to a model outside the one function the canary above watches, leaving
    // I4 guarded on a door that is no longer the only one.
    const sources = CALENDAR_ROOTS.flatMap(tsFiles).map((f) => readFileSync(f, 'utf8'));

    expect(
      sources.some((s) => /\.chat\s*\(/.test(s)),
      'the calendar branch calls provider.chat directly — bypassing runStructuredCompletion'
    ).toBe(false);
    expect(
      sources.some((s) => s.includes('runStructuredCompletion')),
      'the calendar branch no longer uses runStructuredCompletion — the canary guards nothing'
    ).toBe(true);
  });
});
