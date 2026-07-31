'use client';

/**
 * `<IdealWeekChart>` — the week a leader has now with the week they are designing marked on top of it,
 * area by area. **Phase 3's picture**, not Phase 4's: the question here is "what am I aiming at",
 * which is a target laid over a reality, so both weeks belong on one track.
 *
 * The gap *between* the two is Phase 4's question and gets its own chart (`<GapChart>`), which plots
 * the difference either side of a centre line. Splitting them is the point: one track carrying two
 * weeks answers "where am I aiming" well and "how far is that" badly — the eye has to measure the
 * distance between a bar end and a tick, across nine rows of different lengths, which is exactly the
 * comparison a diverging chart makes free.
 *
 * Three things carry the ideal figure, because a single hairline over a coloured bar carried none of
 * them well:
 *
 *  - a **goalpost** — a solid marker that stands proud of the track top and bottom, ringed in the
 *    surface colour so it separates from whatever fill is behind it;
 *  - the **distance itself, drawn**: a dashed outline from the bar end out to the marker where the
 *    leader wants more time, and a scrim over the far end of the bar where they want less. The
 *    direction is visible before any number is read;
 *  - **both figures in their own column**, outside the track. They used to sit inside it, right-
 *    aligned, which put dark text over a dark bar on every long row.
 *
 * Renders the numbers, never an interpretation (I12) — the reading is the coach's turn.
 */

import { useState } from 'react';
import type { GapChartData } from '@/lib/app/programme/chart/series';
import { bucketColour } from '@/components/app/reclaim/chart/palette';
import { useIsDark } from '@/components/app/reclaim/chart/reclaim-chart';

function changeLabel(delta: number): string {
  if (delta === 0) return 'no change';
  return delta > 0 ? `${delta}h more` : `${Math.abs(delta)}h less`;
}

export function IdealWeekChart({ data }: { data: GapChartData }) {
  const isDark = useIsDark();
  const [showTable, setShowTable] = useState(false);

  const maxHours = Math.max(1, ...data.buckets.map((b) => Math.max(b.current, b.ideal)));
  const pctOf = (hours: number) => (Math.min(maxHours, Math.max(0, hours)) / maxHours) * 100;

  return (
    <figure className="space-y-5">
      <figcaption className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-foreground text-base font-medium">Your ideal week</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            The week you have now, with the week you are designing marked on it · about{' '}
            {data.totalCurrent} hours now, {data.totalIdeal} ideal
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
              <th className="py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr key={b.token} className="border-border/60 border-b">
                <td className="text-foreground py-2 pr-4">{b.title}</td>
                <td className="text-muted-foreground py-2 pr-4 tabular-nums">{b.current}h</td>
                <td className="text-foreground py-2 pr-4 tabular-nums">{b.ideal}h</td>
                <td className="text-muted-foreground py-2 tabular-nums">{changeLabel(b.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        // `space-y-4` rather than the tighter rhythm of the other charts: the goalpost stands proud of
        // the track, so a row needs clearance above and below it or the marker of one area touches the
        // track of the next.
        <div
          className="space-y-4"
          role="img"
          aria-label="Hours per week by area, the week you have now with your ideal week marked on each bar"
        >
          {data.buckets.map((b) => {
            const colour = bucketColour(b.token, isDark ? 'dark' : 'light');
            const now = pctOf(b.current);
            const want = pctOf(b.ideal);
            // The distance, drawn as a region rather than left to be measured between two edges.
            // Wanting more opens an outline beyond the bar; wanting less ghosts the far end of the bar
            // that would be handed back.
            const wantsMore = b.delta > 0;
            const from = Math.min(now, want);
            const span = Math.abs(want - now);
            return (
              <div key={b.token} className="grid grid-cols-[10.5rem_1fr_6rem] items-center gap-3">
                <div className="text-foreground truncate text-sm" title={b.title}>
                  {b.title}
                </div>

                <div className="bg-muted/60 relative h-8 rounded-md">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md ring-1 ring-black/5 transition-[width]"
                    style={{ width: `${now}%`, backgroundColor: colour }}
                  />

                  {span > 0.5 && (
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 rounded-md ${
                        wantsMore
                          ? 'border-foreground/45 border-2 border-dashed'
                          : // A scrim in the surface colour: it lightens the fill in light mode and
                            // darkens it in dark mode, so the handed-back end of the bar recedes
                            // against any of the nine hues without needing one tint per mode.
                            'bg-background/55 border-foreground/35 border-y-0 border-r-0 border-l-2 border-dashed'
                      }`}
                      style={{ left: `${from}%`, width: `${span}%` }}
                    />
                  )}

                  {/* The goalpost. Solid, three pixels, standing proud of the track at both ends and
                      ringed in the surface colour, so it reads as a target laid over the bar rather
                      than as a scratch on it. The cap points down at the figure it marks. */}
                  <span
                    aria-hidden
                    className="bg-foreground absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full shadow-[0_0_0_2px_var(--color-background)]"
                    style={{ left: `${want}%` }}
                  />
                  <span
                    aria-hidden
                    className="absolute -top-[7px] h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
                    style={{ left: `${want}%`, borderTopColor: 'var(--color-foreground)' }}
                  />
                </div>

                <div className="text-right text-xs tabular-nums">
                  <span className="text-muted-foreground">{b.current}h</span>
                  <span className="text-muted-foreground/50 px-1" aria-label="becomes">
                    →
                  </span>
                  <span className="text-foreground font-medium">{b.ideal}h</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/70 inline-block h-3 w-7 rounded-sm" aria-hidden />
          the week you have now
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground inline-block h-4 w-[3px] rounded-full" aria-hidden />
          your ideal week
        </span>
      </div>
    </figure>
  );
}
