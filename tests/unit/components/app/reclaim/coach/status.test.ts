/**
 * The translation between the platform's stream vocabulary and what a leader is told.
 *
 * Small enough to look not worth testing, and it is the one place an internal identifier can reach a
 * coaching screen: the raw frame reads `Executing reclaim_audit__record_answers`. So what is pinned
 * here is the *totality* of the mapping — anything unrecognised, including anything a future upstream
 * release adds, comes out as "Thinking…" rather than passing through.
 */

import { describe, it, expect } from 'vitest';
import { leaderFacingStatus } from '@/components/app/reclaim/coach/status';

describe('leaderFacingStatus', () => {
  it('names the capture as making a note, without the tool slug', () => {
    expect(leaderFacingStatus('Executing reclaim_audit__record_answers')).toBe('Making a note…');
  });

  it('names a read as looking back, since nothing is being written', () => {
    expect(leaderFacingStatus('Executing get_journey_state')).toBe('Looking back over your audit…');
  });

  it('translates the platform statuses it knows', () => {
    expect(leaderFacingStatus('Thinking...')).toBe('Thinking…');
    expect(leaderFacingStatus('Processing tool results...')).toBe('Thinking…');
    expect(leaderFacingStatus('Summarizing conversation history...')).toBe('Gathering the thread…');
  });

  it('never passes an unknown status through to a leader', () => {
    expect(leaderFacingStatus('Some new upstream phase (v9)')).toBe('Thinking…');
    expect(leaderFacingStatus('')).toBe('Thinking…');
    expect(leaderFacingStatus(null)).toBe('Thinking…');
    expect(leaderFacingStatus(undefined)).toBe('Thinking…');
  });
});
