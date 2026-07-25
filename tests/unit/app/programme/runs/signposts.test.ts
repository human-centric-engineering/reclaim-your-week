/**
 * Per-phase signpost copy (F4 t-4). A static map, so the test is structural: every one of the seven
 * map phases must have a signpost with non-empty copy, and there must be no signpost for a phase the
 * map does not define. A missing entry would render a phase with an empty signpost band on resume.
 */

import { describe, it, expect } from 'vitest';
import { PHASE_SIGNPOSTS } from '@/lib/app/programme/runs/signposts';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';

describe('PHASE_SIGNPOSTS', () => {
  it('has exactly one entry per map phase — no gaps, no strays', () => {
    const phaseKeys = RECLAIM_PHASES.map((p) => p.key).sort();
    expect(Object.keys(PHASE_SIGNPOSTS).sort()).toEqual(phaseKeys);
  });

  it('gives every phase non-empty involves + duration copy', () => {
    for (const phase of RECLAIM_PHASES) {
      const signpost = PHASE_SIGNPOSTS[phase.key];
      expect(signpost, `missing signpost for ${phase.key}`).toBeDefined();
      expect(signpost.involves.trim().length).toBeGreaterThan(0);
      expect(signpost.duration.trim().length).toBeGreaterThan(0);
    }
  });
});
