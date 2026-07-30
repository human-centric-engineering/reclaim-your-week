'use client';

/**
 * Writing to a leader who stopped (F18 t-2) — the composer on their record.
 *
 * **The product does not decide to send this and does not decide what it says.** The draft arrives
 * filled in and every character is editable, including the subject; the send posts what is on screen.
 * That is what [[post-v1#P24]] settled: an automated "you left an audit open" is what Brief §2 and I16
 * refuse, and a human who has read someone's record and chosen to write is not.
 *
 * Two things are shown and neither is enforced. A message already sent about the same audit, and a
 * leader who has turned the quarterly nudges off. Refusing on either would have the product overrule a
 * coach who looked and decided, which is I16 aimed at the wrong person. Saying nothing about them
 * would be worse: a second operator writes the second message.
 *
 * The history below is the same record, read back. It carries the body of each message, so the next
 * one can be written knowing the last one, and it says plainly where a send failed.
 */

import { useCallback, useEffect, useState } from 'react';
import { readReachOut, sendReachOut, type ReachOutView } from '@/components/app/admin/actions';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ReachOutComposer({ userId }: { userId: string }) {
  const [view, setView] = useState<ReachOutView | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await readReachOut(userId);
      setView(next);
      setSubject(next.draft.subject);
      setBody(next.draft.body);
      setError(null);
    } catch (e) {
      // Gate the composer on the load: an empty box would look like a message with nothing in it,
      // and the draft is the part that makes this quick enough to actually use.
      setView(null);
      setError(e instanceof Error ? e.message : 'We could not prepare a message.');
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendReachOut(userId, {
        subject: subject.trim(),
        body: body.trim(),
        auditRunId: view?.draft.auditRunId ?? null,
      });
      setNotice(
        result.delivered
          ? 'Sent, and kept on their record below.'
          : 'That did not reach the mail provider. It is recorded as failed below, so it can be tried again.'
      );
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That message could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  if (error !== null && view === null) return <p className="text-destructive text-sm">{error}</p>;
  if (view === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !busy;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">Write to them</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm"
          >
            Start a message
          </button>
        )}
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">
        Nothing here is sent automatically. The product will never email someone about an audit they
        left open, so this is the only way that message goes, and it goes because you decided to
        send it.
      </p>

      {(view.draft.alreadyWrittenForThisRun || view.draft.optedOutOfNudges) && (
        <ul className="space-y-1 text-sm">
          {view.draft.alreadyWrittenForThisRun && (
            <li className="text-amber-700 dark:text-amber-400">
              Somebody has already written to them about this audit. Worth reading below before
              writing again.
            </li>
          )}
          {view.draft.optedOutOfNudges && (
            <li className="text-muted-foreground">
              They have turned the quarterly reminders off. That was about automatic mail rather
              than about you, and it is yours to weigh.
            </li>
          )}
        </ul>
      )}

      {open && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-background w-full rounded-md border p-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Message</span>
            <textarea
              value={body}
              rows={14}
              onChange={(e) => setBody(e.target.value)}
              className="bg-background w-full rounded-md border p-2 text-sm"
            />
          </label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            A starting point, in your voice, to change however you like. It arrives from you with a
            link back to where they stopped
            {view.draft.phaseLabel !== null ? `, which is ${view.draft.phaseLabel}` : ''}. Blank
            lines become paragraphs.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send it'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
            >
              Not now
            </button>
            {error !== null && <span className="text-destructive text-sm">{error}</span>}
          </div>
        </div>
      )}

      {notice !== null && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>
      )}

      {view.sent.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.16em] uppercase">
            Already sent
          </h3>
          <ul className="space-y-3">
            {view.sent.map((message) => (
              <li key={message.id} className="border-border/60 space-y-1 border-t pt-3">
                <p className="text-sm font-medium">{message.subject}</p>
                <p className="text-muted-foreground text-xs">
                  {formatWhen(message.sentAt)}
                  {message.sentByName !== null ? ` · ${message.sentByName}` : ''}
                  {message.status !== 'sent' ? ' · did not reach the mail provider' : ''}
                </p>
                <p className="text-muted-foreground text-sm whitespace-pre-line">{message.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
