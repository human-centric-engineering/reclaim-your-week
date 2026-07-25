import type { Metadata } from 'next';
import Link from 'next/link';
import { MeasuresPanel } from '@/components/app/admin/measures/measures-panel';

export const metadata: Metadata = {
  title: 'Reclaim Your Week',
  description: 'Do people come back, and do they tell others — the programme at a glance',
};

/**
 * The programme overview (F10 t-2) — the section's landing page.
 *
 * Two numbers and the routes out. The deeper diagnostics deliberately stay where the framework
 * already built them (plan D1): per-node drop-off and engagement live under `/admin/framework`, and
 * this page links to them rather than reproducing them one tier up.
 */
export default function ProgrammeOverviewPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Reclaim Your Week</h1>
        <p className="text-muted-foreground text-sm">
          The two measures the brief named: whether people come back, and whether they tell others.
        </p>
      </header>

      <MeasuresPanel />

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-medium uppercase">Going deeper</h2>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/admin/programme/clients" className="underline">
              Clients
            </Link>{' '}
            — who is in, where they reached, what their conversation cost.
          </li>
          <li>
            <Link href="/admin/framework/maps/reclaim-audit/heat" className="underline">
              Where audits stall
            </Link>{' '}
            — per-phase traffic and drop-off across everyone.
          </li>
          <li>
            <Link href="/admin/framework/modules/reclaim-audit" className="underline">
              Engagement
            </Link>{' '}
            — entries, completions and dwell time for the module.
          </li>
        </ul>
      </section>
    </div>
  );
}
