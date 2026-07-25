'use client';

/**
 * The client list (F10 t-1) — the one screen that tells Rashmir whether to pick up the phone.
 *
 * Renders entirely from a single enriched `GET` (the repo's no-N+1 rule). Every column that carries a
 * judgement about a person carries its definition with it: "stalled" says how many days of silence
 * the rule is, and "chat cost" says it is a lower bound and that a blank is unknown rather than free.
 * An unexplained badge on a screen about people is exactly what the Intent section of the plan says
 * this feature must not become.
 *
 * The sensitive setup prose is deliberately not here — it lives one click away, in the detail view
 * (plan D5).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FieldHelp } from '@/components/ui/field-help';
import { listClients, type ClientListView, type ClientRow } from '@/components/app/admin/actions';

const STATUS_LABEL: Record<ClientRow['status'], string> = {
  never_started: 'Signed up',
  in_progress: 'Mid-audit',
  stalled: 'Stalled',
  complete: 'Completed',
};

const STATUS_STYLE: Record<ClientRow['status'], string> = {
  never_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  stalled: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  complete: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
};

const TIER_LABEL: Record<string, string> = {
  client: 'Client',
  standard: 'Standard',
  referral: 'Referral',
  free: 'Free',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Cost, or an explicit "not recorded" — never a 0, which would claim the audit was free (plan D2). */
function formatCost(usd: number | null): string {
  if (usd === null) return 'not recorded';
  return `$${usd.toFixed(2)}`;
}

export function ClientsTable() {
  const [view, setView] = useState<ClientListView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | ClientRow['status']>('all');

  const load = useCallback(async () => {
    try {
      setView(await listClients());
      setLoadFailed(false);
    } catch {
      // Gate the render on the load (the F7 lesson): an empty table after a failed fetch reads as
      // "nobody has signed up", which is the opposite of the truth.
      setView(null);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      view === null ? [] : view.clients.filter((c) => filter === 'all' || c.status === filter),
    [view, filter]
  );

  if (loadFailed) {
    return (
      <p className="text-destructive text-sm">
        We could not load the client list.{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Try again
        </button>
        .
      </p>
    );
  }

  if (view === null) {
    return <p className="text-muted-foreground text-sm">Loading the client list…</p>;
  }

  if (view.clients.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No one has come through the door yet. Invitations are issued on the{' '}
        <Link href="/admin/programme/access" className="underline">
          Access
        </Link>{' '}
        screen.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'never_started', 'in_progress', 'stalled', 'complete'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs ${
              filter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
            }`}
          >
            {key === 'all' ? 'Everyone' : STATUS_LABEL[key]}
          </button>
        ))}
        <span className="text-muted-foreground ml-auto text-xs">
          {rows.length} of {view.clients.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="text-muted-foreground border-b text-xs uppercase">
            <tr>
              <th className="py-2 pr-4 font-medium">Leader</th>
              <th className="py-2 pr-4 font-medium">
                Status
                <FieldHelp title="What the statuses mean">
                  <p>
                    <strong>Signed up</strong> — has access but has not started an audit.{' '}
                    <strong>Mid-audit</strong> — an audit is open and recently touched.{' '}
                    <strong>Stalled</strong> — an audit is open with no answer saved for{' '}
                    {view.abandonedAfterDays} days. <strong>Completed</strong> — has finished at
                    least one.
                  </p>
                  <p>
                    An audit is designed to be left and come back to, so silence is not abandonment
                    until it has gone on a while. You can change how long that is in Content.
                  </p>
                </FieldHelp>
              </th>
              <th className="py-2 pr-4 font-medium">Phase</th>
              <th className="py-2 pr-4 font-medium">Tier</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Referred by</th>
              <th className="py-2 pr-4 font-medium">Consent</th>
              <th className="py-2 pr-4 font-medium">Last active</th>
              <th className="py-2 pr-4 font-medium">
                Chat cost
                <FieldHelp title="What chat cost covers">
                  <p>
                    What the coaching conversation cost to run, for the audits where the
                    conversation was recorded. It is a <strong>lower bound</strong>: work outside
                    the conversation, such as reading an uploaded calendar, is billed elsewhere.
                  </p>
                  <p>
                    “Not recorded” means we cannot attribute a conversation to that leader&rsquo;s
                    audits — it does not mean they cost nothing.
                  </p>
                </FieldHelp>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((client) => (
              <tr key={client.userId} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/programme/clients/${client.userId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {client.name ?? client.email}
                  </Link>
                  <div className="text-muted-foreground text-xs">{client.email}</div>
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[client.status]}`}
                  >
                    {STATUS_LABEL[client.status]}
                  </span>
                  {client.completedRuns > 1 && (
                    <div className="text-muted-foreground mt-1 text-xs">
                      {client.completedRuns} audits
                    </div>
                  )}
                </td>
                <td className="text-muted-foreground py-2 pr-4">
                  {client.currentPhaseLabel ?? '—'}
                </td>
                <td className="py-2 pr-4">
                  {client.tier === null ? '—' : (TIER_LABEL[client.tier] ?? client.tier)}
                  {client.windowEndsAt !== null && (
                    <div className="text-muted-foreground text-xs">
                      until {formatDate(client.windowEndsAt)}
                    </div>
                  )}
                </td>
                <td className="text-muted-foreground py-2 pr-4">
                  {client.qualification.reclaim_profile_role ?? '—'}
                </td>
                <td className="text-muted-foreground py-2 pr-4">{client.referredByName ?? '—'}</td>
                <td className="text-muted-foreground py-2 pr-4">
                  {client.policyVersion ?? '—'}
                  {client.marketingOptIn && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">
                      on the list
                    </div>
                  )}
                </td>
                <td className="text-muted-foreground py-2 pr-4">
                  {formatDate(client.lastActivityAt)}
                </td>
                <td className="text-muted-foreground py-2 pr-4">
                  {formatCost(client.chatCostUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
