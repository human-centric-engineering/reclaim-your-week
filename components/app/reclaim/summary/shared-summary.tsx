'use client';

/**
 * Public shared-summary view (F7 t-4). Fetches the token-gated summary and renders the same artifact
 * the leader saw. No session — the unguessable token is the authorisation; the endpoint returns only
 * shareable-safe fields. A missing/revoked token shows a gentle "not available".
 */

import { useEffect, useState } from 'react';
import { auditSummarySchema, type AuditSummary } from '@/components/app/reclaim/summary/types';
import { SummaryView } from '@/components/app/reclaim/summary/summary-view';

export function SharedSummary({ token }: { token: string }) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/v1/app/reclaim/shared/${encodeURIComponent(token)}`);
        if (!res.ok) return setState('missing');
        const json: unknown = await res.json();
        const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
        const parsed = auditSummarySchema.safeParse(data);
        if (!parsed.success) return setState('missing');
        setSummary(parsed.data);
        setState('ok');
      } catch {
        setState('missing');
      }
    })();
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground text-sm tracking-wide">Loading…</p>
      </div>
    );
  }
  if (state === 'missing' || summary === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-foreground text-lg font-light">
          This shared summary is no longer available.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-12 sm:py-16">
      <SummaryView summary={summary} />
    </div>
  );
}
