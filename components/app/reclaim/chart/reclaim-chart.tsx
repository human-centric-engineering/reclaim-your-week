'use client';

/**
 * `<ReclaimChart>` (F6 t-3) — the standardised current-reality visual. A labelled horizontal bar per
 * bucket (**hours, never percentages** as the axis — I8; % shown only as a derived note), the
 * brand-sympathetic provisional palette (`palette.ts`), benchmark markers + over/under flags, a key,
 * and a table view for accessibility. **Renders the numbers, never an interpretation** (I12) — the
 * "what stands out?" beat is the coach (F7). Readable in light and dark; identity is carried by the
 * bar labels, so colour is grouping, not the sole channel.
 */

import { useEffect, useState } from 'react';
import type { ChartData, ChartBucket } from '@/lib/app/programme/chart/series';
import { bucketColour } from '@/components/app/reclaim/chart/palette';
import { NO_VALUE } from '@/components/app/reclaim/format';

/** Detect the active theme so bar fills use the light or dark palette step. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const compute = () => {
      const theme = root.getAttribute('data-theme');
      if (theme === 'dark') return setDark(true);
      if (theme === 'light') return setDark(false);
      setDark(root.classList.contains('dark') || mq.matches);
    };
    compute();
    mq.addEventListener('change', compute);
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => {
      mq.removeEventListener('change', compute);
      obs.disconnect();
    };
  }, []);
  return dark;
}

const STATUS_LABEL: Record<ChartBucket['status'], string> = {
  under: 'below the guide',
  over: 'above the guide',
  in: 'within the guide',
  none: '',
};

export function ReclaimChart({ data }: { data: ChartData }) {
  const isDark = useIsDark();
  const [showTable, setShowTable] = useState(false);

  const benchmarkHours = (pct: number | null) =>
    pct === null ? null : (pct / 100) * data.totalHours;

  const maxHours = Math.max(
    1,
    ...data.buckets.map((b) => Math.max(b.hours, benchmarkHours(b.highPercent) ?? 0))
  );
  const pctOf = (hours: number) => `${Math.min(100, (hours / maxHours) * 100)}%`;

  return (
    <figure className="space-y-5">
      <figcaption className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-foreground text-base font-medium">Where your time went</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {data.source === 'composite'
              ? 'Your calendar plus the work that happens off it'
              : 'Based on your own reflection'}{' '}
            · about {data.totalHours} hours a week
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
              <th className="py-2 pr-4 font-medium">Hours/week</th>
              <th className="py-2 pr-4 font-medium">Share</th>
              <th className="py-2 font-medium">Guide</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr key={b.token} className="border-border/60 border-b">
                <td className="text-foreground py-2 pr-4">{b.title}</td>
                <td className="text-foreground py-2 pr-4 tabular-nums">{b.hours}</td>
                <td className="text-muted-foreground py-2 pr-4 tabular-nums">{b.percent}%</td>
                <td className="text-muted-foreground py-2">{STATUS_LABEL[b.status] || NO_VALUE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="space-y-2.5" role="img" aria-label="Hours per week by area">
          {data.buckets.map((b) => {
            const colour = bucketColour(b.token, isDark ? 'dark' : 'light');
            const low = benchmarkHours(b.lowPercent);
            const high = benchmarkHours(b.highPercent);
            return (
              <div key={b.token} className="grid grid-cols-[10.5rem_1fr] items-center gap-3">
                <div className="text-foreground truncate text-sm" title={b.title}>
                  {b.title}
                </div>
                <div className="bg-muted/60 relative h-7 rounded-md">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md ring-1 ring-black/5 transition-[width]"
                    style={{ width: pctOf(b.hours), backgroundColor: colour }}
                  />
                  {/* Benchmark markers — a recessive tick at the low/high guide. */}
                  {[low, high].map((h, i) =>
                    h === null || h <= 0 ? null : (
                      <span
                        key={i}
                        aria-hidden
                        className="bg-foreground/40 absolute inset-y-1 w-px"
                        style={{ left: pctOf(h) }}
                      />
                    )
                  )}
                  <span className="text-foreground absolute inset-y-0 right-2 flex items-center text-xs font-medium tabular-nums">
                    {b.hours}h
                    {b.status === 'over' && <span className="text-muted-foreground ml-1.5">▲</span>}
                    {b.status === 'under' && (
                      <span className="text-muted-foreground ml-1.5">▽</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground/40 inline-block h-3 w-px" aria-hidden /> guide range
        </span>
        <span>▲ above the guide · ▽ below it</span>
      </div>

      {data.unallocated.length > 0 && (
        <div className="border-border/70 bg-muted/40 rounded-xl border px-5 py-4">
          <p className="text-foreground text-sm font-medium">
            Areas with no time against them this period
          </p>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {data.unallocated.join(' · ')}. Worth holding these next to your priorities. Often the
            most telling gap.
          </p>
        </div>
      )}
    </figure>
  );
}
