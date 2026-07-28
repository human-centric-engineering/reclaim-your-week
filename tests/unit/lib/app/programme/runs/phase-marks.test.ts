/**
 * Cutting the run's one conversation into phases.
 *
 * A run holds a single `AiConversation` for all seven phases (I15 keeps it live until the run
 * completes), so "this phase's conversation" is arithmetic over message ids rather than a property of
 * the data. What these pin is the arithmetic — both surfaces run it, and if they ever disagreed about
 * where a phase began, the live conversation and the same phase re-read from the spine would show
 * different things.
 *
 * The degrade cases matter as much as the happy one. Messages are core-owned and erased on their own
 * schedule, and the failure a leader must never meet is an empty phase: it reads as though the audit
 * lost their conversation.
 */

import { describe, it, expect } from 'vitest';
import { phaseWindow, readPhaseMarks, sliceByWindow } from '@/lib/app/programme/runs/phase-marks';

/** A conversation as the client holds it: ordered, each message carrying its id. */
const messages = [
  { id: 'm1' }, // phase 0
  { id: 'm2' },
  { id: 'm3' }, // phase 1 begins after m2
  { id: 'm4' },
  { id: 'm5' }, // phase 2 begins after m4
  { id: 'm6' },
];

/** Entering phase 1 recorded m2; entering phase 2 recorded m4. Phase 0 was never entered. */
const marks = { 'phase-1-current': 'm2', 'phase-2-energy': 'm4' };

describe('phaseWindow', () => {
  it('opens phase 0 at the start of the conversation, since nothing was entered to reach it', () => {
    expect(phaseWindow(marks, 'phase-0-setup')).toEqual({ afterId: null, throughId: 'm2' });
  });

  it('bounds a finished phase by its own mark and the next one', () => {
    expect(phaseWindow(marks, 'phase-1-current')).toEqual({ afterId: 'm2', throughId: 'm4' });
  });

  it('runs the phase the leader is on to the end, because it has no later mark yet', () => {
    expect(phaseWindow(marks, 'phase-2-energy')).toEqual({ afterId: 'm4', throughId: null });
  });

  /**
   * A phase entered while the conversation did not yet exist records no mark (the leader was on the
   * forms). Skipping to the next phase that *does* have one keeps the window continuous rather than
   * collapsing it to nothing.
   */
  it('reaches past an unmarked phase for its upper bound', () => {
    const sparse = { 'phase-3-ideal': 'm5' };
    expect(phaseWindow(sparse, 'phase-1-current')).toEqual({ afterId: null, throughId: 'm5' });
  });

  it('gives an unknown phase the whole conversation rather than nothing', () => {
    expect(phaseWindow(marks, 'not-a-phase')).toEqual({ afterId: null, throughId: null });
  });
});

describe('sliceByWindow', () => {
  it('takes everything after the phase’s own mark, up to and including the next', () => {
    const slice = sliceByWindow(messages, phaseWindow(marks, 'phase-1-current'));
    expect(slice.map((m) => m.id)).toEqual(['m3', 'm4']);
  });

  it('gives phase 0 the head of the conversation', () => {
    const slice = sliceByWindow(messages, phaseWindow(marks, 'phase-0-setup'));
    expect(slice.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('gives the live phase the tail, so a new turn lands inside it', () => {
    const slice = sliceByWindow(messages, phaseWindow(marks, 'phase-2-energy'));
    expect(slice.map((m) => m.id)).toEqual(['m5', 'm6']);
  });

  it('covers the whole conversation across the phases, losing nothing and repeating nothing', () => {
    const all = ['phase-0-setup', 'phase-1-current', 'phase-2-energy'].flatMap((key) =>
      sliceByWindow(messages, phaseWindow(marks, key)).map((m) => m.id)
    );
    expect(all).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  /**
   * The degrade that matters. An erased message leaves a mark pointing at nothing; falling back to
   * the open end shows too much of the transcript, which is a cosmetic regression. Collapsing to an
   * empty slice would tell the leader their conversation is gone.
   */
  it('falls back to the open end when a mark’s message is gone', () => {
    const orphaned = { 'phase-1-current': 'deleted', 'phase-2-energy': 'also-deleted' };
    const slice = sliceByWindow(messages, phaseWindow(orphaned, 'phase-1-current'));
    expect(slice.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  it('never returns a reversed slice when the marks are out of order', () => {
    const backwards = { 'phase-1-current': 'm5', 'phase-2-energy': 'm2' };
    expect(sliceByWindow(messages, phaseWindow(backwards, 'phase-1-current'))).toEqual([]);
  });
});

describe('readPhaseMarks', () => {
  it('reads a well-formed map', () => {
    expect(readPhaseMarks({ 'phase-1-current': 'm2' })).toEqual({ 'phase-1-current': 'm2' });
  });

  /**
   * Never `as` on what comes off a Json column or an API. Anything unreadable degrades to "no marks",
   * which draws every phase from the top of the conversation — the behaviour this replaced, and never
   * an error on screen.
   */
  it.each([[null], [undefined], ['a string'], [{ 'phase-1-current': 7 }], [[1, 2, 3]]])(
    'degrades %p to no marks rather than throwing',
    (value) => {
      expect(readPhaseMarks(value)).toEqual({});
    }
  );
});
