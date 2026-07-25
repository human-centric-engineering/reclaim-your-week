'use client';

/**
 * The comparative open (F9 t-2) — a repeat audit shows the last one beside it.
 *
 * Brief §2: _"…and to opening each repeat by comparing with the last."_
 *
 * Same discipline as the trend lines, and for the same reason: **both numbers and the difference,
 * with no verdict.** The difference is signed and rendered identically in either direction — no
 * colour, no arrow, no "improved". `buildChartData` already knows whether a bucket is inside its
 * benchmark, so writing "you were in range and are now over" is one line away and would be the tool
 * telling a leader what their week means, which is exactly what I12 and I16 exist to prevent.
 *
 * Absent, not empty, on a first audit: the server returns `previous: null` and this renders nothing,
 * so a leader doing their first audit never sees a comparison with blanks in it.
 */

import { useEffect, useState } from 'react';
import { readComparison, type ComparisonView } from '@/components/app/reclaim/repeat/actions';

function periodLabel(previous: NonNullable<ComparisonView['previous']>): string {
  if (previous.quarter !== null && previous.quarter.trim() !== '') return previous.quarter;
  return new Date(previous.completedAt).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export function Comparison({ runId }: { runId: string }) {
  const [view, setView] = useState<ComparisonView | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Silent on failure: this is context beside the phase's own work, not the work itself, and an
    // error box here would land in front of a leader who is mid-audit. `.catch` sits directly on the
    // call rather than after `.then`, so no intermediate rejected promise is ever created.
    void readComparison(runId)
      .catch(() => null)
      .then((v) => {
        if (!cancelled && v !== null) setView(v);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (view === null || view.previous === null || view.buckets.length === 0) return null;

  const anyCurrent = view.buckets.some((b) => b.currentHours !== null);

  return (
    <section className="border-border/60 bg-muted/20 rounded-lg border p-5">
      <h3 className="text-foreground text-sm font-medium">
        Last time ({periodLabel(view.previous)})
      </h3>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
        {anyCurrent
          ? 'Where this week sits against the one you looked at last. Some of what moved will have been on purpose.'
          : 'What you recorded last time, for reference as you fill this in.'}
      </p>

      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-muted-foreground border-b text-xs uppercase">
          <tr>
            <th className="py-2 pr-4 font-medium">Area</th>
            <th className="py-2 pr-4 text-right font-medium">Then</th>
            <th className="py-2 pr-4 text-right font-medium">Now</th>
            <th className="py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {view.buckets.map((bucket) => (
            <tr key={bucket.bucketSlug} className="border-b last:border-0">
              <td className="py-2 pr-4">{bucket.title}</td>
              <td className="text-muted-foreground py-2 pr-4 text-right tabular-nums">
                {bucket.previousHours === null ? '—' : `${bucket.previousHours}h`}
              </td>
              <td className="text-muted-foreground py-2 pr-4 text-right tabular-nums">
                {bucket.currentHours === null ? '—' : `${bucket.currentHours}h`}
              </td>
              <td className="text-muted-foreground py-2 text-right tabular-nums">
                {bucket.differenceHours === null
                  ? '—'
                  : bucket.differenceHours === 0
                    ? 'no change'
                    : `${bucket.differenceHours > 0 ? '+' : '−'}${Math.abs(bucket.differenceHours)}h`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
