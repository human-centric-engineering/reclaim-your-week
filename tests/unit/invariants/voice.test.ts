/**
 * I1 (voice) + I2 (banned lexicon and formatting) — the coach agent's authored content is
 * third-person and free of the forbidden language (F2 t-4).
 *
 * This is a cross-cutting invariant guard, wired into `leaf:checks` (the only hook CI runs for
 * the leaf), not just a unit test of one file. It greps the four authored fields of
 * `reclaimCoachAgent` for:
 *   - the em dash (U+2014) — banned in all agent content (I2);
 *   - the banned lexicon (I2) — which must be absent from the prose fields, and present only in
 *     `brandVoiceInstructions`, where it is stated as a prohibition;
 *   - first-person-as-Rashmir constructions (I1) — the persona is a third-person instrument;
 *   - attribution to the underlying model or its maker (I1) — never named.
 *
 * The list of forbidden terms is imported from the source module (`RECLAIM_BANNED_LEXICON`), not
 * re-typed here, so the guard and the prohibition can never drift apart.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent, RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';

const EM_DASH = '—';

/** The three prose fields that must read cleanly. `brandVoiceInstructions` is handled separately —
 *  it is the one field that names the banned terms, as prohibitions. */
const PROSE_FIELDS: Array<[string, string]> = [
  ['persona', reclaimCoachAgent.persona],
  ['systemInstructions', reclaimCoachAgent.systemInstructions],
  ['guardrails', reclaimCoachAgent.guardrails],
];

const ALL_FIELDS: Array<[string, string]> = [
  ...PROSE_FIELDS,
  ['brandVoiceInstructions', reclaimCoachAgent.brandVoiceInstructions],
];

// First-person-as-Rashmir constructions the agent must never carry (I1). It is an instrument
// designed by her, attributed in the third person — it never speaks as "I, Rashmir".
const FIRST_PERSON_RASHMIR = [
  /\bI designed\b/i,
  /\bmy framework\b/i,
  /\bin my experience\b/i,
  /\bI,\s*Rashmir\b/i,
  /\bas Rashmir\b/i,
  /\bmy method\b/i,
];

describe('I2 — no em dash in any agent content', () => {
  it.each(ALL_FIELDS)('%s contains no U+2014', (_name, text) => {
    expect(text).not.toContain(EM_DASH);
  });
});

describe('I2 — banned lexicon', () => {
  it.each(PROSE_FIELDS)('%s uses none of the banned terms', (_name, text) => {
    const lower = text.toLowerCase();
    const hits = RECLAIM_BANNED_LEXICON.filter((term) => lower.includes(term.toLowerCase()));
    expect(hits).toEqual([]);
  });

  it('brandVoiceInstructions names every banned term (the prohibition is complete)', () => {
    const lower = reclaimCoachAgent.brandVoiceInstructions.toLowerCase();
    for (const term of RECLAIM_BANNED_LEXICON) {
      expect(lower).toContain(term.toLowerCase());
    }
  });
});

describe('I1 — third-person voice, never Rashmir, never the model', () => {
  it.each(ALL_FIELDS)('%s carries no first-person-as-Rashmir construction', (_name, text) => {
    for (const re of FIRST_PERSON_RASHMIR) {
      expect(text).not.toMatch(re);
    }
  });

  it.each(ALL_FIELDS)('%s never attributes the tool to Claude or Anthropic', (_name, text) => {
    expect(text).not.toMatch(/\bClaude\b/i);
    expect(text).not.toMatch(/\bAnthropic\b/i);
  });

  it('attributes the tool to Rashmir Balasubramaniam in the third person', () => {
    // The distinction is kept by naming her as the designer, third-person, somewhere in the content.
    const all = ALL_FIELDS.map(([, text]) => text).join('\n');
    expect(all).toContain('Rashmir Balasubramaniam');
  });
});
