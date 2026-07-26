/**
 * I1 + I2 over the copy the **app** authors, not just the agent (plan.md open item 8, decided
 * 2026-07-26).
 *
 * `voice.test.ts` guards four fields of `reclaimCoachAgent`. That was the whole of the enforcement
 * for ten features, and the consequence was visible on screen: the coach never used an em dash while
 * the interface around it used one every other paragraph, and a leader reads one screen rather than
 * two sources. I2 now binds coach-voiced product copy too, and this is what says so.
 *
 * ## Why an explicit file list, and why the completeness assertion is the point
 *
 * Every alternative rots. A marker comment gets copy-pasted without thought. A directory rule cannot
 * express that `signposts.ts` in `lib/` is coach voice while `actions.ts` next door is plumbing. An
 * allowlist of known violations only ever grows.
 *
 * So: two lists, and an assertion that their union is exactly what is on disk. A new component fails
 * this suite until somebody classifies it, and the failure message tells them what the two lists
 * mean. It is brittle in the one direction that helps.
 *
 * ## What is deliberately not checked here
 *
 * - **`lib/app/programme/content.ts`** — Rashmir's verbatim content, nineteen em dashes and all.
 *   I11 outranks I2; paraphrasing to satisfy a formatting rule is the drift the content chain exists
 *   to prevent.
 * - **"We" as vendor-we vs inclusive-we** — a judgement no regex makes. Specification, enforced by
 *   review (I1).
 * - **System and error strings** — exempt by I1's rule 3. They live in files that are otherwise
 *   coach-voiced, so this guard checks the file and trusts the rules that no error string carries an
 *   em dash or a banned term. In practice none does.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { EM_DASH, FIRST_PERSON_RASHMIR, stripComments } from '@/tests/helpers/voice-rules';

const RECLAIM_COMPONENTS = 'components/app/reclaim';

/**
 * Copy a leader reads in the coach's voice. Everything the audit says to them, in other words,
 * wherever it happens to live.
 */
const COACH_VOICED = [
  'components/app/reclaim/begin-audit.tsx',
  'components/app/reclaim/calendar/calendar-branch.tsx',
  'components/app/reclaim/calendar/calendar-entry.tsx',
  'components/app/reclaim/calendar/calendar-review.tsx',
  'components/app/reclaim/calendar/calendar-upload.tsx',
  'components/app/reclaim/chart/reclaim-chart.tsx',
  'components/app/reclaim/coach-chat.tsx',
  'components/app/reclaim/consent-gate.tsx',
  'components/app/reclaim/phase-rail.tsx',
  'components/app/reclaim/phase/advance-controls.tsx',
  'components/app/reclaim/phase/fields.tsx',
  'components/app/reclaim/phase/phase1-panel.tsx',
  'components/app/reclaim/phase/phase2-panel.tsx',
  'components/app/reclaim/phase/phase3-panel.tsx',
  'components/app/reclaim/phase/phase4-panel.tsx',
  'components/app/reclaim/phase/phase5-panel.tsx',
  'components/app/reclaim/phase/phase6-panel.tsx',
  'components/app/reclaim/phase/reflection.tsx',
  'components/app/reclaim/phase/setup-panel.tsx',
  'components/app/reclaim/programme-shell.tsx',
  'components/app/reclaim/referral-invite.tsx',
  'components/app/reclaim/repeat/comparison.tsx',
  'components/app/reclaim/repeat/trend-lines.tsx',
  'components/app/reclaim/signpost.tsx',
  'components/app/reclaim/summary/shared-summary.tsx',
  'components/app/reclaim/summary/summary-view.tsx',
  // Coach voice that does not live under `components/`. The server writes the phase signposts — the
  // agent's own orienting job, done server-side — so a directory rule would have missed them.
  'lib/app/programme/runs/signposts.ts',
  // The categoriser's prompt, whose `reasoning` output renders to the leader in `calendar-review`.
  'lib/app/programme/calendar/categorise.ts',
];

