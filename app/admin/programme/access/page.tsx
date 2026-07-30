import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccessWorkspace } from '@/components/app/admin/access/access-workspace';

export const metadata: Metadata = {
  title: 'Programme access',
  description: 'Issue and withdraw tiered invitations to Reclaim Your Week',
};

/**
 * Admin access page (F8 t-1, extended F11) — the leaf's own admin surface under
 * `app/admin/programme/**`, reached from the "Reclaim Your Week" sidebar section registered in
 * `lib/app/leaf-admin-nav.ts`.
 *
 * Admin authorisation is enforced where it belongs — on the API routes these components call
 * (`withAdminAuth`) — plus the edge session gate on `/admin`. The page itself is a shell.
 *
 * Two ways in, each followed by its own ledger: invite a named person, then invite a room. They are
 * separate **tabs** rather than one form with a mode, because a name and an email have nothing in
 * common with a seat count and a number of days — see `access-workspace.tsx` for why the two are
 * tabs and not two pages.
 *
 * The `Suspense` boundary is what `useUrlTabs` needs: it reads `useSearchParams`, and a client
 * component that does so must sit under one or this route cannot be statically rendered.
 */
export default function ProgrammeAccessPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Suspense fallback={null}>
        <AccessWorkspace />
      </Suspense>
    </div>
  );
}
