'use client';

/**
 * The calendar upload step (F5 t-3/t-4). Optional and loudly so (Brief §3): the two privacy promises
 * (I4) sit **at** the upload control, unmissable, because the trust story is the product here. Reads
 * the file with `fetch` + `FormData` (apiClient can't carry multipart); the server reads it in memory,
 * categorises in one call, and returns per-bucket totals only. The rich framing copy is F6/F7's
 * verbatim voice (I11); these are structural labels.
 */

import { useRef, useState } from 'react';
import {
  calendarReviewSchema,
  parseEnvelope,
  errorMessageFrom,
  type CalendarReview,
} from '@/components/app/reclaim/calendar/types';
import { FieldHelp } from '@/components/ui/field-help';
import { RECLAIM_CALENDAR_HANDOFF } from '@/lib/app/programme/content';
import type { CalendarExportView } from '@/components/app/reclaim/calendar/types';

export function CalendarUpload({
  runId,
  exports,
  onReviewed,
}: {
  runId: string;
  /** The export walkthroughs as the operator has them. Empty renders no help rather than stale help. */
  exports: CalendarExportView[];
  onReviewed: (review: CalendarReview) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [period, setPeriod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (period.trim().length > 0) form.append('period', period.trim());

      const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/calendar`, {
        method: 'POST',
        body: form,
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(errorMessageFrom(json) ?? 'We could not read that calendar just now.');
      }
      onReviewed(parseEnvelope(json, calendarReviewSchema));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong reading your calendar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label
          htmlFor="calendar-period"
          className="text-foreground flex items-center gap-1.5 text-sm font-medium"
        >
          Which period is this?
          <FieldHelp title="Analysis period">
            A short label for the weeks this export covers (for example “the last four weeks”). It
            is stored as a note; the comparison lines up with the period you reflected on.
          </FieldHelp>
        </label>
        <input
          id="calendar-period"
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="e.g. the last four weeks"
          className="border-border text-foreground placeholder:text-muted-foreground w-full max-w-sm rounded-lg border bg-transparent px-3 py-2 text-sm focus:outline-none"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setFileName(file.name);
            void submit(file);
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-full px-7 py-3 text-[0.95rem] font-medium tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Reading your calendar…' : 'Upload a calendar export'}
        </button>
        {fileName !== null && !busy && (
          <span className="text-muted-foreground text-sm">{fileName}</span>
        )}
      </div>

      {error !== null && (
        <p className="text-muted-foreground text-sm" role="status">
          {error} You can try again, or skip this step.
        </p>
      )}

      {/*
        How to get the file. Held here rather than narrated by the coach, which is where the content
        extract puts it too: this is a list you scan while tabbing to another window, and the
        transcription audit found the Outlook steps had once been invented outright, so a model
        recalling them is the exact failure to avoid.
      */}
      {exports.length > 0 && (
        <details className="border-border/70 rounded-lg border px-4 py-3">
          <summary className="text-foreground cursor-pointer text-sm font-medium">
            How do I export my calendar?
          </summary>
          <div className="mt-4 space-y-5">
            {exports.map((walkthrough) => (
              <div key={walkthrough.service} className="space-y-2">
                <p className="text-foreground text-sm font-medium">{walkthrough.service}</p>
                <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                  {walkthrough.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
            <p className="text-muted-foreground text-sm">{RECLAIM_CALENDAR_HANDOFF}</p>
          </div>
        </details>
      )}

      {/* The two privacy promises (I4) — at the control, not in a tooltip. */}
      <div className="border-border/70 bg-muted/50 space-y-2 rounded-xl border px-5 py-4">
        <p className="text-foreground text-sm font-medium">This is optional, and private.</p>
        <ul className="text-muted-foreground space-y-1.5 text-sm">
          <li>
            · Your calendar file is read in memory to work out the totals, and is never stored.
          </li>
          <li>
            · Only per-bucket hour totals are saved, never a meeting title, attendee, or any event
            detail.
          </li>
        </ul>
      </div>
    </div>
  );
}
