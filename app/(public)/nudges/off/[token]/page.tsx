/**
 * One-click nudge opt-out (F9 t-3). **No session required, and that is the point.**
 *
 * A leader who has stopped using the product must not have to sign back into it to make the email
 * stop. So this is a public page that acts on the token in the URL and tells them what happened —
 * the whole interaction is opening the link.
 *
 * It is a Server Component that performs the opt-out during render, which is unusual and deliberate:
 * a client-side effect would leave the leader looking at a spinner and, if it failed, at an email
 * they cannot escape. There is no form to submit and nothing to confirm — a confirmation step here
 * would be the product arguing with someone who has already decided.
 *
 * **Safe to act on GET despite the usual rule**, because the action is *removing* the recipient's own
 * exposure: it grants nothing, reveals nothing, and a link-prefetching mail client that triggers it
 * has done exactly what the leader was being offered. `optOutByToken` is idempotent, so a second
 * visit is not an error.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { optOutByToken } from '@/lib/app/programme/nudges/tick';

export const metadata: Metadata = {
  title: 'Reminders turned off',
  description: 'You will not receive further reminders about your time audit.',
  // Never index an unsubscribe URL.
  robots: { index: false, follow: false },
};

export default async function NudgeOptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Shape-check before touching the database: the token is 64 hex characters, and anything else is
  // not worth a query.
  const known = /^[a-f0-9]{32,96}$/.test(token) ? await optOutByToken(token) : false;

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {known ? (
        <>
          <h1 className="text-foreground text-2xl font-light">That is done.</h1>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            You will not get further reminders about your time audit. Nothing else has changed, and
            your audits are still there whenever you want them.
          </p>
          <Link
            href="/programme"
            className="text-primary mt-8 inline-block text-sm underline underline-offset-4"
          >
            Go to your audit
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-foreground text-2xl font-light">That link is not one of ours.</h1>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            It may have been copied incompletely. If you are still receiving reminders you did not
            ask for, replying to the email will reach a person.
          </p>
        </>
      )}
    </div>
  );
}
