import type { Metadata } from 'next';
import { JoinForm } from '@/components/app/reclaim/access/join-form';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Join ${BRAND.name}`,
  description: `Claim your invitation to ${BRAND.name}`,
  // The URL carries a bearer token. Keeping it out of search indexes will not stop a link that has
  // been forwarded, but it does stop one that was posted somewhere public becoming permanently
  // findable — the seat count is the real bound, this is hygiene on top of it.
  robots: { index: false, follow: false },
};

/**
 * The public claim page for a group invite link (F11).
 *
 * **A shell, deliberately.** It does not resolve the token server-side, so an unknown, withdrawn,
 * expired or full link renders the form and is refused on submit with a sentence that says which of
 * those it was. That is the right trade for this screen: pre-checking would mean a database read on
 * every scan of every URL anyone ever pastes, and the refusal a person needs to read is the same
 * either way. The form is the only place a claim can be made, and the server decides there.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <JoinForm token={token} />
    </div>
  );
}
