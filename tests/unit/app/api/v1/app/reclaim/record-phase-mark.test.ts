/**
 * `recordPhaseMark` — where a phase's part of the one conversation begins.
 *
 * A run holds a single `AiConversation` across all seven phases, so the mark is what stops phase 2
 * opening on top of phase 1. The whole mechanism turns on one property, and it is not an obvious one:
 * **the id recorded here must be an id the surface can find.**
 *
 * `loadTranscript` keeps only `user`/`assistant` rows with non-empty text — a `tool` row and the
 * empty assistant row a silent `record_answers` turn leaves behind are both dropped before the client
 * ever searches. Mark one of those and `sliceByWindow` finds no match, reads the miss as an erased
 * message, and falls back to the open end: the phase draws the entire audit, and it does so
 * permanently, because a mark is written once and never revised. That is why the reader's predicate is
 * mirrored in the query rather than assumed, and why the tests below assert on *which* row was chosen
 * rather than merely that something was written.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { runFindFirstMock, runUpdateMock, messageFindManyMock } = vi.hoisted(() => ({
  runFindFirstMock: vi.fn(),
  runUpdateMock: vi.fn(),
  messageFindManyMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findFirst: runFindFirstMock, update: runUpdateMock },
    aiMessage: { findMany: messageFindManyMock },
  },
}));

import { recordPhaseMark } from '@/app/api/v1/app/reclaim/runs/service';

const USER_ID = 'user-1';
const RUN_ID = 'run-1';
const CONVERSATION_ID = 'conv-1';

/** A run that has a conversation to divide, with whatever marks are already on it. */
const runWithConversation = (phaseMarks: Record<string, string> = {}) => ({
  conversationId: CONVERSATION_ID,
  phaseMarks,
});

beforeEach(() => {
  runFindFirstMock.mockReset();
  runUpdateMock.mockReset();
  messageFindManyMock.mockReset();
  runUpdateMock.mockResolvedValue({});
});

describe('recordPhaseMark', () => {
  it('marks the last message the transcript would actually render', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation());
    messageFindManyMock.mockResolvedValue([
      { id: 'm-9', content: 'So that is the shape of your week.' },
      { id: 'm-8', content: 'Mostly meetings, if I am honest.' },
    ]);

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { phaseMarks: { 'phase-2-energy': 'm-9' } },
    });
  });

  it('never asks the database for a row the transcript would drop', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation());
    messageFindManyMock.mockResolvedValue([{ id: 'm-9', content: 'A real turn.' }]);

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    // The reader's predicate, mirrored. A `tool` row or an empty assistant row marked here would be
    // invisible to `sliceByWindow`, which would then draw the phase from the top of the audit.
    expect(messageFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: CONVERSATION_ID,
          role: { in: ['user', 'assistant'] },
          content: { not: '' },
        },
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('skips a whitespace-only row, which SQL’s "not empty" does not catch', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation());
    messageFindManyMock.mockResolvedValue([
      { id: 'm-9', content: '   \n  ' },
      { id: 'm-8', content: 'The turn the leader would see.' },
    ]);

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { phaseMarks: { 'phase-2-energy': 'm-8' } },
    });
  });

  it('keeps the marks already recorded for earlier phases', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation({ 'phase-1-current': 'm-3' }));
    messageFindManyMock.mockResolvedValue([{ id: 'm-9', content: 'A real turn.' }]);

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { phaseMarks: { 'phase-1-current': 'm-3', 'phase-2-energy': 'm-9' } },
    });
  });

  it('never moves a boundary the leader has already read', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation({ 'phase-2-energy': 'm-3' }));

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    expect(runUpdateMock).not.toHaveBeenCalled();
    // Not even read: re-cutting a phase is refused before the conversation is looked at.
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });

  it('writes nothing when the run has no conversation yet', async () => {
    runFindFirstMock.mockResolvedValue({ conversationId: null, phaseMarks: {} });

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    expect(messageFindManyMock).not.toHaveBeenCalled();
    expect(runUpdateMock).not.toHaveBeenCalled();
  });

  it('writes nothing when the run is not this leader’s', async () => {
    runFindFirstMock.mockResolvedValue(null);

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    expect(runFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: RUN_ID, userId: USER_ID } })
    );
    expect(runUpdateMock).not.toHaveBeenCalled();
  });

  it('writes no mark when nothing on screen precedes the phase', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation());
    messageFindManyMock.mockResolvedValue([]);

    await recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy');

    // A phase with no mark opens at the start of the transcript, which is correct when there is
    // nothing before it.
    expect(runUpdateMock).not.toHaveBeenCalled();
  });

  it('swallows a write failure, because the move was already earned', async () => {
    runFindFirstMock.mockResolvedValue(runWithConversation());
    messageFindManyMock.mockResolvedValue([{ id: 'm-9', content: 'A real turn.' }]);
    runUpdateMock.mockRejectedValue(new Error('write failed'));

    await expect(recordPhaseMark(USER_ID, RUN_ID, 'phase-2-energy')).resolves.toBeUndefined();
  });
});
