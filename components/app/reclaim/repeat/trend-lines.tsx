'use client';

/**
 * Trend lines per bucket, across a leader's audits (F9 t-1).
 *
 * Brief §2: _"Yes to the trend line per area."_
 *
 * **The discipline here is what it does not do.** No arrow is coloured good or bad, no bucket is
 * described as improved or slipped, and nothing is sorted by "biggest change" — that ordering would
 * itself be a claim about what matters. Buckets stay in the canonical order Rashmir wrote them in
 * (§1), and a change is rendered as a signed number of hours (I8) in the same neutral treatment
 * whichever way it went.
 *
 * That is not squeamishness. A quarter where a leader deliberately gave time to their team at the
 * cost of strategy is a success that a valenced chart draws as two failures, and the tool's whole
 * stance (I16) is that the reading belongs to them. The one interpretive act allowed is putting the
 * numbers side by side.
 *
 * Rendered as a small multiple rather than nine overlaid lines: nine distinguishable series in one
 * frame is past the point where colour can carry identity (the F6 t-3 lesson), and each bucket's own
 * shape is what a leader actually reads.
 */

import { useEffect, useState } from 'react';
import { readTrends, type TrendView } from '@/components/app/reclaim/repeat/actions';

/** The label for one audit on the x-axis: the period they audited, else when they finished. */
function runLabel(run: TrendView['runs'][number]): string {
  if (run.quarter !== null && run.quarter.trim() !== '') return run.quarter;
  return new Date(run.completedAt).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  });
}

/** A sparkline over the run series. Points with no data break the line rather than reading as zero. */
function Sparkline({ hours }: { hours: Array<number | null> }) {
  const known = hours.filter((h): h is number => h !== null);
  if (known.length < 2) return null;

  const max = Math.max(...known, 1);
  const width = 100;
  const height = 28;
  const step = hours.length > 1 ? width / (hours.length - 1) : width;

  // Break the path at gaps: an audit that did not record a bucket is unknown, not zero, and joining
  // across it would draw a line through a value nobody gave.
  let d = '';
  let penDown = false;
  hours.forEach((h, i) => {
    if (h === null) {
      penDown = false;
      return;
    }
    const x = i * step;
    const y = height - (h / max) * (height - 4) - 2;
    d += `${penDown ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    penDown = true;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      role="presentation"
    >
      <path
        d={d.trim()}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A signed change in hours, rendered identically whichever direction it went. */
function Change({ hours }: { hours: Array<number | null> }) {
  const known = hours.filter((h): h is number => h !== null);
  if (known.length < 2) return <span className="text-muted-foreground">—</span>;

  const first = known[0] ?? 0;
  const last = known[known.length - 1] ?? 0;
  const delta = Math.round((last - first) * 10) / 10;
  if (delta === 0) return <span className="text-muted-foreground">no change</span>;

  // `+`/`−` and nothing else. No colour, no arrow, no word.
  return (
    <span className="text-muted-foreground tabular-nums">
      {delta > 0 ? '+' : '−'}
      {Math.abs(delta)}h
    </span>
  );
}

export function TrendLines() {
  const [view, setView] = useState<TrendView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readTrends()
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Silent on failure and on "not yet": this sits above the invitation to begin an audit, and an
  // error box there would make a first-time leader think something of theirs was broken.
  if (failed || view === null || !view.enoughData) return null;

  return (
    <section className="border-border/60 mb-12 border-b pb-10">
      <h2 className="text-foreground text-lg font-light">Across your audits</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Hours a week in each area, {view.runs.map(runLabel).join(' then ')}. What the movement means
        is yours to say — some of it will have been deliberate.
      </p>

      <ul className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {view.buckets.map((bucket) => (
          <li key={bucket.bucketSlug} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-foreground truncate text-sm">{bucket.title}</span>
              <span className="text-xs">
                <Change hours={bucket.hours} />
              </span>
            </div>
            <div className="text-primary/70 mt-1">
              <Sparkline hours={bucket.hours} />
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between text-xs tabular-nums">
              {bucket.hours.map((h, i) => (
                <span key={view.runs[i]?.runId ?? i}>{h === null ? '·' : `${h}h`}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
