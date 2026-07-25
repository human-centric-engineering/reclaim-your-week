import type { Metadata } from 'next';
import { SharedResults } from '@/components/app/admin/shared/shared-results';

export const metadata: Metadata = {
  title: 'Shared results · Programme',
  description: 'Results leaders shared with you, and the anonymised picture across the cohort',
};

/**
 * The shared-results inbox and the anonymised aggregate (F10 t-3). A shell — the guard is on the API
 * route the component calls.
 */
export default function ProgrammeSharedPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Shared results</h1>
        <p className="text-muted-foreground text-sm">
          What leaders chose to send you, and what the cohort looks like with nobody named.
        </p>
      </header>
      <SharedResults />
    </div>
  );
}
