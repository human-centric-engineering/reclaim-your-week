'use client';

/**
 * The entry (F4 t-4) — what a leader sees before any run exists. A serene invitation, not a sign-up
 * funnel (I16): one calm line and one door. Starts a run (`POST /runs`) and hands back to the shell.
 */

import { useState } from 'react';

export function BeginAudit({ onStarted }: { onStarted: () => void }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/app/reclaim/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        // The entitlement gate's refusal is *product copy*, not an error string (F8 t-2): it explains
        // which tier the leader is on and what happens next, without a pitch and without implying they
        // did something wrong (I16/I17). Surface it verbatim; fall back only when there is no message.
        const body: unknown = await res.json().catch(() => null);
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? (body as { error?: { message?: string } }).error?.message
            : undefined;
        throw new Error(message ?? 'We could not start your audit just now.');
      }
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
        Reclaim your week
      </p>
      <h1 className="text-foreground mt-6 text-4xl leading-tight font-light text-balance sm:text-5xl">
        A quiet look at where your time really goes.
      </h1>
      <p className="text-muted-foreground mx-auto mt-6 max-w-md text-[1.05rem] leading-relaxed">
        Not to do more, but to lead with more ease. Take it at your own pace; you can leave and come
        back whenever you like.
      </p>
      <button
        type="button"
        onClick={() => void begin()}
        disabled={starting}
        className="bg-primary text-primary-foreground mt-10 rounded-full px-9 py-3.5 text-[0.95rem] font-medium tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {starting ? 'Beginning…' : 'Begin'}
      </button>
      {error !== null && (
        <p className="text-muted-foreground mx-auto mt-8 max-w-md text-[0.95rem] leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}
