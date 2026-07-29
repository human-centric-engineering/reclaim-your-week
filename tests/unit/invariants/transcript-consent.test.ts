/**
 * The conversation is read only where the leader said it may be (F17).
 *
 * Two halves, and the second is the one that was actually broken.
 *
 * **The gate.** `readSharedTranscript` refuses unless a `ReclaimReportShare` for that exact run
 * carries `transcriptConsent: true`. Asserted behaviourally against a mocked Prisma, because "does
 * this function refuse" is the whole contract and it has four ways to say no.
 *
 * **The door that was already open.** `buildClientExport` selected whole `ReclaimAuditRun` rows, so
 * `conversationId` travelled in the export — and core ships `/admin/orchestration/conversations/[id]`,
 * which renders any conversation to an `ADMIN`. The leaf was supplying the key to a surface it does
 * not own. A static assertion, because what matters is that the field is never selected rather than
 * that one particular call happens to omit it today.
 *
 * Wired into `leaf:checks` via the `tests/unit/invariants` directory glob.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const { findShare, findRun, findMessages } = vi.hoisted(() => ({
  findShare: vi.fn(),
  findRun: vi.fn(),
  findMessages: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimReportShare: { findUnique: findShare },
    reclaimAuditRun: { findFirst: findRun },
    aiMessage: { findMany: findMessages },
  },
}));

import { readSharedTranscript } from '@/lib/app/programme/admin/transcript';
import { COACH_ARRIVAL_TRIGGER } from '@/lib/app/programme/coach/opening';

const RUN = { id: 'run-1', quarter: '2026 Q1', conversationId: 'conv-1' };

beforeEach(() => {
  findShare.mockReset();
  findRun.mockReset();
  findMessages.mockReset();
  findRun.mockResolvedValue(RUN);
  findMessages.mockResolvedValue([
    {
      id: 'm1',
      role: 'user',
      content: 'I keep getting pulled into delivery.',
      createdAt: new Date('2026-01-02'),
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'What does that take from?',
      createdAt: new Date('2026-01-03'),
    },
  ]);
});

describe('a transcript is readable only with consent', () => {
  it('refuses when the leader never shared this run at all', async () => {
    findShare.mockResolvedValue(null);
    expect(await readSharedTranscript('admin-1', 'leader-1', 'run-1')).toBeNull();
  });

  it('refuses when they shared the results but not the conversation', async () => {
    // The case the whole feature exists for. Sharing a summary is not sharing the exchange that
    // produced it, and before this column there was no way to say so.
    findShare.mockResolvedValue({ transcriptConsent: false, createdAt: new Date() });
    expect(await readSharedTranscript('admin-1', 'leader-1', 'run-1')).toBeNull();
    // And it stops before reading a single message.
    expect(findMessages).not.toHaveBeenCalled();
  });

  it('refuses a run that never opened a conversation', async () => {
    findShare.mockResolvedValue({ transcriptConsent: true, createdAt: new Date() });
    findRun.mockResolvedValue({ ...RUN, conversationId: null });
    expect(await readSharedTranscript('admin-1', 'leader-1', 'run-1')).toBeNull();
  });

  it('scopes the run lookup to the leader, so a run id alone authorises nothing', async () => {
    findShare.mockResolvedValue({ transcriptConsent: true, createdAt: new Date() });
    findRun.mockResolvedValue(null);
    expect(await readSharedTranscript('admin-1', 'leader-1', 'run-1')).toBeNull();
    expect(findRun).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1', userId: 'leader-1' } })
    );
  });

  it('returns the conversation when they said it may be read', async () => {
    findShare.mockResolvedValue({ transcriptConsent: true, createdAt: new Date('2026-01-05') });
    const transcript = await readSharedTranscript('admin-1', 'leader-1', 'run-1');
    expect(transcript?.turns.map((t) => t.role)).toEqual(['leader', 'coach']);
    expect(transcript?.turns[0].text).toBe('I keep getting pulled into delivery.');
  });

  it('never shows the stage directions as something the leader said', async () => {
    // The leaf sends a synthetic `role: 'user'` message to make the coach speak first, because the
    // framework has no concept of an agent opening. It is the only text in the conversation the
    // leader did not write, and a reader who did not know that would attribute it to them.
    findShare.mockResolvedValue({ transcriptConsent: true, createdAt: new Date() });
    findMessages.mockResolvedValue([
      { id: 'm0', role: 'user', content: COACH_ARRIVAL_TRIGGER, createdAt: new Date('2026-01-01') },
      {
        id: 'm1',
        role: 'assistant',
        content: 'Shall we begin?',
        createdAt: new Date('2026-01-02'),
      },
    ]);
    const transcript = await readSharedTranscript('admin-1', 'leader-1', 'run-1');
    expect(transcript?.turns).toHaveLength(1);
    expect(transcript?.turns[0].role).toBe('coach');
  });
});

describe('the admin export no longer hands over the conversation', () => {
  const source = readFileSync('lib/app/programme/admin/export.ts', 'utf8');
  /**
   * Comments stripped before the scan, the same way `calendar-privacy.test.ts` does it: the prose
   * explaining *why* the field is withheld necessarily names it, and a guard that cannot tell an
   * explanation from a selection would force the explanation out of the file.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('never selects conversationId', () => {
    // Core renders any conversation to an ADMIN at /admin/orchestration/conversations/[id]. While
    // the export carried the id, the transcript was reachable to anyone who read one, and the
    // product offered the leader no say in it.
    expect(code).not.toContain('conversationId');
  });

  it('selects the run fields explicitly rather than taking whole rows', () => {
    // By omission is not good enough: a bare `findMany` puts every future column into a file that
    // leaves the system, including ones nobody considered.
    const runQuery = code.slice(
      code.indexOf('prisma.reclaimAuditRun.findMany'),
      code.indexOf('prisma.reclaimGrant.findMany')
    );
    expect(runQuery).toContain('select:');
    expect(runQuery).toContain('analystReading: true');
  });
});
