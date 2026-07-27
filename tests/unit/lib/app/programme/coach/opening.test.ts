/**
 * The coach-opening moments and the synthetic trigger.
 *
 * Small pure module, but two of these assertions are load-bearing in a way the code cannot express on
 * its own: the moment-to-phase map is what the route refuses on, and the trigger list is what keeps a
 * message the leader never wrote out of their own transcript.
 */

import { describe, it, expect } from 'vitest';
import {
  COACH_OPENING_MOMENTS,
  COACH_OPENING_PHASES,
  COACH_OPENING_TRIGGER,
  COACH_SYNTHETIC_MESSAGES,
  isCoachSyntheticMessage,
  openingBelongsToPhase,
} from '@/lib/app/programme/coach/opening';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';

describe('the moments', () => {
  it('every moment names a phase the map actually has', () => {
    // A moment pointing at a phase key that does not exist would be unreachable: the route compares
    // it against the journey's phase and would refuse it forever, silently.
    for (const moment of COACH_OPENING_MOMENTS) {
      expect(RECLAIM_PHASE_KEYS).toContain(COACH_OPENING_PHASES[moment]);
    }
  });

  it('matches a moment only to its own phase', () => {
    expect(openingBelongsToPhase('phase-4-gap', 'phase-4-gap')).toBe(true);
    expect(openingBelongsToPhase('phase-4-gap', 'phase-1-current')).toBe(false);
    expect(openingBelongsToPhase('phase-1-chart-reveal', 'phase-1-current')).toBe(true);
    expect(openingBelongsToPhase('phase-1-chart-reveal', 'phase-4-gap')).toBe(false);
  });

  it('has no duplicate moment names', () => {
    expect(new Set(COACH_OPENING_MOMENTS).size).toBe(COACH_OPENING_MOMENTS.length);
  });
});

describe('the synthetic trigger', () => {
  it('is in the list of everything we have ever sent', () => {
    // The list is what the filters read. A trigger changed without being appended here would start
    // appearing in leaders' transcripts as though they had written it.
    expect(COACH_SYNTHETIC_MESSAGES).toContain(COACH_OPENING_TRIGGER);
  });

  it('reads as a stage direction rather than as something a leader would type', () => {
    // It stays in the model's history for the rest of the run, so it has to make sense to a model
    // reading back over the conversation, and to anyone who finds it in a database row.
    expect(COACH_OPENING_TRIGGER.startsWith('(')).toBe(true);
    expect(COACH_OPENING_TRIGGER).toContain('has not spoken yet');
  });

  it('is recognised only on a user row, and tolerates surrounding whitespace', () => {
    expect(isCoachSyntheticMessage('user', COACH_OPENING_TRIGGER)).toBe(true);
    expect(isCoachSyntheticMessage('user', `  ${COACH_OPENING_TRIGGER}\n`)).toBe(true);
    expect(isCoachSyntheticMessage('assistant', COACH_OPENING_TRIGGER)).toBe(false);
  });

  it('does not swallow a leader who happens to write something similar', () => {
    expect(isCoachSyntheticMessage('user', 'The leader has not spoken yet')).toBe(false);
    expect(isCoachSyntheticMessage('user', 'I have not spoken yet')).toBe(false);
    expect(isCoachSyntheticMessage('user', '')).toBe(false);
  });
});
