'use client';

/**
 * The Phase 6 summary artifact (F7 t-4, §10) — a standalone, print-friendly view rendered from the
 * run's slots. Reused by the in-app Phase 6 panel and the public token-gated page. Carries only the
 * §10 summary fields (no sensitive prose). Renders the numbers, not a verdict (I12).
 */

import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';
import { NO_VALUE } from '@/components/app/reclaim/format';

export function SummaryView({ summary }: { summary: AuditSummary }) {
  const heading = summary.firstName ? `${summary.firstName}'s time audit` : 'Your time audit';
  const sub = [summary.role, summary.orgType].filter(Boolean).join(' · ');

  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
          Reclaim your week
        </p>
        <h1 className="text-foreground text-3xl leading-tight font-light sm:text-4xl">{heading}</h1>
        {(sub || summary.period) && (
          <p className="text-muted-foreground text-sm">
            {sub}
            {sub && summary.period ? ' · ' : ''}
            {summary.period ? `audited over the ${summary.period}` : ''}
          </p>
        )}
      </header>

      {summary.priorities && (
        <section>
          <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
            Priorities this year
          </h2>
          <p className="text-foreground mt-2 leading-relaxed">{summary.priorities}</p>
        </section>
      )}

      <section>
        <ReclaimChart data={summary.current} />
      </section>

      {summary.rows.some((r) => r.ideal !== null) && (
        <section>
          <h2 className="text-foreground text-base font-medium">Now, and your ideal</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                  <th className="py-2 pr-4 font-medium">Area</th>
                  <th className="py-2 pr-4 font-medium">Now</th>
                  <th className="py-2 font-medium">Ideal</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.token} className="border-border/60 border-b">
                    <td className="text-foreground py-2 pr-4">{r.title}</td>
                    <td className="text-muted-foreground py-2 pr-4 tabular-nums">{r.current}h</td>
                    <td className="text-foreground py-2 tabular-nums">
                      {r.ideal === null ? NO_VALUE : `${r.ideal}h`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {summary.action.chosen && (
        <section className="bg-muted rounded-2xl px-6 py-5">
          <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
            What you will start
          </h2>
          <p className="text-foreground mt-2 text-lg leading-relaxed font-light">
            {summary.action.chosen}
          </p>
          {summary.action.when && (
            <p className="text-muted-foreground mt-2 text-sm">Starting: {summary.action.when}</p>
          )}
          {summary.action.howKnown && (
            <p className="text-muted-foreground text-sm">
              You will know it worked when: {summary.action.howKnown}
            </p>
          )}
        </section>
      )}

      <footer className="border-border/70 border-t pt-6">
        <p className="text-muted-foreground text-xs leading-relaxed">{summary.footnote}</p>
      </footer>
    </article>
  );
}
