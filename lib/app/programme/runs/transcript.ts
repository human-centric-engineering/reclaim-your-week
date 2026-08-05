/**
 * A leader's own conversation, for them to take away.
 *
 * The audit **is** the conversation. Everything the report says is a reading of it, and until now
 * the only person who could ever read the thing itself was Rashmir, and only where the leader had
 * consented to her seeing it (`admin/transcript.ts`). The leader themselves could scroll it on the
 * screen, in a bounded column, until they closed the tab.
 *
 * So this is the same read, pointed the other way: **their own run, no consent involved**, because
 * consent is what you give somebody else. `readOwnTranscript` is ownership-scoped in its `where`
 * rather than filtered afterwards, and takes the `userId` from the session at the route.
 *
 * Two things it shares with the admin reader, for the same reasons stated there:
 *
 *  - **No synthetic turns.** The stage directions the leaf sends to make the coach speak first are
 *    stored as `role: 'user'` rows. They are the only text in the conversation the leader did not
 *    write, and a document with them in it would attribute them to the leader.
 *  - **No redaction.** A leader's own words, whole.
 *
 * Pure of framework concerns and of rendering: the two download routes format it, this reads it.
 */

import { prisma } from '@/lib/db/client';
import { isCoachSyntheticMessage } from '@/lib/app/programme/coach/opening';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';

export interface OwnTranscriptTurn {
  id: string;
  /** `leader` or `coach` — the roles as this product names them, not the model's. */
  role: 'leader' | 'coach';
  text: string;
  at: Date;
}

export interface OwnTranscript {
  runId: string;
  /** The leader's first name where the audit captured one, for the document's header. */
  firstName: string | null;
  /** When the conversation started, which is when they began the audit. */
  startedAt: Date;
  turns: OwnTranscriptTurn[];
}

/**
 * One leader's own conversation for one run, or `null`.
 *
 * `null` for a run that is not theirs and for a run that never opened a conversation — the caller
 * 404s both. A run with a conversation but no turns in it comes back as a transcript with an empty
 * `turns`, which is a real state (a leader who reached phase 6 having only used the panels, before
 * the conversation was the way through) and renders as a document that says so.
 */
export async function readOwnTranscript(
  userId: string,
  runId: string
): Promise<OwnTranscript | null> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, conversationId: true, createdAt: true },
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

  // Their name from the audit rather than from the account: what a leader typed into their own audit
  // is what their own document should call them. Run-scoped, like every other read of an answer.
  const answers = await readRunAnswers(userId, runId);

  return {
    runId: run.id,
    firstName: answers['reclaim_profile_first_name']?.value?.trim() || null,
    startedAt: run.createdAt,
    turns: messages
      .filter((m) => !isCoachSyntheticMessage(m.role, m.content))
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        id: m.id,
        role: m.role === 'user' ? ('leader' as const) : ('coach' as const),
        text: m.content.trim(),
        at: m.createdAt,
      })),
  };
}

/** The document's date line and its filename stem, from one place so the two agree. */
export function transcriptFilename(transcript: OwnTranscript, extension: string): string {
  const who = (transcript.firstName ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = transcript.startedAt.toISOString().slice(0, 10);
  return ['time-audit-conversation', who, day].filter(Boolean).join('-') + '.' + extension;
}

/**
 * The conversation as plain text.
 *
 * Labelled `Coach:` and `You:` rather than with the raw roles, because the document is addressed to
 * the leader. Turns are separated by a blank line and long ones are left exactly as they were
 * written: rewrapping somebody's own sentences to a column width is an edit.
 */
export function transcriptToText(transcript: OwnTranscript): string {
  const header = [
    'Reclaim Your Week',
    `Your conversation, ${transcript.startedAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
    '',
    'This is the whole of what was said, in the order it was said.',
    '',
    '',
  ];

  if (transcript.turns.length === 0) {
    return [...header, 'This audit has no conversation recorded against it.', ''].join('\n');
  }

  const body = transcript.turns.map(
    (turn) => `${turn.role === 'leader' ? 'You' : 'Coach'}:\n${turn.text}\n`
  );

  return [...header, ...body].join('\n');
}
