import type { Metadata } from 'next';
import { InviteManager } from '@/components/app/admin/access/invite-manager';

export const metadata: Metadata = {
  title: 'Programme access',
  description: 'Issue and withdraw tiered invitations to Reclaim Your Week',
};

/**
 * Admin access page (F8 t-1) — the leaf's own admin surface under `app/admin/programme/**`, reached
 * from the "Reclaim Your Week" sidebar section registered in `lib/app/leaf-admin-nav.ts`.
 *
 * Admin authorisation is enforced where it belongs — on the API routes this page calls
 * (`withAdminAuth`) — plus the edge session gate on `/admin`. The page itself is a shell.
 */
export default function ProgrammeAccessPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <InviteManager />
    </div>
  );
}
