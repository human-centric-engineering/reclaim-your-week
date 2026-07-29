'use client';

/**
 * The way into the audit history, shown on the entry screen and nowhere else.
 *
 * **Two deliberate restraints.** It renders nothing until there is at least one audit behind the
 * leader, so a first-time visitor is not offered a door onto an empty room, and it stays off the
 * programme's own bar, which exists to say where you are and let you leave (see `programme-chrome`).
 * Somebody mid-conversation about their working week does not need navigation; somebody standing at
 * the entry, about to begin their third audit, is exactly who wants the other two.
 *
 * Silent on failure. The list is context beside the invitation to begin, not the invitation itself,
 * and a leader who cannot see this link can still start the thing they came for.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readRuns } from '@/components/app/reclaim/history/actions';

export function HistoryLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    void readRuns()
      .then((runs) => setCount(runs.length))
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <p className="mt-10 text-center">
      <Link
        href="/programme/history"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        {count === 1 ? 'Look back at your last audit' : `Look back at your ${count} audits`}
      </Link>
    </p>
  );
}
