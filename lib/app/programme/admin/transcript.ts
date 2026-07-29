/**
 * A leader's conversation, read by the coach, only where they said she may (F17 t-2).
 *
 * **The audit is the conversation now**, and until this existed there was no consented way for
 * Rashmir to see one. A leader saying "the coach misheard me" had nothing to point at, and she had
 * no legitimate way to look. What she *did* have was an illegitimate one: `buildClientExport`
 * selected whole run rows, so `conversationId` travelled in the export, and core ships
 * `/admin/orchestration/conversations/[id]`. That door is closed in the same task as this one opens.
 *
 * ## The gate is at the read, not on the link
 *
 * `readSharedTranscript` returns `null` unless a `ReclaimReportShare` exists for this exact run with
 * `transcriptConsent: true`. It is not enough to hide a button: a guard a URL can walk round is not
 * a guard, and the admin surface is a set of pages an operator can type into a bar.
 *
 * ## What it does not do
 *
 * **No per-message redaction.** A consented transcript is shown whole. Filtering it would mean
 * deciding on a leader's behalf which of their own sentences the coach may read, which is a worse
 * position than the binary choice they actually made.
 *
 * **No synthetic turns.** The stage directions the leaf sends to make the coach speak first
 * (`COACH_SYNTHETIC_MESSAGES`) are stored as `role: 'user'` rows, which is a framework limitation the
 * asks ledger records. They are filtered here for the same reason `coach-chat.tsx` filters them on
 * the leader's own screen, and one reason more: a reader who does not know they exist would attribute
 * them to the leader, and they are the only text in the conversation the leader did not write.
 *
 * Listed in `admin-support.test.ts`'s `CROSS_USER_MODULES`, which is the deliberate act that guard
 * asks for, and reachable only from a `withAdminAuth` route.
 */

import { prisma } from '@/lib/db/client';
import { isCoachSyntheticMessage } from '@/lib/app/programme/coach/opening';

export interface SharedTranscriptTurn {
  id: string;
  /** `leader` or `coach` — the roles as this product names them, not the model's. */
  role: 'leader' | 'coach';
  text: string;
  at: string;
}

export interface SharedTranscript {
  runId: string;
  quarter: string | null;
  /** When the leader shared, which is when the consent was given. */
  sharedAt: string;
  turns: SharedTranscriptTurn[];
}

/**
 * The conversation behind one shared run, or `null` when the leader did not consent to it.
 *
 * `null` covers every refusal — no share, share without transcript consent, a run belonging to
 * someone else, a run that never opened a conversation. The caller renders the same "not available"
 * for all of them, deliberately: distinguishing "they said no" from "there is nothing there" would
 * tell an operator something about a leader's choices that the leader did not offer.
 */
export async function readSharedTranscript(
  _adminUserId: string,
  userId: string,
  runId: string
): Promise<SharedTranscript | null> {
  const share = await prisma.reclaimReportShare.findUnique({
    where: { userId_auditRunId: { userId, auditRunId: runId } },
    select: { transcriptConsent: true, createdAt: true },
  });
  if (share === null || !share.transcriptConsent) return null;

  const run = await prisma.reclaimAuditRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, quarter: true, conversationId: true },
  });
  if (run === null || run.conversationId === null) return null;

  const messages = await prisma.aiMessage.findMany({
    where: {
      conversationId: run.conversationId,
      role: { in: ['user', 'assistant'] },
      content: { not: '' },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return {
    runId: run.id,
    quarter: run.quarter,
    sharedAt: share.createdAt.toISOString(),
    turns: messages
      .filter((m) => !isCoachSyntheticMessage(m.role, m.content))
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        id: m.id,
        role: m.role === 'user' ? ('leader' as const) : ('coach' as const),
        text: m.content,
        at: m.createdAt.toISOString(),
      })),
  };
}
