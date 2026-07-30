/**
 * One message to a leader who stopped, written by the coach herself (F18 t-2).
 *
 * ## Why this is a composer and not a scheduler
 *
 * Two of the first three audits ever started were abandoned mid-flight and nothing in the product
 * noticed. The obvious answer is an email, and the product refuses to send it: `nudges/select.ts`
 * carries Brief §2 and I16 in its file header — _"a leader with an audit open does not need reminding
 * to start one; they need to be left alone to finish it"_ — so an automated "you left an audit open"
 * is precisely what that rule forbids. [[post-v1#P24]] records the decision and names the version that
 * is allowed: **a human looks at a record and decides**. That is this module. Nothing here runs on a
 * timer, nothing selects a cohort, and the draft below is a starting point rather than a template with
 * a send button.
 *
 * ## What it therefore does and does not enforce
 *
 * It **records** every message, so a second operator (and Rashmir next month) can see what was
 * already said, and so a failed send reads as a failure rather than as silence. It **surfaces** the
 * two facts that should give her pause: a message already sent about this audit, and a leader who has
 * turned the automated nudges off. It **refuses** neither. A product that overruled a coach who had
 * read someone's record and decided to write would be I16 pointed at the wrong person.
 *
 * Listed in `admin-support.test.ts`'s `CROSS_USER_MODULES` — it reads another leader's rows, which
 * that guard asks to be a deliberate act.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { sendEmail } from '@/lib/email/send';
import { appUrl } from '@/lib/app/programme/urls';
import CoachMessageEmail from '@/components/app/emails/coach-message';

/** One message already sent, as the operator's screen shows it back. */
export interface ReachOutRecord {
  id: string;
  auditRunId: string | null;
  subject: string;
  body: string;
  status: string;
  sentAt: string;
  /** The operator who wrote it, or null once their account has been erased. */
  sentByName: string | null;
}

/** What the composer opens with, and the facts that should be read before sending. */
export interface ReachOutDraft {
  subject: string;
  body: string;
  /** The audit this is about, where there is an open one. */
  auditRunId: string | null;
  /** Their phase, so the draft and the screen agree about where they stopped. */
  phaseLabel: string | null;
  /** True when a message has already gone about this same audit. A warning, never a refusal. */
  alreadyWrittenForThisRun: boolean;
  /** They have turned the quarterly nudge off. A fact about automated mail, offered as context. */
  optedOutOfNudges: boolean;
}

/**
 * The opening draft.
 *
 * **Written in Rashmir's first person, because she is the sender.** I1 governs what the *tool* says to
 * a leader and forbids it speaking as her; this is a human's message, and a draft she cannot say out
 * loud is a draft she has to rewrite from nothing. I2 still binds it — a leader reads it — so: no em
 * dashes, no banned lexicon, short sentences. I16 and I17 shape what it may say: it names what
 * happened without diagnosing it, offers the door in both directions (come back, or leave it), and
 * asks nothing of them.
 *
 * Pure, so the wording is asserted in a test rather than reviewed in a browser.
 */
export function draftReachOut(input: { firstName: string | null; phaseLabel: string | null }): {
  subject: string;
  body: string;
} {
  const greeting =
    input.firstName !== null && input.firstName.trim() !== ''
      ? `Hello ${input.firstName.trim()},`
      : 'Hello,';

  // The phase is named only where we have it. "You stopped at Energy" is a fact; "you stopped" with
  // no idea where is a guess dressed as one.
  const middle =
    input.phaseLabel !== null
      ? `You started a time audit and it is still open, part way through ${input.phaseLabel}. It is waiting exactly where you left it, so nothing has been lost.`
      : 'You started a time audit and it is still open. It is waiting exactly where you left it, so nothing has been lost.';

  return {
    subject: 'Your time audit is still open',
    body: [
      greeting,
      '',
      middle,
      '',
      'There is no need to explain the gap and nothing to catch up on. If you would like to carry on, you can pick it up whenever suits. If you would rather set it aside, there is a way to do that on the same screen, and that is a fine answer too.',
      '',
      'If something in it was not working for you, I would genuinely like to know.',
      '',
      'Rashmir',
    ].join('\n'),
  };
}

/**
 * The draft plus the context to read before sending it.
 *
 * The reads are narrow on purpose: this is not a second client-detail endpoint. The caller already has
 * the leader's row, so what is added here is only what a composer needs.
 */
