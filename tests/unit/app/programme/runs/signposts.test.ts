/**
 * Per-phase signpost copy (F4 t-4, extended for the conversational surface). Static data, so the test
 * is structural: every one of the seven map phases must have a card with non-empty copy, there must be
 * no card for a phase the map does not define, and phase 0's opening must still carry Rashmir's
 * process outline as its own paragraph.
 *
 * That last one is the load-bearing assertion. The outline is guarded character-identical against the
 * source by I11 hop 2, and it only stays guarded while it is a **separate array element**: folded into
 * a longer sentence it would become app-authored prose that merely contains her words, and the guard
 * would have nothing to compare.
 */

import { describe, it, expect } from 'vitest';
import {
  RECLAIM_PHASE_SIGNPOSTS,
  RECLAIM_WARM_OPEN,
  signpostFor,
} from '@/lib/app/programme/runs/signposts';
import { RECLAIM_PROCESS_OUTLINE } from '@/lib/app/programme/content';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';

describe('RECLAIM_PHASE_SIGNPOSTS', () => {
  it('has exactly one entry per map phase — no gaps, no strays', () => {
    const phaseKeys = RECLAIM_PHASES.map((p) => p.key).sort();
    expect(RECLAIM_PHASE_SIGNPOSTS.map((s) => s.phaseKey).sort()).toEqual(phaseKeys);
  });

  it('gives every phase non-empty involves + duration copy', () => {
    for (const phase of RECLAIM_PHASES) {
      const signpost = signpostFor(phase.key);
      expect(signpost, `missing signpost for ${phase.key}`).not.toBeNull();
      expect(signpost!.involves.trim().length).toBeGreaterThan(0);
      expect(signpost!.duration.trim().length).toBeGreaterThan(0);
    }
  });

  it('opens phase 0 with the warm open and then the process outline, as separate beats', () => {
    const setup = signpostFor('phase-0-setup');
    expect(setup!.opening).toEqual([RECLAIM_WARM_OPEN, RECLAIM_PROCESS_OUTLINE]);
  });

  it('keeps the process outline verbatim rather than embedded in a longer paragraph', () => {
    // If this fails because someone merged the beats, the fix is to split them again, not to relax
    // the assertion: I11 hop 2 can only compare a field that is exactly her sentence.
    const setup = signpostFor('phase-0-setup');
    expect(setup!.opening).toContain(RECLAIM_PROCESS_OUTLINE);
  });

  it('opens every phase but the summary, which is the panel that opens itself', () => {
    for (const phase of RECLAIM_PHASES) {
      const opening = signpostFor(phase.key)!.opening;
      if (phase.key === 'phase-6-summary') {
        expect(opening).toEqual([]);
      } else {
        expect(opening.length, `no opening for ${phase.key}`).toBeGreaterThan(0);
      }
    }
  });

  it('returns null for a phase the config no longer defines', () => {
    // Operator-editable data, so a deleted entry must lose its card quietly rather than throw on a
    // leader's screen.
    expect(signpostFor('phase-9-invented')).toBeNull();
    expect(signpostFor('phase-0-setup', [])).toBeNull();
  });
});
