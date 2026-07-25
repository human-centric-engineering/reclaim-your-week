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
  type CalendarReview,
} from '@/components/app/reclaim/calendar/types';
import { FieldHelp } from '@/components/ui/field-help';

export function CalendarUpload({
  runId,
  onReviewed,
}: {
  runId: string;
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
        const message =
          json !== null && typeof json === 'object' && 'error' in json
            ? ((json.error as { message?: string })?.message ?? null)
            : null;
        throw new Error(message ?? 'We could not read that calendar just now.');
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

      {/* The two privacy promises (I4) — at the control, not in a tooltip. */}
      <div className="border-border/70 bg-muted/50 space-y-2 rounded-xl border px-5 py-4">
        <p className="text-foreground text-sm font-medium">This is optional, and private.</p>
        <ul className="text-muted-foreground space-y-1.5 text-sm">
          <li>
            · Your calendar file is read in memory to work out the totals, and is never stored.
          </li>
          <li>
            · Only per-bucket hour totals are saved — never a meeting title, attendee, or any event
            detail.
          </li>
        </ul>
      </div>
    </div>
  );
}
