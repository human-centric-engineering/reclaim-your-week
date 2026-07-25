'use client';

/**
 * "Invite someone in" (F8 t-3) — the referral ask, at the Phase 6 close.
 *
 * **An invitation, never a nag** (I16, Brief §2: "There is no pressure on next steps anywhere in the
 * product"). It sits below the fold of the close, collapsed until asked for, and it does not tell the
 * leader they have *earned* anything or dangle the second audit as bait. The unlock is real (Brief §8)
 * and is mentioned plainly, once, in the same register as the rest of the product: something that
 * happens, not something to chase.
 *
 * The second audit is granted when the person they invite **completes** their own — never at signup.
 * That is on the server (`access/referrals.ts`); this component only makes the ask.
 */

import { useState } from 'react';
import { referSomeone } from '@/components/app/reclaim/access/actions';

export function ReferralInvite() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      setSent(await referSomeone({ name, email }));
      setName('');
      setEmail('');
    } catch (e) {
      // The server's refusals are deliberately vague about whether an address is registered — show
      // them as-is rather than inventing a friendlier message that would leak the distinction.
      setError(e instanceof Error ? e.message : 'That invitation could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const canSend = name.trim().length > 0 && email.trim().length > 3 && !busy;

  return (
    <section className="print:hidden">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Know someone who would find this useful?
        </button>
      )}

      {open && (
        <div className="border-border/70 space-y-4 border-t pt-6">
          <p className="text-foreground text-[0.95rem] leading-relaxed font-light">
            If someone came to mind while you were doing this, you can invite them.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            When they finish their own audit, a second one opens up for you.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              aria-label="Their first name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their first name"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:w-44"
            />
            <input
              aria-label="Their email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Their email"
              className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:w-64"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="border-input rounded-full border px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>

          {sent !== null && (
            <p className="text-muted-foreground text-sm" role="status">
              {sent}
            </p>
          )}
          {error !== null && (
            <p className="text-muted-foreground text-sm" role="status">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
