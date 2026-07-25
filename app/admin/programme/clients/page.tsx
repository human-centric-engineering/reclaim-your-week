import type { Metadata } from 'next';
import { ClientsTable } from '@/components/app/admin/clients/clients-table';

export const metadata: Metadata = {
  title: 'Programme clients',
  description: 'Who is in the programme, where they have reached, and what it has cost',
};

/**
 * The client list (F10 t-1) — a leaf admin surface under `app/admin/programme/**`, reached from the
 * "Reclaim Your Week" sidebar section in `lib/app/leaf-admin-nav.ts` (never the `admin-nav.ts`
 * bridge — I10).
 *
 * Admin authorisation is enforced where it belongs — on the API routes this page calls
 * (`withAdminAuth`) — plus the edge session gate on `/admin`. The page itself is a shell.
 */
export default function ProgrammeClientsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-muted-foreground text-sm">
          Everyone who has been given access, where they have reached, and what their coaching
          conversation has cost to run.
        </p>
      </header>
      <ClientsTable />
    </div>
  );
}
