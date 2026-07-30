import type { Metadata } from 'next';
import { SharedTranscriptView } from '@/components/app/admin/shared/shared-transcript';

export const metadata: Metadata = {
  title: 'A shared conversation · Programme',
  description: 'The audit conversation a leader chose to let you read',
};

/**
 * One leader's conversation, where they consented to it being read (F17 t-2).
 *
 * A shell. The guard is on the API route the component calls, not here and not on the link that
 * points at it: an admin page is a URL somebody can type, so hiding the entry point protects
 * nothing. `readSharedTranscript` refuses without consent and this renders whatever it gets.
 */
export default async function SharedTranscriptPage({
  params,
}: {
  params: Promise<{ userId: string; runId: string }>;
}) {
  const { userId, runId } = await params;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <SharedTranscriptView userId={userId} runId={runId} />
    </div>
  );
}
