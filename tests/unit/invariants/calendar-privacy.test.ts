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

  /**
   * The derived lanes are `hidden`, so raw calendar figures cannot reach a prompt unframed (F13 t-2).
   *
   * **Why this belongs in the I4 file rather than a new one.** `loadModuleContext` injects every
   * populated slot head whose `visibility !== 'hidden'` as a bare `slug: value` line — no framing, no
   * I4 context, and **not scoped to the current run**. Before F13 no `reclaim_*` slot set
   * `visibility` at all, so a leader's calendar figures from a previous audit arrived in this
   * audit's prompt with nothing marking them as either. Unframed, cross-run calendar figures in a
   * model's context are the same exposure family as titles, one step down, which is what makes this
   * an I4 assertion and not a prompt-tidiness one.
   *
   * The leader's own answers stay `open` on purpose — `completeness`, `period`, `switch_frequency`,
   * `reactive_time`, `offcal_work`, `messaging_load` are text they typed, and `hidden` means
   * system-only. Marking leader-authored prose hidden to shorten a prompt would be a
   * misclassification taken for a side effect.
   */
  it('every derived calendar and composite lane is hidden from the slot-head dump', async () => {
    const { reclaimSlotDefinitions } = await import('@/lib/app/programme/slots');
    const { RECLAIM_BUCKETS, bucketToken } = await import('@/lib/app/programme/content');

    const derived = [
      ...RECLAIM_BUCKETS.map((b) => `reclaim_calendar_hours__${bucketToken(b.slug)}`),
      ...RECLAIM_BUCKETS.map((b) => `reclaim_composite_hours__${bucketToken(b.slug)}`),
      'reclaim_composite_variance_note',
      'reclaim_calendar_uploaded',
      'reclaim_calendar_total_hours',
      'reclaim_calendar_ambiguous_items',
      'reclaim_calendar_events_per_day',
      'reclaim_calendar_back_to_back',
      'reclaim_calendar_longest_block',
    ];

    const byslug = new Map(reclaimSlotDefinitions.map((s) => [s.slug, s]));
    for (const slug of derived) {
      expect(byslug.get(slug), `${slug} is not a declared slot`).toBeDefined();
      expect(
        byslug.get(slug)?.visibility,
        `${slug} is computed from an uploaded file, so it must be hidden from the slot-head dump`
      ).toBe('hidden');
    }

    // The complement, so the rule cannot be satisfied by hiding everything: the leader's own words
    // about their calendar stay visible, because they are answers rather than derivations.
    for (const slug of [
      'reclaim_calendar_completeness',
      'reclaim_calendar_period',
      'reclaim_calendar_switch_frequency',
      'reclaim_calendar_reactive_time',
      'reclaim_calendar_offcal_work',
      'reclaim_calendar_messaging_load',
    ]) {
      expect(
        byslug.get(slug)?.visibility ?? 'open',
        `${slug} is the leader's own answer; hidden would be a misclassification`
      ).not.toBe('hidden');
    }
  });
});
