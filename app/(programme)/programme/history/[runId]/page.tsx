/**
 * One audit, read back. The summary it produced, and any phase of the conversation behind it.
 *
 * Read-only, and not only on screen: the server refuses writes to a run that is not in progress, so
 * this page cannot change the audit it is showing even if a future component here tried to.
 *
 * `params` is awaited (Next.js 16). The id is validated by the API route, which is also where
 * ownership is checked, so a run belonging to another account is a 404 rather than a read.
 */

import type { Metadata } from 'next';
import { RunReview } from '@/components/app/reclaim/history/run-review';

export const metadata: Metadata = {
  title: 'An audit you have run',
  description: 'The summary of a finished audit, and the conversation behind each phase.',
};

export default async function RunReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunReview runId={runId} />;
}
