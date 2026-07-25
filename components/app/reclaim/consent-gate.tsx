'use client';

/**
 * The consent gate (F8 t-4) — the programme door.
 *
 * Shown before a leader's first audit, because the server refuses run creation without a recorded
 * acceptance of the current policy version. It is deliberately **not** a modal or an interstitial with
 * a dark pattern: two plain statements, two separate choices, and the second one is not required.
 *
 * The two things that must not drift:
 *   - **the marketing box is separate, unticked, and optional** (reconciliation 7; UK GDPR/PECR needs
 *     an affirmative, separate act — accepting terms is not consent to be emailed);
 *   - **the version is the server's**, echoed back on submit, so a leader who was shown older terms is
 *     asked again rather than silently recorded as having accepted the new ones.
 *
 * The clause text itself is Rashmir's to supply (plan.md open item 7). Until it exists this links to
 * the standing pages and says plainly what the acceptance covers — the mechanism is not blocked on the
 * wording, but the wording is not invented here either (I11's spirit).
 */

import { useEffect, useState } from 'react';
import {
  readConsentState,
  acceptConsent,
  type ConsentState,
} from '@/components/app/reclaim/access/actions';

export function ConsentGate({ onAccepted }: { onAccepted: () => void }) {
  const [state, setState] = useState<ConsentState | null>(null);
  const [accept, setAccept] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NOTE: `onAccepted` MUST be a stable reference (the shell memoises it with `useCallback`). It is a
  // dependency of the load effect, so an inline arrow would change identity on every render — and the
  // effect's own `setState` re-renders — turning this into a GET /consent loop for as long as the gate
  // was on screen.
  useEffect(() => {
    const load = async () => {
      try {
        const data = await readConsentState();
        setState(data);
        setMarketing(data.marketingOptIn);
        if (data.accepted) onAccepted();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'We could not load the terms just now.');
      }
    };
    void load();
  }, [onAccepted]);

  const submit = async () => {
    if (state === null) return;
    setBusy(true);
    setError(null);
    try {
      await acceptConsent(state.policyVersion, marketing);
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not record that just now.');
      setBusy(false);
    }
  };

  if (state === null) {
    return (
      <p className="text-muted-foreground mx-auto max-w-xl px-4 py-20 text-center text-sm">
        {error ?? 'Loading…'}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
        Before you begin
      </p>
      <h1 className="text-foreground mt-5 text-3xl leading-tight font-light">
        A word about your data.
      </h1>

      <div className="text-muted-foreground mt-6 space-y-4 text-[1.02rem] leading-relaxed">
        <p>
          What you write here is yours. Your individual answers stay confidential and are never
          shared with anyone else who uses this tool.
        </p>
        <p>
          Rashmir looks at patterns <em>across</em> audits — anonymised and aggregated, never
          individual — to understand what leaders are carrying. Accepting the terms below includes
          that use.
        </p>
      </div>

      <div className="mt-8 space-y-5">
        <label className="flex cursor-pointer items-start gap-3 text-[0.95rem] leading-relaxed">
          <input
            type="checkbox"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            className="mt-1"
          />
          <span>
            I accept the{' '}
            <a href="/terms" className="text-primary underline underline-offset-4">
              terms
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-primary underline underline-offset-4">
              privacy policy
            </a>
            , including the use of anonymised, aggregated data as described above.
          </span>
        </label>

        {/* Separate, unticked, and genuinely optional — never implied by the acceptance above. */}
        <label className="text-muted-foreground flex cursor-pointer items-start gap-3 text-[0.95rem] leading-relaxed">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-1"
          />
          <span>
            Optional: I would like to hear from Rashmir occasionally. You can stop this at any time,
            and it makes no difference to your audit.
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!accept || busy}
        className="bg-primary text-primary-foreground mt-9 rounded-full px-8 py-3 text-[0.95rem] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Continue'}
      </button>

      {error !== null && <p className="text-muted-foreground mt-5 text-sm">{error}</p>}
    </div>
  );
}
