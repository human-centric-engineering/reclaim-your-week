'use client';

/**
 * `<GapChart>` (F7 t-2) — Phase 4's picture: the **distance** between the week a leader reported and
 * the ideal week they designed, plotted either side of a centre line. Bars to the left are areas they
 * want to give hours back from; bars to the right are areas they want to make room for.
 *
 * **This used to be the two weeks on one track**, a solid bar for now and a hairline tick for the
 * ideal, and it answered the wrong question. The gap was the space between a bar end and a tick, in a
 * different place on every row, at a different length on every row — so the one thing the phase is
 * about was the one thing the reader had to measure by eye. A diverging chart gives it away free: the
 * length *is* the gap, and which side of the line it falls on is which direction. The side-by-side
 * view is not lost, it moved to where its question is asked — `<IdealWeekChart>` in Phase 3.
 *
 * Two departures from the rest of the chart family, both because the subject changed from identity to
 * direction:
 *
 *  - **Colour is polarity, not bucket.** The area is already named in the row label; spending the nine
 *    categorical hues on it again would leave the direction encoded by position alone. See `gapColour`.
 *  - **Rows sort by the size of the change**, most hours wanted at the top down to most hours given
 *    back at the bottom, rather than holding the fixed bucket order the other two charts share. The
 *    ranking *is* the finding — where the week has to move most — and a wedge says it at a glance.
 *
 * Renders the numbers, never an interpretation (I12): what the gap means is the coach's turn.
 */

import { useState } from 'react';
import type { GapChartData } from '@/lib/app/programme/chart/series';
import { gapColour } from '@/components/app/reclaim/chart/palette';
import { useIsDark } from '@/components/app/reclaim/chart/reclaim-chart';

function changeLabel(delta: number): string {
  if (delta === 0) return 'no change';
  return delta > 0 ? `${delta}h more` : `${Math.abs(delta)}h less`;
}

export function GapChart({ data }: { data: GapChartData }) {
  const isDark = useIsDark();
  const [showTable, setShowTable] = useState(false);
  const mode = isDark ? 'dark' : 'light';

  // Sorted here rather than by the caller: this is a property of how the chart reads, not of the data,
  // and `buildGapChartData` is shared with the coach's prose, which wants the fixed area order.
  const rows = [...data.buckets].sort((a, b) => b.delta - a.delta);
  // Symmetric: one hour of "less" has to be the same length as one hour of "more", or the two arms
  // stop being comparable and the wedge lies about which side the week is really leaning.
  const maxDelta = Math.max(1, ...rows.map((b) => Math.abs(b.delta)));
  /** Half-width share of the track, so a full-length bar reaches the outer edge of its own arm. */
  const armPct = (delta: number) => (Math.abs(delta) / maxDelta) * 50;

  const wanted = rows.filter((b) => b.delta > 0).length;
  const given = rows.filter((b) => b.delta < 0).length;

  return (
    <figure className="space-y-5">
      <figcaption className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-foreground text-base font-medium">The gap</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            How far your ideal week sits from the week you have now · about {data.totalCurrent}{' '}
            hours now, {data.totalIdeal} ideal
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-primary shrink-0 text-xs underline underline-offset-4"
        >
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </figcaption>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left text-xs uppercase">
              <th className="py-2 pr-4 font-medium">Area</th>
              <th className="py-2 pr-4 font-medium">Now</th>
              <th className="py-2 pr-4 font-medium">Ideal</th>
              <th className="py-2 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.token} className="border-border/60 border-b">
                <td className="text-foreground py-2 pr-4">{b.title}</td>
                <td className="text-muted-foreground py-2 pr-4 tabular-nums">{b.current}h</td>
                <td className="text-muted-foreground py-2 pr-4 tabular-nums">{b.ideal}h</td>
                <td className="text-foreground py-2 tabular-nums">{changeLabel(b.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="space-y-2">
          {/* The two arms, named above the plot and aligned to it, so the centre line reads as "the
              week you have now" before a single bar is interpreted. */}
          <div className="grid grid-cols-[10.5rem_1fr_6rem] gap-3">
            <div />
            <div className="text-muted-foreground grid grid-cols-2 text-[0.68rem] tracking-[0.14em] uppercase">
              <div className="border-border/70 border-r pr-2 text-right">less time</div>
              <div className="pl-2">more time</div>
            </div>
            <div />
          </div>

          <div
            className="space-y-2.5"
            role="img"
            aria-label={`The change from the week you have now to your ideal week, by area: ${wanted} ${
              wanted === 1 ? 'area wants' : 'areas want'
            } more time, ${given} ${given === 1 ? 'area wants' : 'areas want'} less`}
          >
            {rows.map((b) => {
              const width = armPct(b.delta);
              const wantsMore = b.delta > 0;
              const colour = gapColour(wantsMore ? 'more' : 'less', mode);
              return (
                <div key={b.token} className="grid grid-cols-[10.5rem_1fr_6rem] items-center gap-3">
                  <div className="text-foreground truncate text-sm" title={b.title}>
                    {b.title}
                  </div>

                  <div className="relative h-7">
                    {/* The line the whole chart is read against: this week, as it stands. Drawn full
                        bleed through the row gaps so the nine rows share one continuous axis. */}
                    <span
                      aria-hidden
                      className="bg-foreground/35 absolute -inset-y-2.5 left-1/2 w-px"
                    />

                    {b.delta === 0 ? (
                      <span
                        aria-hidden
                        className="bg-muted-foreground/60 absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      />
                    ) : (
                      // Flat against the centre line, rounded at the far end — the end that carries
                      // the magnitude is the end that gets the corner.
                      <span
                        aria-hidden
                        className={`absolute inset-y-0 ring-1 ring-black/5 transition-[width] ${
                          wantsMore ? 'left-1/2 rounded-r-md' : 'right-1/2 rounded-l-md'
                        }`}
                        style={{ width: `${width}%`, backgroundColor: colour }}
                      />
                    )}
                  </div>

                  {/* Outside the plot, in text ink. Inside the bar it would be dark text on a dark
                      fill for every long row, which is precisely how the first cut of this chart
                      lost its biggest number. */}
                  <div
                    className={`text-right text-xs tabular-nums ${
                      b.delta === 0 ? 'text-muted-foreground/60' : 'text-foreground'
                    }`}
                  >
                    {changeLabel(b.delta)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-7 rounded-sm"
            style={{ backgroundColor: gapColour('less', mode) }}
          />
          hours you would hand back
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-7 rounded-sm"
            style={{ backgroundColor: gapColour('more', mode) }}
          />
          hours you would make room for
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground/35 inline-block h-3.5 w-px" aria-hidden />
          the week you have now
        </span>
      </div>
    </figure>
  );
}
