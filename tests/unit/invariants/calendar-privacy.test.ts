/**
 * I4 — the calendar never persists per-event data (F5).
 *
 * A static source scan (like the I3 write-path guard): the calendar path must categorise via
 * `runStructuredCompletion` (which writes no `AiMessage`) and must **never** import `streamChat`
 * (which would persist meeting titles as chat messages) — the structural half of I4. The behavioural
 * half (no title anywhere in the DB after a real upload) is `smoke:reclaim-calendar`.
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
