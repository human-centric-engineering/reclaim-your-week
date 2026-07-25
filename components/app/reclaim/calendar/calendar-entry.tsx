'use client';

/**
 * Calendar page entry (F5 t-3). Loads the leader's active run (the same enriched read the shell uses)
 * and hands its id to the branch, or invites them to start an audit first. One request on mount.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { currentRunStateSchema, type CurrentRunState } from '@/components/app/reclaim/types';
import { CalendarBranch } from '@/components/app/reclaim/calendar/calendar-branch';

export function CalendarEntry() {
  const [state, setState] = useState<CurrentRunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/v1/app/reclaim/runs/current');
      const json: unknown = await res.json();
      const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
      const parsed = currentRunStateSchema.safeParse(data);
      if (!res.ok || !parsed.success) throw new Error('bad response');
      setState(parsed.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground text-sm tracking-wide">Gathering your audit…</p>
      </div>
    );
  }

  if (failed || state === null || state.run === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-foreground text-lg font-light">
          {failed ? 'We could not load your audit just now.' : 'Start your audit first.'}
        </p>
        <Link
          href="/programme"
          className="text-primary mt-4 inline-block text-sm underline underline-offset-4"
        >
          Go to your audit
        </Link>
      </div>
    );
  }

  return <CalendarBranch runId={state.run.id} />;
}
