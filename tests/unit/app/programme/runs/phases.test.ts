/**
 * Phase adjacency + reflection-slot derivation (F4 t-3). Pure, no DB.
 */

import { describe, it, expect } from 'vitest';
import {
  RECLAIM_PHASE_KEYS,
  FIRST_PHASE_KEY,
  FINAL_PHASE_KEY,
  phaseNumber,
  nextPhaseKey,
  reflectionSlugForLeaving,
} from '@/lib/app/programme/runs/phases';

describe('phases', () => {
  it('has the seven phases with the right endpoints', () => {
    expect(RECLAIM_PHASE_KEYS).toHaveLength(7);
    expect(FIRST_PHASE_KEY).toBe('phase-0-setup');
    expect(FINAL_PHASE_KEY).toBe('phase-6-summary');
  });

  it('nextPhaseKey walks the chain and stops at the end', () => {
    expect(nextPhaseKey('phase-0-setup')).toBe('phase-1-current');
    expect(nextPhaseKey('phase-5-action')).toBe('phase-6-summary');
    expect(nextPhaseKey('phase-6-summary')).toBeNull();
    expect(nextPhaseKey('not-a-phase')).toBeNull();
  });

  it('phaseNumber reads the 0–6 index', () => {
    expect(phaseNumber('phase-0-setup')).toBe(0);
    expect(phaseNumber('phase-4-gap')).toBe(4);
    expect(phaseNumber('nope')).toBeNull();
  });

  it('reflectionSlugForLeaving gates phases 1–5 only', () => {
    // Phase 0 (setup) and Phase 6 (summary) have no reflection.
    expect(reflectionSlugForLeaving('phase-0-setup')).toBeNull();
    expect(reflectionSlugForLeaving('phase-6-summary')).toBeNull();
    // Phases 1–5 each require their reflection slot.
    expect(reflectionSlugForLeaving('phase-1-current')).toBe('reclaim_reflection_p1');
    expect(reflectionSlugForLeaving('phase-5-action')).toBe('reclaim_reflection_p5');
  });
});
