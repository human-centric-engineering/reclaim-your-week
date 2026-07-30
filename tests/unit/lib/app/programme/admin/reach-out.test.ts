/**
 * Writing to a leader who stopped (F18 t-2). Prisma and the mailer are mocked; the assertions are
 * about the **rules**, not about the mocks returning what they were handed.
 *
 * Load-bearing:
 *   - the draft is copy a leader reads, so I2 binds it (no em dashes, no banned lexicon) and I16/I17
 *     shape what it may say: it names where they stopped without diagnosing it, and asks nothing;
 *   - **the record reflects the send.** A row written as `sent` when the provider refused would tell
 *     the next operator a message went when it did not, and "has this person been written to" is the
 *     only question this table exists to answer;
 *   - the warnings are facts and never refusals — a coach who has read a record and decided to write
 *     is not overruled by the product (post-v1 P24).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindFirst: vi.fn(),
  nudgeFindUnique: vi.fn(),
  reachOutCount: vi.fn(),
  reachOutCreate: vi.fn(),
  reachOutFindMany: vi.fn(),
  reachOutGroupBy: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findFirst: mocks.runFindFirst },
    reclaimNudge: { findUnique: mocks.nudgeFindUnique },
    reclaimReachOut: {
      count: mocks.reachOutCount,
      create: mocks.reachOutCreate,
      findMany: mocks.reachOutFindMany,
      groupBy: mocks.reachOutGroupBy,
    },
    user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
  },
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.sendEmail }));

import {
  draftReachOut,
  buildReachOutDraft,
  sendReachOut,
  listReachOuts,
} from '@/lib/app/programme/admin/reach-out';

const ADMIN = 'admin-1';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.runFindFirst.mockResolvedValue(null);
  mocks.nudgeFindUnique.mockResolvedValue(null);
  mocks.reachOutCount.mockResolvedValue(0);
  mocks.reachOutFindMany.mockResolvedValue([]);
  mocks.reachOutGroupBy.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.userFindUnique.mockResolvedValue({
    id: 'ada',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
  });
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.reachOutCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'msg-1', createdAt: new Date('2026-07-30T09:00:00Z'), ...args.data })
  );
});

describe('draftReachOut — the copy', () => {
  it('names where they stopped when the phase is known, and does not invent one when it is not', () => {
    const known = draftReachOut({ firstName: 'Ada', phaseLabel: 'Energy' });
    const unknown = draftReachOut({ firstName: 'Ada', phaseLabel: null });

    expect(known.body).toContain('Energy');
    expect(unknown.body).toContain('still open');
    expect(unknown.body).not.toContain('part way through');
  });

  it('greets by name where there is one and does not say "Hello there" where there is not', () => {
    expect(draftReachOut({ firstName: 'Ada', phaseLabel: null }).body).toContain('Hello Ada,');
    expect(draftReachOut({ firstName: null, phaseLabel: null }).body).toContain('Hello,');
    expect(draftReachOut({ firstName: '  ', phaseLabel: null }).body).toContain('Hello,');
  });

  it('holds the product voice: no em dash, no banned lexicon', () => {
    const { subject, body } = draftReachOut({ firstName: 'Ada', phaseLabel: 'The gap' });
    const banned = /leverage|optimi[sz]e|productivity hack|best practice|KPI/i;

    expect(body).not.toContain('—');
    expect(subject).not.toContain('—');
    expect(banned.test(body)).toBe(false);
  });

  it('offers both doors and asks nothing (I16)', () => {
    const { body } = draftReachOut({ firstName: 'Ada', phaseLabel: 'Energy' });

    // Carrying on and setting it aside are offered as equals. A draft that only pointed back into
    // the audit would be a nudge with a person's name on it.
    expect(body).toContain('carry on');
    expect(body).toContain('set it aside');
    expect(body).toContain('nothing to catch up on');
    expect(body).not.toMatch(/\?/); // it makes no request of them
  });
});

describe('buildReachOutDraft — the facts worth reading first', () => {
  it('warns when a message already went about this same audit', async () => {
    mocks.runFindFirst.mockResolvedValue({ id: 'run-9' });
    mocks.reachOutCount.mockResolvedValue(1);

    const draft = await buildReachOutDraft(ADMIN, 'ada', {
      firstName: 'Ada',
      phaseLabel: 'Energy',
    });

    expect(draft.alreadyWrittenForThisRun).toBe(true);
    expect(draft.auditRunId).toBe('run-9');
    // Counted against sent messages only: a failed send is not a message the leader received.
    expect(mocks.reachOutCount).toHaveBeenCalledWith({
      where: { userId: 'ada', auditRunId: 'run-9', status: 'sent' },
    });
  });

  it('does not claim a previous message when there is no open audit to have written about', async () => {
    mocks.reachOutCount.mockResolvedValue(5);

    const draft = await buildReachOutDraft(ADMIN, 'ada', { firstName: 'Ada', phaseLabel: null });

    expect(draft.auditRunId).toBeNull();
    expect(draft.alreadyWrittenForThisRun).toBe(false);
  });

  it('reports a leader who turned the quarterly reminders off', async () => {
    mocks.nudgeFindUnique.mockResolvedValue({ optedOutAt: new Date('2026-06-01') });

    const draft = await buildReachOutDraft(ADMIN, 'ada', { firstName: 'Ada', phaseLabel: null });

    expect(draft.optedOutOfNudges).toBe(true);
  });
});

describe('sendReachOut — the record reflects the send', () => {
  it('sends what was typed, not the draft, and records it as sent', async () => {
    const result = await sendReachOut({
      adminUserId: ADMIN,
      userId: 'ada',
      subject: 'A different subject',
      body: 'Words she actually wrote.',
      auditRunId: 'run-9',
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@example.com', subject: 'A different subject' })
    );
    expect(result?.delivered).toBe(true);
    expect(mocks.reachOutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'ada',
          auditRunId: 'run-9',
          sentByUserId: ADMIN,
          subject: 'A different subject',
          body: 'Words she actually wrote.',
          status: 'sent',
        }),
      })
    );
  });

  it('records a refused send as failed rather than as sent', async () => {
    mocks.sendEmail.mockResolvedValue({ success: false });

    const result = await sendReachOut({
      adminUserId: ADMIN,
      userId: 'ada',
      subject: 'Subject',
      body: 'Body',
      auditRunId: null,
    });

    expect(result?.delivered).toBe(false);
    expect(mocks.reachOutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
  });

  it('records a thrown mailer as failed rather than losing the attempt', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('provider down'));

    const result = await sendReachOut({
      adminUserId: ADMIN,
      userId: 'ada',
      subject: 'Subject',
      body: 'Body',
      auditRunId: null,
    });

    expect(result?.delivered).toBe(false);
    expect(result?.record.status).toBe('failed');
  });

  it('returns null, and writes nothing, for an account that is gone', async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const result = await sendReachOut({
      adminUserId: ADMIN,
      userId: 'ghost',
      subject: 'Subject',
      body: 'Body',
      auditRunId: null,
    });

    expect(result).toBeNull();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.reachOutCreate).not.toHaveBeenCalled();
  });
});

describe('listReachOuts — reading the record back', () => {
  it('names the sender, and reads an erased sender as unattributed rather than failing', async () => {
    mocks.reachOutFindMany.mockResolvedValue([
      {
        id: 'a',
        auditRunId: null,
        subject: 'One',
        body: 'b',
        status: 'sent',
        sentByUserId: ADMIN,
        createdAt: new Date('2026-07-30T09:00:00Z'),
      },
      {
        id: 'b',
        auditRunId: null,
        subject: 'Two',
        body: 'b',
        status: 'sent',
        sentByUserId: null,
        createdAt: new Date('2026-07-29T09:00:00Z'),
      },
    ]);
    mocks.userFindMany.mockResolvedValue([{ id: ADMIN, name: 'Rashmir', email: 'r@example.com' }]);

    const sent = await listReachOuts(ADMIN, 'ada');

    expect(sent[0]?.sentByName).toBe('Rashmir');
    expect(sent[1]?.sentByName).toBeNull();
  });
});
