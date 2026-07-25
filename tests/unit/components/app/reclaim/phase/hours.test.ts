/**
 * Shared hours/count parsing (F7). The load-bearing distinction: an explicit "0" is a real answer
 * (0 hours) that `isHours` accepts, while blank/negative/non-numeric inputs are rejected and
 * `parseHours` clamps them to 0 for safe display + arithmetic (I8 — hours, never percentages).
 */

import { describe, it, expect } from 'vitest';
import { parseHours, isHours } from '@/components/app/reclaim/phase/hours';

describe('parseHours', () => {
  it('returns the number for a valid non-negative input', () => {
    expect(parseHours('10')).toBe(10);
    expect(parseHours('7.5')).toBe(7.5);
    expect(parseHours('0')).toBe(0);
  });

  it('clamps blank, negative, and non-numeric inputs to 0', () => {
    expect(parseHours('')).toBe(0);
    expect(parseHours('   ')).toBe(0);
    expect(parseHours('-4')).toBe(0);
    expect(parseHours('abc')).toBe(0);
    expect(parseHours('NaN')).toBe(0);
  });
});

describe('isHours', () => {
  it('accepts a non-negative finite number — including an explicit 0', () => {
    expect(isHours('10')).toBe(true);
    expect(isHours('0')).toBe(true);
    expect(isHours(' 3.5 ')).toBe(true);
  });

  it('rejects blank, negative, and non-numeric inputs', () => {
    expect(isHours('')).toBe(false);
    expect(isHours('   ')).toBe(false);
    expect(isHours('-1')).toBe(false);
    expect(isHours('two')).toBe(false);
  });
});
