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
import { NO_VALUE } from '@/components/app/reclaim/format';

function periodLabel(previous: NonNullable<ComparisonView['previous']>): string {
  if (previous.quarter !== null && previous.quarter.trim() !== '') return previous.quarter;
  return new Date(previous.completedAt).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export function Comparison({
  runId,
  liveHours,
}: {
  runId: string;
  /**
   * This audit's hours as the leader is typing them, keyed by canonical bucket slug.
   *
   * The "Now" column cannot come from the server while Phase 1 is open: the panel keeps every entry
   * in local state and only persists on submit, at which point it advances and unmounts. Reading the
   * database for it meant the column was permanently blank — the comparison showed "Then 12h / Now —"
   * for every row, for the whole of the phase it lives in. The plan's promise is that the previous
   * audit sits beside the new one **as it fills in**, so the live state is what has to feed it.
   */
  liveHours?: Record<string, number | null>;
}) {
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

  // Live typing wins over the persisted value; the server's answer stands for a bucket not yet
  // touched this session (a resumed audit, where Phase 1 was filled in on a previous visit).
  const rows = view.buckets.map((bucket) => {
    const live = liveHours?.[bucket.bucketSlug];
    const currentHours = live !== undefined && live !== null ? live : bucket.currentHours;
    return {
      ...bucket,
      currentHours,
      differenceHours:
        bucket.previousHours !== null && currentHours !== null
          ? Math.round((currentHours - bucket.previousHours) * 10) / 10
          : null,
    };
  });

  const anyCurrent = rows.some((b) => b.currentHours !== null);

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
          {rows.map((bucket) => (
            <tr key={bucket.bucketSlug} className="border-b last:border-0">
              <td className="py-2 pr-4">{bucket.title}</td>
              <td className="text-muted-foreground py-2 pr-4 text-right tabular-nums">
                {bucket.previousHours === null ? NO_VALUE : `${bucket.previousHours}h`}
              </td>
              <td className="text-muted-foreground py-2 pr-4 text-right tabular-nums">
                {bucket.currentHours === null ? NO_VALUE : `${bucket.currentHours}h`}
              </td>
              <td className="text-muted-foreground py-2 text-right tabular-nums">
                {bucket.differenceHours === null
                  ? NO_VALUE
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
