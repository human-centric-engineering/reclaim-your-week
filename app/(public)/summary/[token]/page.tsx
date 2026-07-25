/**
 * Public shared-summary page (F7 t-4). A thin Server Component; the token-gated fetch + render is a
 * client island. Lives in the `(public)` group — no session required (the token authorises).
 */

import type { Metadata } from 'next';
import { SharedSummary } from '@/components/app/reclaim/summary/shared-summary';

export const metadata: Metadata = {
  title: 'A shared time audit',
  description: 'A summary shared from Reclaim Your Week.',
};

export default async function SharedSummaryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedSummary token={token} />;
}
