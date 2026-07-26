import type { Metadata } from 'next';
import { InviteManager } from '@/components/app/admin/access/invite-manager';
import { LinkManager } from '@/components/app/admin/access/link-manager';

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
 * separate cards rather than one form with a mode, because a name and an email have nothing in common
 * with a seat count and a number of days.
 */
export default function ProgrammeAccessPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <InviteManager />
      <LinkManager />
    </div>
  );
}
