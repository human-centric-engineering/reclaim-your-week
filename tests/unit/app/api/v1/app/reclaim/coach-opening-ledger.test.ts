/**
 * `releaseCoachOpening` and `coachOpeningWentUnspoken` — the two halves of not leaving a phase silent.
 *
 * The moment ledger claims before it generates, which is right: a reload part-way through a slow turn
 * must not buy a second generation. What that ordering cost, once every phase began with the coach
 * speaking, is the case these two functions exist for — a turn cut off before its first token leaves
 * the moment claimed, and every load afterwards is told the beat has already happened. The leader gets
 * a signpost card, an empty column and a coach that will never speak.
 *
 * So: a turn that said nothing gives its claim back, and a claim that outlived its turn under an
 * older build is repaired by reading the transcript instead of the ledger. The tests below hold the
 * two properties that make the repair safe — it reads "the coach has spoken since" from an assistant
 * row with words in it, and it will not re-open anything while the conversation is still moving.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { COACH_ARRIVAL_TRIGGER, COACH_OPENING_TRIGGER } from '@/lib/app/programme/coach/opening';

const { executeRawMock, messageFindManyMock, loggerWarnMock } = vi.hoisted(() => ({
  executeRawMock: vi.fn(),
  messageFindManyMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    $executeRaw: executeRawMock,
    aiMessage: { findMany: messageFindManyMock },
  },
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: loggerWarnMock, error: vi.fn(), debug: vi.fn() },
}));

import {
  releaseCoachOpening,
  coachOpeningWentUnspoken,
} from '@/app/api/v1/app/reclaim/runs/service';

const USER_ID = 'user-1';
const RUN_ID = 'run-1';
const CONVERSATION_ID = 'conv-1';

const NOW = new Date('2026-07-31T10:30:00.000Z');
/** Older than the quiet window, so a turn that ended here is not one still being generated. */
const LONG_AGO = new Date('2026-07-31T10:00:00.000Z');
/** Inside the quiet window — a turn that may still be running. */
const A_MOMENT_AGO = new Date('2026-07-31T10:29:30.000Z');

const message = (
  role: 'user' | 'assistant',
  content: string,
  createdAt: Date = LONG_AGO
): { role: string; content: string; createdAt: Date } => ({ role, content, createdAt });

beforeEach(() => {
  executeRawMock.mockReset();
  messageFindManyMock.mockReset();
  loggerWarnMock.mockReset();
  executeRawMock.mockResolvedValue(1);
});

describe('releaseCoachOpening', () => {
  it('removes just that moment, scoped to the run and the caller', async () => {
    await releaseCoachOpening(USER_ID, RUN_ID, 'phase-4-gap');

    expect(executeRawMock).toHaveBeenCalledTimes(1);
    // A tagged template: the SQL fragments arrive as the first argument, the values after it. The
    // statement has to be `array_remove` rather than a read-then-`set`, or a moment another turn
    // pushed between the two would be lost.
    const [fragments, ...values] = executeRawMock.mock.calls[0] as [string[], ...unknown[]];
    expect(fragments.join('?')).toContain('array_remove');
    expect(values).toEqual(['phase-4-gap', RUN_ID, USER_ID]);
  });

  it('never throws: a failed release costs an opener, not the leader’s turn', async () => {
    executeRawMock.mockRejectedValue(new Error('connection reset'));

    await expect(releaseCoachOpening(USER_ID, RUN_ID, 'phase-4-gap')).resolves.toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});

describe('coachOpeningWentUnspoken', () => {
  it('is true when the last trigger was never answered', async () => {
    // Exactly the state a cut-off opening leaves behind: the stage direction persisted, and nothing
    // after it.
    messageFindManyMock.mockResolvedValue([message('user', COACH_ARRIVAL_TRIGGER)]);

    expect(await coachOpeningWentUnspoken(CONVERSATION_ID, NOW)).toBe(true);
  });

  it('is false when the coach has spoken since it was told to open', async () => {
    messageFindManyMock.mockResolvedValue([
      message('assistant', 'This part is about where the week actually goes.'),
      message('user', COACH_ARRIVAL_TRIGGER),
    ]);

    expect(await coachOpeningWentUnspoken(CONVERSATION_ID, NOW)).toBe(false);
  });

  it('reads only as far back as the newest trigger', async () => {
    // Phase 3 opened and was talked through; phase 4's opening then died. The assistant rows above
    // the newest trigger belong to the phase before it and must not count as this beat happening.
    messageFindManyMock.mockResolvedValue([
      message('user', COACH_OPENING_TRIGGER),
      message('assistant', 'That is the week you would want, then.'),
      message('user', 'Fewer meetings, mostly.'),
    ]);

    expect(await coachOpeningWentUnspoken(CONVERSATION_ID, NOW)).toBe(true);
  });

  it('will not re-open a conversation that is still moving', async () => {
    // The double-open guard. Two tabs arriving at the same phase within seconds must not both be
    // told to speak, so a trigger this fresh is read as a turn in flight rather than a dead one.
    messageFindManyMock.mockResolvedValue([message('user', COACH_ARRIVAL_TRIGGER, A_MOMENT_AGO)]);

    expect(await coachOpeningWentUnspoken(CONVERSATION_ID, NOW)).toBe(false);
  });

  it('is false for a conversation with nothing in it yet', async () => {
    // Not evidence of a dead turn — it is what the first turn of a run looks like from here while it
    // is still being generated.
    messageFindManyMock.mockResolvedValue([]);

    expect(await coachOpeningWentUnspoken(CONVERSATION_ID, NOW)).toBe(false);
  });

  it('is false when the leader spoke last: nothing is owed', async () => {
    messageFindManyMock.mockResolvedValue([
      message('user', 'About ten hours, I think.'),
      message('assistant', 'How much of the week goes on that?'),
      message('user', COACH_ARRIVAL_TRIGGER),
    ]);

    expect(await coachOpeningWentUnspoken(CONVERSATION_ID, NOW)).toBe(false);
  });

  it('never asks the database for a row that would misread as the coach speaking', async () => {
    messageFindManyMock.mockResolvedValue([]);

    await coachOpeningWentUnspoken(CONVERSATION_ID, NOW);

    // Empty assistant rows are the tail of a tool-call round trip. One of those counted as speech
    // would say a silent `record_answers` turn had opened the phase.
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
});
