/**
 * A leader's own conversation, read for them rather than about them.
 *
 * The admin reader (`admin/transcript.ts`) is gated on consent, because it hands somebody else's
 * words to a third party. This one is not, and the thing that replaces the gate is **ownership in the
 * query**: `where: { id, userId }`, so a run that is not theirs is not found rather than found and
 * then filtered. That is the assertion this file exists for, and it is written by asking for another
 * leader's run rather than by inspecting the call.
 *
 * The second thing pinned here is the synthetic turns. The stage directions this app sends to make
 * the coach speak first are stored as `role: 'user'` rows — a framework limitation the asks ledger
 * records — and they are the only text in the conversation the leader did not write. A document with
 * them in it attributes them to the leader, in a file they may keep for years.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const runFindFirst = vi.fn();
const messageFindMany = vi.fn();

// The factories are hoisted above the `const`s, so they reach the mocks lazily rather than closing
// over a binding that does not exist yet.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findFirst: (...a: unknown[]) => runFindFirst(...a) as unknown },
    aiMessage: { findMany: (...a: unknown[]) => messageFindMany(...a) as unknown },
  },
}));

const readRunAnswers = vi.fn();
vi.mock('@/lib/app/programme/runs/answers', () => ({
  readRunAnswers: (...args: unknown[]) => readRunAnswers(...args) as unknown,
}));

import {
  readOwnTranscript,
  transcriptFilename,
  transcriptToText,
} from '@/lib/app/programme/runs/transcript';
import { COACH_OPENING_TRIGGER } from '@/lib/app/programme/coach/opening';

const STARTED = new Date('2026-07-29T09:00:00.000Z');

beforeEach(() => {
  runFindFirst.mockReset().mockResolvedValue({
    id: 'run-1',
    conversationId: 'conv-1',
    createdAt: STARTED,
  });
  messageFindMany.mockReset().mockResolvedValue([
    {
      id: 'm1',
      role: 'assistant',
      content: 'What does a typical week look like?',
      createdAt: STARTED,
    },
    { id: 'm2', role: 'user', content: 'Twenty hours of it is meetings.', createdAt: STARTED },
  ]);
  readRunAnswers.mockReset().mockResolvedValue({
    reclaim_profile_first_name: { value: 'Ada' },
  });
});

describe('readOwnTranscript', () => {
  it('scopes the run on the caller in the query, not after it', async () => {
    await readOwnTranscript('u1', 'run-1');
    expect(runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1', userId: 'u1' } })
    );
  });

  it('is nothing at all for a run that is not theirs', async () => {
    // The route answers 404, which is the same answer as a run that does not exist — a download
    // endpoint must not confirm that somebody else's audit is there.
    runFindFirst.mockResolvedValue(null);
    expect(await readOwnTranscript('u2', 'run-1')).toBeNull();
    expect(messageFindMany).not.toHaveBeenCalled();
  });

  it('is nothing for a run that never opened a conversation', async () => {
    runFindFirst.mockResolvedValue({ id: 'run-1', conversationId: null, createdAt: STARTED });
    expect(await readOwnTranscript('u1', 'run-1')).toBeNull();
  });

  it('drops the stage directions this app sent in the leader’s place', async () => {
    messageFindMany.mockResolvedValue([
      { id: 'm0', role: 'user', content: COACH_OPENING_TRIGGER, createdAt: STARTED },
      {
        id: 'm1',
        role: 'assistant',
        content: 'What does a typical week look like?',
        createdAt: STARTED,
      },
    ]);

    const transcript = await readOwnTranscript('u1', 'run-1');

    expect(transcript?.turns.map((t) => t.id)).toEqual(['m1']);
  });

  it('names the leader from their own audit rather than their account', async () => {
    const transcript = await readOwnTranscript('u1', 'run-1');
    expect(transcript?.firstName).toBe('Ada');
    expect(readRunAnswers).toHaveBeenCalledWith('u1', 'run-1');
  });

  it('calls the two roles what this product calls them', async () => {
    const transcript = await readOwnTranscript('u1', 'run-1');
    expect(transcript?.turns.map((t) => t.role)).toEqual(['coach', 'leader']);
  });
});

describe('transcriptToText', () => {
  it('addresses the document to the leader', async () => {
    const text = transcriptToText((await readOwnTranscript('u1', 'run-1'))!);

    // "You" and "Coach", not "user" and "assistant": this is their document, not a log.
    expect(text).toContain('You:\nTwenty hours of it is meetings.');
    expect(text).toContain('Coach:\nWhat does a typical week look like?');
    expect(text).not.toMatch(/assistant|user/);
  });

  it('says so plainly for a run with no conversation recorded', async () => {
    messageFindMany.mockResolvedValue([]);
    const text = transcriptToText((await readOwnTranscript('u1', 'run-1'))!);
    expect(text).toContain('no conversation recorded');
  });
});

describe('transcriptFilename', () => {
  it('is a name a leader can find again on their desktop', async () => {
    const transcript = (await readOwnTranscript('u1', 'run-1'))!;
    expect(transcriptFilename(transcript, 'txt')).toBe(
      'time-audit-conversation-ada-2026-07-29.txt'
    );
  });

  it('stays a safe filename when the name is not', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_profile_first_name: { value: '../../etc/passwd' } });
    const transcript = (await readOwnTranscript('u1', 'run-1'))!;
    const name = transcriptFilename(transcript, 'pdf');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('falls back to a name with no leader in it', async () => {
    readRunAnswers.mockResolvedValue({});
    const transcript = (await readOwnTranscript('u1', 'run-1'))!;
    expect(transcriptFilename(transcript, 'txt')).toBe('time-audit-conversation-2026-07-29.txt');
  });
});