export async function buildReachOutDraft(
  _adminUserId: string,
  userId: string,
  input: { firstName: string | null; phaseLabel: string | null }
): Promise<ReachOutDraft> {
  const [openRun, nudge] = await Promise.all([
    prisma.reclaimAuditRun.findFirst({
      where: { userId, status: 'in_progress' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    }),
    prisma.reclaimNudge.findUnique({ where: { userId }, select: { optedOutAt: true } }),
  ]);

  const alreadyWritten =
    openRun === null
      ? false
      : (await prisma.reclaimReachOut.count({
          where: { userId, auditRunId: openRun.id, status: 'sent' },
        })) > 0;

  return {
    ...draftReachOut(input),
    auditRunId: openRun?.id ?? null,
    phaseLabel: input.phaseLabel,
    alreadyWrittenForThisRun: alreadyWritten,
    optedOutOfNudges: nudge?.optedOutAt != null,
  };
}

/** Every message this leader has been sent, newest first. */
export async function listReachOuts(
  _adminUserId: string,
  userId: string
): Promise<ReachOutRecord[]> {
  const rows = await prisma.reclaimReachOut.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (rows.length === 0) return [];

  const senderIds = [
    ...new Set(rows.map((r) => r.sentByUserId).filter((id): id is string => id !== null)),
  ];
  const senders = senderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameById = new Map(senders.map((s) => [s.id, s.name ?? s.email]));

  return rows.map((row) => ({
    id: row.id,
    auditRunId: row.auditRunId,
    subject: row.subject,
    body: row.body,
    status: row.status,
    sentAt: row.createdAt.toISOString(),
    sentByName: row.sentByUserId !== null ? (nameById.get(row.sentByUserId) ?? null) : null,
  }));
}

export interface SendReachOutResult {
  record: ReachOutRecord;
  /** False when the provider refused or is not configured. The row is written either way. */
  delivered: boolean;
}

/**
 * Send it, and record it whichever way the send goes.
 *
 * **The row is written after the attempt and reflects it.** Writing "sent" before the provider has
 * spoken would tell the next operator a message went when it did not, and the whole value of the
 * record is that it is the answer to "has this person been written to". `sendEmail` swallows provider
 * failures into a result object, and the `catch` covers the rest, so an outage produces a `failed` row
 * and a screen that says so rather than a 500 and no trace.
 *
 * Returns `null` when the leader has no account left to write to, which the route turns into a 404.
 */
export async function sendReachOut(input: {
  adminUserId: string;
  userId: string;
  subject: string;
  body: string;
  /** Which audit this is about, from the draft. Recorded, never used to select the recipient. */
  auditRunId: string | null;
}): Promise<SendReachOutResult | null> {
  const leader = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true },
  });
  if (leader === null) return null;

  const firstName = leader.name?.trim().split(/\s+/)[0] ?? null;
  const result = await sendEmail({
    to: leader.email,
    subject: input.subject,
    react: CoachMessageEmail({
      firstName,
      body: input.body,
      programmeUrl: `${appUrl()}/programme`,
    }),
  }).catch((error: unknown) => {
    logger.warn('Reclaim: reach-out email failed', {
      subjectUserId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  const delivered = result?.success === true;
  const row = await prisma.reclaimReachOut.create({
    data: {
      userId: input.userId,
      auditRunId: input.auditRunId,
      sentByUserId: input.adminUserId,
      subject: input.subject,
      body: input.body,
      status: delivered ? 'sent' : 'failed',
    },
  });

  const sender = await prisma.user.findUnique({
    where: { id: input.adminUserId },
    select: { name: true, email: true },
  });

  return {
    delivered,
    record: {
      id: row.id,
      auditRunId: row.auditRunId,
      subject: row.subject,
      body: row.body,
      status: row.status,
      sentAt: row.createdAt.toISOString(),
      sentByName: sender?.name ?? sender?.email ?? null,
    },
  };
}

/** When each of these leaders was last written to, for the list's one batched read. */
export async function lastReachedOutByUser(userIds: string[]): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();

  const rows = await prisma.reclaimReachOut.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, status: 'sent' },
    _max: { createdAt: true },
  });

  const out = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.createdAt !== null) out.set(row.userId, row._max.createdAt);
  }
  return out;
}
