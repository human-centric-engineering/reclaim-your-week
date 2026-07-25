import type { Metadata } from 'next';
import { ClientDetail } from '@/components/app/admin/clients/client-detail';

export const metadata: Metadata = {
  title: 'Client · Programme',
  description: 'One leader: access, what they told us at setup, and their audits',
};

/**
 * One leader's record (F10 t-1). A shell — the guard is on the API route the component calls.
 *
 * `params` is a promise in Next 16; awaited here so the client component gets a plain string.
 */
export default async function ProgrammeClientPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <ClientDetail userId={userId} />
    </div>
  );
}
