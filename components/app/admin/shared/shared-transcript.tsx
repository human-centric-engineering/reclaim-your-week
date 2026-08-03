'use client';

/**
 * A shared conversation, read-only (F17 t-2).
 *
 * **What makes this different from every other admin screen** is that it shows a person's own words
 * in the order they said them, including the parts they went back on. That is why it exists behind
 * an explicit second consent rather than behind the one that shares a result, and why the header
 * says whose choice it was: an operator reading this should be reminded, on the page, that they are
 * here because somebody said they could be.
 *
 * The refusal is the API's. This renders "not available" for every reason alike — no consent, no
 * conversation, the wrong leader — because telling the two apart would report a leader's choice to
 * somebody they did not report it to.
 *
 * Deliberately plain. This is not the leader's chat surface: no typing animation, no composer, no
 * beats. It is a record.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';

const turnSchema = z.object({
  id: z.string(),
  role: z.enum(['leader', 'coach']),
  text: z.string(),
  at: z.string(),
});

const transcriptSchema = z.object({
  runId: z.string(),
  quarter: z.string().nullable(),
  sharedAt: z.string(),
  turns: z.array(turnSchema),
  /**
   * Defaulted rather than required, so a response from a build that predates the flag renders as a
   * real conversation instead of failing the parse and showing "not available". The direction matters:
   * an unbadged fabricated transcript is a curiosity, a transcript that will not load is a leader's
   * shared conversation the operator cannot read.
   */
  fabricated: z.boolean().default(false),
});

type Transcript = z.infer<typeof transcriptSchema>;

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function SharedTranscriptView({ userId, runId }: { userId: string; runId: string }) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/v1/app/reclaim/admin/shared/${encodeURIComponent(userId)}/${encodeURIComponent(runId)}/transcript`
        );
        const json: unknown = await res.json();
        const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
        const parsed = transcriptSchema.safeParse(data);
        if (!res.ok || !parsed.success) {
          setRefused(true);
          return;
        }
        setTranscript(parsed.data);
      } catch {
        setRefused(true);
      }
    })();
  }, [userId, runId]);

  if (refused) {
    return (
      <div className="space-y-3">
        <Link href="/admin/programme/shared" className="text-sm underline">
          ← Shared results
        </Link>
        <p className="text-muted-foreground text-sm">
          That conversation is not available. A leader shares their results and their conversation
          separately, and only the ones who chose the second appear here.
        </p>
      </div>
    );
  }

  if (transcript === null) {
    return <p className="text-muted-foreground text-sm">Finding the conversation…</p>;
  }

  return (
    <>
      <header className="space-y-1">
        <Link href="/admin/programme/shared" className="text-sm underline">
          ← Shared results
        </Link>
        <h1 className="text-2xl font-semibold">
          {transcript.quarter ?? 'An audit'}, in their own words
        </h1>
        <p className="text-muted-foreground text-sm">
          This leader chose to let you read it when they shared on {formatDate(transcript.sharedAt)}
          . It is what they said while working something out, so some of it will have been
          superseded by what they said later.
        </p>
      </header>

      {/*
        Above the words, not below them, and stated in full. Somebody who scrolls straight into a
        fabricated exchange and reads three turns before meeting a footnote has already read them as a
        leader's. This is the whole condition on which fabricating a transcript was acceptable.
      */}
      {transcript.fabricated && (
        <p className="border-border bg-muted/40 text-muted-foreground rounded-md border px-4 py-3 text-sm">
          <strong className="text-foreground font-medium">Nobody said this.</strong> It is a made-up
          conversation, written by the Preview screen to fill out a test account. No model produced
          it and no leader typed it, so there is nothing here to learn about anybody.
        </p>
      )}

      {transcript.turns.length === 0 ? (
        <p className="text-muted-foreground text-sm">There is nothing in this conversation yet.</p>
      ) : (
        <ol className="space-y-4">
          {transcript.turns.map((turn) => (
            <li
              key={turn.id}
              className={
                turn.role === 'leader'
                  ? 'bg-muted/50 rounded-lg px-4 py-3'
                  : 'border-border/70 border-l-2 py-1 pl-4'
              }
            >
              <p className="text-muted-foreground text-[0.7rem] tracking-wide uppercase">
                {turn.role === 'leader' ? 'Them' : 'The coach'}
              </p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{turn.text}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
