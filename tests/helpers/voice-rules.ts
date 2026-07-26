/**
 * The mechanical half of I1 and I2, in one place.
 *
 * Two guards need these: `tests/unit/invariants/voice.test.ts` (the coach agent's authored fields)
 * and `tests/unit/invariants/product-voice.test.ts` (coach-voiced copy the app authors). They were
 * one list copied twice until open item 8 was decided, which is the arrangement where a rule gets
 * tightened in one guard and silently not the other.
 *
 * The banned lexicon itself is deliberately **not** here: it lives in `lib/app/programme/agent.ts`
 * as `RECLAIM_BANNED_LEXICON`, because the agent states the prohibition to the model and the guards
 * check it. One list, imported by everyone, so the ban and the guard cannot drift.
 */

/** U+2014. Banned in agent output and in coach-voiced product copy (I2). */
export const EM_DASH = '—';

/**
 * First-person-as-Rashmir constructions (I1). The tool is an instrument designed by her, attributed
 * in the third person; it never speaks as "I, Rashmir".
 *
 * These are the six idioms Brief §4 names, so this is a tripwire for the known failure rather than a
 * first-person detector. "I built this framework" passes. That is a deliberate limit: the source
 * system prompt is written in her first person, so what this catches is content ported across
 * without re-pointing, which is the way the mistake actually happens.
 */
export const FIRST_PERSON_RASHMIR = [
  /\bI designed\b/i,
  /\bmy framework\b/i,
  /\bin my experience\b/i,
  /\bI,\s*Rashmir\b/i,
  /\bas Rashmir\b/i,
  /\bmy method\b/i,
];

/**
 * Strip comments so a guard reads what a leader could read.
 *
 * Without this the checks fail on their own documentation: this repo's doc comments use em dashes
 * throughout and cite the banned terms by name in order to explain the ban. Stripping first is what
 * lets the em-dash rule stay zero-tolerance in prose, with no allowlist to rot.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ') // JSX comment blocks
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block and doc comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments, sparing the // in a URL
}
