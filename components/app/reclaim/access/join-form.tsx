'use client';

/**
 * The group-link claim form (F11) — the first thing a leader ever sees of Reclaim Your Week.
 *
 * They have scanned a code in a room, or opened a link someone sent. They have not signed up, do not
 * have an account, and have no idea what this is yet. So this screen does three things and stops:
 * says what it is, takes a name and an email, and tells them to check their inbox.
 *
 * **No password, no account, no consent tick.** Account creation still runs through the invitation
 * email and Sunrise's `/accept-invite`, which is what proves the address belongs to them. Consent to
 * terms is asked once, later, at the gate in front of the first audit, where it is versioned and
 * recorded. Collecting either here would be asking for something before there is anything to agree to.
 *
 * `website` is the honeypot: hidden from a person, filled by a bot, refused on the server.
 */

import { useState } from 'react';
import Link from 'next/link';
import { claimJoinLink, type ClaimResult } from '@/components/app/reclaim/access/actions';

interface JoinFormProps {
  token: string;
}

/**
 * The heading for each outcome. The body copy is the server's (it is written once, where the decision
 * is made); only the heading lives here, because it is a property of the screen rather than of the
 * claim.
 */
const HEADING: Record<ClaimResult['outcome'], string> = {
  invited: 'Check your email',
  already_claimed: 'Check your email',
  invited_email_failed: 'Your place is held',
  already_registered: 'You are already set up',
};

export function JoinForm({ token }: JoinFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(await claimJoinLink(token, { name, email, website }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'We could not do that just now. Try again in a moment, or ask whoever shared the link.'
      );
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = name.trim().length > 0 && email.trim().length > 3 && !busy;

  if (done !== null) {
    return (
      <div className="space-y-4">
        {/*
          The heading has to match what actually happened. "Check your email" above a message saying
          the email could not be sent is worse than either sentence alone, and a heading is what
          people read when they skim.
        */}
        <h1 className="text-2xl font-semibold">{HEADING[done.outcome]}</h1>
        <p className="text-muted-foreground">{done.message}</p>
        {done.outcome === 'already_registered' && (
          <Link href="/login" className="text-primary text-sm underline">
            Sign in
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">You have been invited to Reclaim Your Week</h1>
        <p className="text-muted-foreground">
          A short, structured look at where your working week actually goes, and what you would like
          to be different. Add your name and email and we will send you a link to get started.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="join-name" className="text-sm font-medium">
            First name
          </label>
          <input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Priya"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="join-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="join-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            placeholder="priya@example.org"
          />
        </div>

        {/* Honeypot. Hidden from people and from assistive technology; bots fill it in. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Send me the link'}
        </button>

        {error !== null && <p className="text-destructive text-sm">{error}</p>}

        <p className="text-muted-foreground text-xs">
          We use your name and email to send the invitation and, if you go on to run an audit, to
          keep your answers. Nothing is shared with anyone else. See our{' '}
          <Link href="/privacy" className="underline">
            privacy notice
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
