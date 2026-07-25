'use client';

/**
 * The calendar review (F5 t-3). Shows the categorisation **by bucket** (I8: hours, never percentages),
 * lists the ambiguous items to confirm, states the [X]/[Y]/[Z] arithmetic (with Z ≤ 0 handled), shows
 * the task-switching profile, and gathers the "what the calendar misses" answers + the leader's
 * attribution of the unaccounted hours. Confirming writes the corrections, the answers, and the
 * composite (I-composite). Structural labels only — the verbatim coaching framing is F6/F7 (I11).
 */

import { useMemo, useState } from 'react';
import {
  compositeResultSchema,
  parseEnvelope,
  type CalendarReview,
} from '@/components/app/reclaim/calendar/types';
import { FieldHelp } from '@/components/ui/field-help';

interface Row {
  token: string;
  title: string;
  calendar: string;
  offCal: string;
}

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function CalendarReviewPanel({
  runId,
  review,
  onConfirmed,
}: {
  runId: string;
  review: CalendarReview;
  onConfirmed: () => void;
}) {
  const calendarByToken = useMemo(
    () => new Map(review.buckets.map((b) => [b.token, b.hours])),
    [review.buckets]
  );
  const [rows, setRows] = useState<Row[]>(() =>
    review.allBuckets.map((b) => ({
      token: b.token,
      title: b.title,
      calendar: calendarByToken.has(b.token) ? String(calendarByToken.get(b.token)) : '',
      offCal: '',
    }))
  );
  const [completeness, setCompleteness] = useState('');
  const [offCalWork, setOffCalWork] = useState('');
  const [messagingLoad, setMessagingLoad] = useState('');
  const [switchFrequency, setSwitchFrequency] = useState('');
  const [reactiveTime, setReactiveTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRow = (token: string, field: 'calendar' | 'offCal', value: string) =>
    setRows((rs) => rs.map((r) => (r.token === token ? { ...r, [field]: value } : r)));

  const attributedOffCal = rows.reduce((sum, r) => sum + num(r.offCal), 0);
  const { unaccountedHours, selfReportedWeeklyHours, totalHours, calendarMeetsOrExceeds } = review;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const corrections: Record<string, number> = {};
      const offCalAttribution: Record<string, number> = {};
      for (const r of rows) {
        if (r.calendar.trim() !== '') corrections[r.token] = num(r.calendar);
        if (num(r.offCal) > 0) offCalAttribution[r.token] = num(r.offCal);
      }
      const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/calendar/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corrections,
          offCalAttribution,
          completeness: completeness.trim() || undefined,
          offCalWork: offCalWork.trim() || undefined,
          messagingLoad: messagingLoad.trim() || undefined,
          switchFrequency: switchFrequency.trim() || undefined,
          reactiveTime: reactiveTime.trim() || undefined,
        }),
      });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error('We could not save your review just now.');
      parseEnvelope(json, compositeResultSchema); // validate the response shape
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong saving your review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* [X]/[Y]/[Z] — arithmetic, not copy. */}
      <section className="bg-muted rounded-2xl px-6 py-5">
        <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
          What your calendar shows
        </p>
        <p className="text-foreground mt-3 text-lg leading-relaxed font-light">
          Your calendar accounts for about <strong className="font-medium">{totalHours}</strong>{' '}
          hours a week.
          {selfReportedWeeklyHours !== null &&
            (calendarMeetsOrExceeds ? (
              <>
                {' '}
                That is close to — or a little above — the{' '}
                <strong className="font-medium">{selfReportedWeeklyHours}</strong> you estimated, so
                most of your week is on the calendar.
              </>
            ) : (
              <>
                {' '}
                You told me you work around{' '}
                <strong className="font-medium">{selfReportedWeeklyHours}</strong>, which leaves
                about <strong className="font-medium">{unaccountedHours}</strong> hours the calendar
                does not capture.
              </>
            ))}
        </p>
        {review.truncated && (
          <p className="text-muted-foreground mt-3 text-sm">
            Your file was large, so this covers part of the period. A shorter export gives a cleaner
            like-for-like comparison.
          </p>
        )}
        {review.excludedPersonalCount > 0 && (
          <p className="text-muted-foreground mt-2 text-sm">
            {review.excludedPersonalCount} clearly personal event(s) were set aside automatically.
          </p>
        )}
      </section>

      {/* By-bucket, with correction + off-calendar attribution. */}
      <section>
        <h3 className="text-foreground flex items-center gap-1.5 text-base font-medium">
          By area — does this look right?
          <FieldHelp title="Adjust anything that looks off">
            The calendar column is what your calendar showed. Move hours between areas if something
            was categorised wrongly. Use the off-calendar column for work that never reaches your
            calendar.
          </FieldHelp>
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs tracking-wide uppercase">
                <th className="py-2 pr-4 font-medium">Area</th>
                <th className="py-2 pr-4 font-medium">Calendar hrs</th>
                <th className="py-2 pr-4 font-medium">Off-calendar hrs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.token} className="border-border/60 border-b">
                  <td className="text-foreground py-2 pr-4">{r.title}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={r.calendar}
                      onChange={(e) => setRow(r.token, 'calendar', e.target.value)}
                      aria-label={`${r.title} calendar hours`}
                      className="border-border w-20 rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={r.offCal}
                      onChange={(e) => setRow(r.token, 'offCal', e.target.value)}
                      aria-label={`${r.title} off-calendar hours`}
                      className="border-border w-20 rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unaccountedHours !== null && unaccountedHours > 0 && (
          <p className="text-muted-foreground mt-3 text-sm">
            You have attributed {attributedOffCal} of about {unaccountedHours} off-calendar hours so
            far.
          </p>
        )}
      </section>

      {/* Ambiguous items to confirm. */}
      {review.ambiguous.length > 0 && (
        <section>
          <h3 className="text-foreground text-base font-medium">A few to check</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            These had generic titles, so this is a best guess — adjust the hours above if any belong
            elsewhere.
          </p>
          <ul className="mt-3 space-y-2">
            {review.ambiguous.map((a, i) => (
              <li key={i} className="text-muted-foreground border-border/60 border-b pb-2 text-sm">
                <span className="text-foreground">~{a.hours}h</span> — {a.reasoning}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Task-switching profile + the two structural questions. */}
      <section className="space-y-4">
        <h3 className="text-foreground text-base font-medium">How your days are shaped</h3>
        <div className="text-muted-foreground grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-foreground text-xl font-light">{review.metrics.eventsPerDay}</div>
            events a day
          </div>
          <div>
            <div className="text-foreground text-xl font-light">{review.metrics.backToBack}</div>
            back-to-back
          </div>
          <div>
            <div className="text-foreground text-xl font-light">
              {Math.round(review.metrics.longestBlockMinutes / 6) / 10}h
            </div>
            longest block
          </div>
        </div>
        <QuestionField
          id="switch-frequency"
          label="How often do you switch between very different kinds of work in a day?"
          value={switchFrequency}
          onChange={setSwitchFrequency}
        />
        <QuestionField
          id="reactive-time"
          label="When you have unscheduled time, does it stay protected, or get consumed by reactive work?"
          value={reactiveTime}
          onChange={setReactiveTime}
        />
      </section>

      {/* What the calendar misses. */}
      <section className="space-y-4">
        <h3 className="text-foreground text-base font-medium">What the calendar misses</h3>
        <QuestionField
          id="offcal-work"
          label="What typically fills the time that never reaches your calendar?"
          value={offCalWork}
          onChange={setOffCalWork}
          help="This is the off-calendar work — attribute its hours to areas in the table above."
        />
        <QuestionField
          id="messaging-load"
          label="How much of your day goes to email, Slack, or other messaging?"
          value={messagingLoad}
          onChange={setMessagingLoad}
        />
        <QuestionField
          id="completeness"
          label="Overall, how much does your calendar reflect your actual working life?"
          value={completeness}
          onChange={setCompleteness}
        />
      </section>

      {error !== null && (
        <p className="text-muted-foreground text-sm" role="status">
          {error} You can try again.
        </p>
      )}

      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'This looks right — save it'}
      </button>
    </div>
  );
}

function QuestionField({
  id,
  label,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-foreground flex items-center gap-1.5 text-sm">
        {label}
        {help && <FieldHelp>{help}</FieldHelp>}
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border text-foreground w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed focus:outline-none"
      />
    </div>
  );
}
