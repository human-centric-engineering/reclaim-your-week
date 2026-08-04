/**
 * The rule that keeps an offer attached to a question.
 *
 * What is under test is the line between two states that look identical from the outside: a reading
 * this audit holds and has finished with, and one it holds but is going back for. Both are "answered"
 * in the run; only the second is still a question, and only the second may have answers drawn under
 * it. Getting that line wrong in either direction costs a leader something real — buttons under a
 * question nobody asked, or a blank box on the turn where the audit asks them to correct a reading it
 * claims they gave.
 *
 * So the assertions are about the flag rather than about presence, and the last one is about failing
 * open, which is the deliberate choice this guard shares with the pairing guard beside it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readingIsSettled } from '@/lib/app/programme/coach/settled-reading';

const { readRunAnswers } = vi.hoisted(() => ({ readRunAnswers: vi.fn() }));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers }));

const asked = { userId: 'user_leader_1', runId: 'run_q3_2026' };

/** A reading the leader stated outright, which is what a form write and a plain answer both look like. */
const stated = (value: string) => ({
  value,
  valueJson: null,
  sourceType: 'direct',
  confidence: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  readRunAnswers.mockResolvedValue({});
});

describe('readingIsSettled', () => {
  it('is false for a reading this run has never captured', async () => {
    expect(await readingIsSettled({ ...asked, slotSlug: 'reclaim_setup_audit_period' })).toBe(
      false
    );
  });

  it('is true for a reading the leader answered outright', async () => {
    // The live failure this exists for: the period, tapped by the leader and recorded in the same
    // turn the coach offered its four options again.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_audit_period: stated('last quarter'),
    });

    expect(await readingIsSettled({ ...asked, slotSlug: 'reclaim_setup_audit_period' })).toBe(true);
  });

  it('is false for a reading the coach inferred and has not had confirmed', async () => {
    // The audit currently claims something the leader never said, so this reading is owed a turn and
    // the answers belong under it.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_audit_period: {
        value: 'last month',
        valueJson: null,
        sourceType: 'inferred',
        confidence: 5,
      },
    });

    expect(await readingIsSettled({ ...asked, slotSlug: 'reclaim_setup_audit_period' })).toBe(
      false
    );
  });

  it('is false for a texture reading that came back short, which is owed one more turn', async () => {
    // `reclaim_setup_priorities` is a reading whose purpose is prose, so a two-word answer is one the
    // coach goes back to once. Nothing here offers *it* a set, and that is the point of asserting it:
    // the predicate states a fact about the reading, not about the control.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_priorities: stated('staying sane'),
    });

    expect(await readingIsSettled({ ...asked, slotSlug: 'reclaim_setup_priorities' })).toBe(false);
  });

  it('is true for a captured yes-or-no, because a typed reading is never flagged', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_setup_in_transition: {
        value: 'Yes',
        valueJson: true,
        sourceType: 'direct',
        confidence: 10,
      },
    });

    expect(await readingIsSettled({ ...asked, slotSlug: 'reclaim_setup_in_transition' })).toBe(
      true
    );
  });

  it('says nothing is settled when the run cannot be read', async () => {
    // Fails open, exactly as `asksInsideCompoundQuestion` does. A wrong offer names the reading it is
    // for and sits beside a way to type instead; an offer withheld from every leader for the length
    // of a database wobble is invisible and unrecoverable.
    readRunAnswers.mockRejectedValue(new Error('the run could not be read'));

    expect(await readingIsSettled({ ...asked, slotSlug: 'reclaim_setup_audit_period' })).toBe(
      false
    );
  });
});