/** Plumbing: fetchers, types, palettes, pure arithmetic. Nothing here reaches a leader as prose. */
const NOT_COACH_VOICED = [
  'components/app/reclaim/access/actions.ts',
  'components/app/reclaim/calendar/types.ts',
  'components/app/reclaim/chart/palette.ts',
  'components/app/reclaim/format.ts',
  'components/app/reclaim/phase/actions.ts',
  'components/app/reclaim/phase/config.ts',
  'components/app/reclaim/phase/hours.ts',
  'components/app/reclaim/repeat/actions.ts',
  'components/app/reclaim/summary/types.ts',
  'components/app/reclaim/types.ts',
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const read = (path: string): string => stripComments(readFileSync(path, 'utf8'));

describe('every reclaim component is classified', () => {
  it('leaves no file unclassified, so a new screen cannot join the product unguarded', () => {
    const onDisk = walk(RECLAIM_COMPONENTS).sort();
    const classified = [...COACH_VOICED, ...NOT_COACH_VOICED]
      .filter((p) => p.startsWith(RECLAIM_COMPONENTS))
      .sort();
    // If this fails, add the new file to COACH_VOICED if a leader reads prose from it, or to
    // NOT_COACH_VOICED if it is plumbing. Do not delete the assertion.
    expect(classified).toEqual(onDisk);
  });

  it('classifies each file exactly once', () => {
    const both = COACH_VOICED.filter((p) => NOT_COACH_VOICED.includes(p));
    expect(both).toEqual([]);
  });
});

describe('I2 — no em dash in coach-voiced copy', () => {
  it.each(COACH_VOICED)('%s contains no U+2014', (path) => {
    // Zero tolerance, no allowlist. `—` used as a null placeholder lives in one shared constant
    // using an en dash, precisely so this assertion can stay bare.
    expect(read(path)).not.toContain(EM_DASH);
  });
});

describe('I2 — banned lexicon in coach-voiced copy', () => {
  it.each(COACH_VOICED)('%s uses none of the banned terms', (path) => {
    const lower = read(path).toLowerCase();
    const hits = RECLAIM_BANNED_LEXICON.filter((term) => lower.includes(term.toLowerCase()));
    expect(hits).toEqual([]);
  });
});

describe('I1 — the tool is not Rashmir, and is never the model', () => {
  it.each(COACH_VOICED)('%s carries no first-person-as-Rashmir construction', (path) => {
    const source = read(path);
    for (const re of FIRST_PERSON_RASHMIR) expect(source).not.toMatch(re);
  });

  it.each(COACH_VOICED)('%s never attributes the tool to Claude or Anthropic', (path) => {
    const source = read(path);
    expect(source).not.toMatch(/\bClaude\b/i);
    expect(source).not.toMatch(/\bAnthropic\b/i);
  });
});

/**
 * Open item 11, decided: the Phase 2 coaching signal is not shown to leaders.
 *
 * Rashmir's sentence stays in `content.ts`, still guarded character-identical, because deciding
 * against rendering it is not a reason to lose her material. What must not come back is the render:
 * the string is facilitator instruction voice ("signal that a dedicated coaching conversation with
 * Rashmir can go much further here"), so a leader reading it reads a leaked prompt. This is the
 * assertion a future session hits when it tries to helpfully wire the unused constant back up.
 */
describe('open item 11 — the Phase 2 coaching signal reaches no leader', () => {
  it('is rendered by no component', () => {
    const users = walk('components')
      .filter((p) => /\.tsx?$/.test(p))
      // Comments stripped: `phase2-panel.tsx` names the constant in its docblock to explain why it
      // is not rendered, and that explanation is the opposite of the problem.
      .filter((p) => read(p).includes('RECLAIM_PHASE2_COACHING_SIGNAL'));
    expect(users).toEqual([]);
  });

  it('has no config toggle that could bring it back', () => {
    const schema = readFileSync('lib/app/programme/module.ts', 'utf8');
    expect(stripComments(schema)).not.toContain('phase2CoachingSignal');
  });
});
