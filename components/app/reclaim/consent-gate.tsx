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

interface ConsentState {
  accepted: boolean;
  policyVersion: string;
  marketingOptIn: boolean;
}

export function ConsentGate({ onAccepted }: { onAccepted: () => void }) {
  const [state, setState] = useState<ConsentState | null>(null);
  const [accept, setAccept] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/v1/app/reclaim/consent');
        if (!res.ok) throw new Error('load failed');
        const body: unknown = await res.json();
        const data =
          typeof body === 'object' && body !== null && 'data' in body
            ? ((body as { data?: ConsentState }).data ?? null)
            : null;
        setState(data);
        setMarketing(data?.marketingOptIn ?? false);
        if (data?.accepted === true) onAccepted();
      } catch {
        setError('We could not load the terms just now.');
      }
    };
    void load();
  }, [onAccepted]);

  const submit = async () => {
    if (state === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/app/reclaim/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyVersion: state.policyVersion,
          marketingOptIn: marketing,
          acceptTerms: true,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      onAccepted();
    } catch {
      setError('We could not record that just now. Please try again.');
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
