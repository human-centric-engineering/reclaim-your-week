/**
 * The fabricated transcript (F19).
 *
 * The prose rules are checked here as well as in `product-voice.test.ts`, and the duplication is
 * deliberate: that guard reads the file off disk with comments stripped and holds every coach-voiced
 * file to the same two rules, which is a good tripwire and a poor explanation. These assertions run
 * against the values a reader will actually be handed, and each one names the failure it is watching
 * for, so somebody who trips one finds out why the rule exists rather than only that it does.
 *
 * `isFabricatedConversation` gets the closest reading of anything here, because it is the whole of
 * what makes writing these rows acceptable. If it ever answers `false` for a fabricated conversation,
 * an operator reads invented words as a leader's own.
 */

import { describe, it, expect } from 'vitest';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { COACH_SYNTHETIC_MESSAGES } from '@/lib/app/programme/coach/opening';
import { EM_DASH, FIRST_PERSON_RASHMIR } from '@/tests/helpers/voice-rules';
import {
  FABRICATED_METADATA,
  isFabricatedConversation,
  previewTurnsForPhase,
} from '@/lib/app/programme/preview/conversation';

const PHASES = [0, 1, 2, 3, 4, 5, 6];
const allTurns = () => PHASES.flatMap((index) => [...previewTurnsForPhase(index)]);

describe('previewTurnsForPhase — the exchange itself', () => {
  it('gives every phase something to show', () => {
    // A phase whose fixture is empty is a phase an operator opens to a silent coach, which is the
    // state this whole file exists to stop being the only one available.
    for (const index of PHASES) expect(previewTurnsForPhase(index).length).toBeGreaterThan(0);
  });

  it('opens every phase with the coach, the way every real phase opens', () => {
    for (const index of PHASES) expect(previewTurnsForPhase(index)[0]?.role).toBe('coach');
  });

  it('returns nothing for a phase outside the audit rather than throwing', () => {
    // The caller has already validated the phase against the map. A fabricated audit that failed
    // outright because a transcript fixture was short would be the worse outcome by far.
    expect(previewTurnsForPhase(7)).toEqual([]);
    expect(previewTurnsForPhase(-1)).toEqual([]);
  });

  it('writes no synthetic trigger rows', () => {
    // Both surfaces filter `COACH_SYNTHETIC_MESSAGES` back out. Writing them would add rows every
    // reader is built to hide, reproducing a framework limitation rather than a leader's experience.
    for (const turn of allTurns()) {
      expect(COACH_SYNTHETIC_MESSAGES).not.toContain(turn.text.trim());
    }
  });

  it('leaves no turn empty, which reads as a dead generation', () => {
    // An empty assistant row is what the tail of a tool-call round trip looks like, and
    // `coachOpeningWentUnspoken` treats a conversation ending in one as a turn that never happened.
    for (const turn of allTurns()) expect(turn.text.trim().length).toBeGreaterThan(0);
  });
});

describe('previewTurnsForPhase — I1 and I2 over the coach’s own words', () => {
  const coach = () => allTurns().filter((t) => t.role === 'coach');

  it('uses no em dash anywhere', () => {
    for (const turn of allTurns()) expect(turn.text).not.toContain(EM_DASH);
  });

  it('uses none of the banned terms', () => {
    const text = allTurns()
      .map((t) => t.text)
      .join(' ')
      .toLowerCase();

    expect(RECLAIM_BANNED_LEXICON.filter((term) => text.includes(term.toLowerCase()))).toEqual([]);
  });

  it('never speaks as Rashmir', () => {
    // The tool is an instrument she designed, named in the third person. The mistake this catches is
    // content ported from the source system prompt, which is written in her first person.
    for (const turn of coach()) {
      for (const pattern of FIRST_PERSON_RASHMIR) expect(turn.text).not.toMatch(pattern);
    }
  });

  it('names the designer sparingly rather than as a signature', () => {
    // Once, in the opening, which is where the real coach places it. A transcript that says it every
    // phase is the marketing voice I1 exists to keep out.
    const mentions = coach().filter((t) => t.text.includes('Rashmir'));

    expect(mentions).toHaveLength(1);
    expect(previewTurnsForPhase(0)[0]?.text).toContain('Rashmir');
  });
});

describe('isFabricatedConversation', () => {
  it('recognises what the fabricator writes', () => {
    // Pinned against the constant rather than a literal, so the reader and the writer cannot drift.
    expect(isFabricatedConversation(FABRICATED_METADATA)).toBe(true);
    expect(isFabricatedConversation({ fabricated: true, other: 'ignored' })).toBe(true);
  });

  it('reads anything else as a real conversation', () => {
    // `metadata` is a Json column whose runtime shape is whatever was written, by any build that ever
    // ran. Badging a genuine transcript as fabricated would tell an operator to disregard a leader's
    // actual words, which is much the worse of the two mistakes.
    for (const value of [
      null,
      undefined,
      'fabricated',
      42,
      true,
      {},
      [],
      { fabricated: false },
      { fabricated: 'true' },
      { fabricated: 1 },
    ]) {
      expect(isFabricatedConversation(value)).toBe(false);
    }
  });
});
