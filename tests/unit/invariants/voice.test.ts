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
 * re-typed here, so the guard and the prohibition can never drift apart. The em dash and the
 * first-person patterns come from `@/tests/helpers/voice-rules` for the same reason: this guard and
 * `product-voice.test.ts` must tighten together, not one at a time.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent, RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { reclaimAnalystAgent } from '@/lib/app/programme/analyst/agent';
import { EM_DASH, FIRST_PERSON_RASHMIR } from '@/tests/helpers/voice-rules';

/** The three prose fields that must read cleanly. `brandVoiceInstructions` is handled separately —
 *  it is the one field that names the banned terms, as prohibitions. */
const PROSE_FIELDS: Array<[string, string]> = [
  ['persona', reclaimCoachAgent.persona],
  ['systemInstructions', reclaimCoachAgent.systemInstructions],
  ['guardrails', reclaimCoachAgent.guardrails],
  // F14: the analyst is a second authored voice. It is not conversational, but it writes two
  // sections of the artifact the leader keeps, so I1 and I2 bind it exactly as they bind the coach.
  ['analyst.persona', reclaimAnalystAgent.persona],
  ['analyst.systemInstructions', reclaimAnalystAgent.systemInstructions],
  ['analyst.guardrails', reclaimAnalystAgent.guardrails],
];

const ALL_FIELDS: Array<[string, string]> = [
  ...PROSE_FIELDS,
  ['brandVoiceInstructions', reclaimCoachAgent.brandVoiceInstructions],
  ['analyst.brandVoiceInstructions', reclaimAnalystAgent.brandVoiceInstructions],
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

  // F14: the analyst carries its own copy of the prohibition, in the same field, for the same
  // reason — a prose field listing the banned terms would fail the check above.
  it.each([
    ['coach', reclaimCoachAgent.brandVoiceInstructions],
    ['analyst', reclaimAnalystAgent.brandVoiceInstructions],
  ])(
    '%s brandVoiceInstructions names every banned term (the prohibition is complete)',
    (_n, field) => {
      const lower = field.toLowerCase();
      for (const term of RECLAIM_BANNED_LEXICON) {
        expect(lower).toContain(term.toLowerCase());
      }
    }
  );
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
