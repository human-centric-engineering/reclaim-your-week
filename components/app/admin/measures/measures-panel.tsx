'use client';

/**
 * The success measures (F10 t-2) — the programme overview's two numbers.
 *
 * **The denominators are on screen, always.** A return rate over eleven leaders is a rate over eleven
 * leaders, and a percentage floating alone invites a conclusion the data cannot support. That is I12
 * ("no interpretation") applied to Rashmir's own dashboard rather than to a leader's chart: the job
 * is to report what happened, not to tell her what it means.
 *
 * The empty state says "not enough data yet" rather than 0% for the same reason — nobody having
 * finished an audit is not the same fact as nobody coming back.
 */

import { useEffect, useState } from 'react';
import { FieldHelp } from '@/components/ui/field-help';
import { readMeasures, type MeasuresView } from '@/components/app/admin/actions';

function percent(rate: number | null): string {
  return rate === null ? 'not enough data yet' : `${Math.round(rate * 100)}%`;
}

function Measure({
  label,
  value,
  detail,
  help,
}: {
  label: string;
  value: string;
  detail: string;
  help: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center gap-1 text-sm">
        {label}
        <FieldHelp title={label}>{help}</FieldHelp>
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
    </div>
  );
}

export function MeasuresPanel() {
  const [measures, setMeasures] = useState<MeasuresView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readMeasures()
      .then((m) => {
        if (!cancelled) setMeasures(m);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="text-destructive text-sm">We could not load the measures.</p>;
  if (measures === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const { returnRate, referral, totals } = measures;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Measure
          label="They come back"
          value={percent(returnRate.rate)}
          detail={`${returnRate.completedTwoOrMore} of ${returnRate.completedAtLeastOne} leaders who finished an audit have done a second one`}
          help={
            <>
              <p>
                Leaders who have <strong>completed</strong> a second audit, as a share of those who
                completed a first. Counted from finished audits, not from visits — opening the tool
                again is not the same as doing the work again.
              </p>
              <p>
                This is one of the two measures named in the brief. It needs time before it means
                much: a leader is unlikely to repeat an audit within a quarter.
              </p>
            </>
          }
        />
        <Measure
          label="They tell others"
          value={percent(referral.completionRate)}
          detail={`${referral.sent} invitations sent by leaders · ${referral.accepted} accepted · ${referral.completed} finished an audit`}
          help={
            <>
              <p>
                Of the people your leaders invited who accepted, the share who went on to finish an
                audit. Invitations you issue yourself are not counted — this measures word of mouth.
              </p>
              <p>
                A referral unlocks a second audit for the person who sent it when the person they
                invited <strong>finishes</strong> their first, so this figure and that unlock count
                the same event.
              </p>
            </>
          }
        />
      </div>
      <p className="text-muted-foreground text-sm">
        {totals.clients} {totals.clients === 1 ? 'leader has' : 'leaders have'} been given access.{' '}
        {totals.runsCompleted} {totals.runsCompleted === 1 ? 'audit has' : 'audits have'} been
        completed in total.
      </p>
    </div>
  );
}
