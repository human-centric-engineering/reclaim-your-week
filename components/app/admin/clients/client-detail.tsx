'use client';

/**
 * One leader's record (F10 t-1) — and the only place the `sensitive` setup prose is shown (plan D5).
 *
 * The design decision worth keeping: those two answers are behind a **deliberate act**. Rashmir is
 * entitled to read what a leader said was keeping them up at night — she is their coach, and F7 hands
 * the same words back to the leader themselves — but a sensitive disclosure should be opened, not
 * scrolled past. The list withholds them at the API level, not with CSS, and this screen labels the
 * section for what it is rather than presenting it as one more column of data.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getClient, type ClientDetailView } from '@/components/app/admin/actions';
import { ReachOutComposer } from '@/components/app/admin/clients/reach-out-composer';
import { PreviewBadge } from '@/components/app/admin/preview/preview-badge';

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const QUALIFICATION_LABEL: Record<string, string> = {
  reclaim_profile_first_name: 'First name',
  reclaim_profile_role: 'Role',
  reclaim_profile_org_type: 'Organisation',
  reclaim_profile_direct_reports: 'Direct reports',
  reclaim_setup_weekly_hours: 'Weekly hours',
  reclaim_setup_priorities: 'Priorities this year',
  reclaim_setup_in_transition: 'In transition',
};

export function ClientDetail({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<ClientDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await getClient(userId));
      setError(null);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : 'We could not load that record.');
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) return <p className="text-destructive text-sm">{error}</p>;
  if (detail === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const { client, context, runs } = detail;
  const qualification = Object.entries(client.qualification);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/admin/programme/clients" className="text-sm underline">
          ← All clients
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{client.name ?? client.email}</h1>
          <PreviewBadge isPreview={client.isPreview} />
        </div>
        <p className="text-muted-foreground text-sm">
          {client.email} · joined {formatDate(client.joinedAt)}
          {client.referredByName !== null && ` · referred by ${client.referredByName}`}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-medium uppercase">Access</h2>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">Tier</dt>
            <dd>{client.tier ?? 'none'}</dd>
          </div>
          <div className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">Audits used</dt>
            <dd>
              {client.auditsUsed ?? 0} of {client.auditsGranted ?? 0}
            </dd>
          </div>
          <div className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">Access until</dt>
            <dd>{formatDate(client.windowEndsAt)}</dd>
          </div>
          <div className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">Terms accepted</dt>
            <dd>
              {client.policyVersion ?? 'not accepted'}
              {client.marketingOptIn ? ' · on the list' : ''}
            </dd>
          </div>
        </dl>
      </section>

      {qualification.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium uppercase">
            What they told us at setup
          </h2>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {qualification.map(([slug, value]) => (
              <div key={slug} className="flex justify-between gap-4 border-b py-1">
                <dt className="text-muted-foreground">{QUALIFICATION_LABEL[slug] ?? slug}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {context.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium uppercase">Personal context</h2>
          <p className="text-muted-foreground text-sm">
            What this leader said about their own situation, in their words. It is the most personal
            thing they gave the tool, and it is here rather than on the list for that reason.
          </p>
          {contextOpen ? (
            <dl className="space-y-3 text-sm">
              {context.map((entry) => (
                <div key={entry.slug} className="rounded-md border p-3">
                  <dt className="text-muted-foreground text-xs uppercase">{entry.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <button
              type="button"
              onClick={() => setContextOpen(true)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Show personal context ({context.length})
            </button>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-medium uppercase">Audits</h2>
        {runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No audit started yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground border-b text-xs uppercase">
              <tr>
                <th className="py-2 pr-4 font-medium">Started</th>
                <th className="py-2 pr-4 font-medium">Period</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Reached</th>
                <th className="py-2 pr-4 font-medium">Chat cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{formatDate(run.startedAt)}</td>
                  <td className="text-muted-foreground py-2 pr-4">{run.quarter ?? '—'}</td>
                  <td className="text-muted-foreground py-2 pr-4">{run.status}</td>
                  <td className="text-muted-foreground py-2 pr-4">
                    {run.currentPhaseLabel ?? '—'}
                  </td>
                  <td className="text-muted-foreground py-2 pr-4">
                    {run.chatCostUsd === null ? 'not recorded' : `$${run.chatCostUsd.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-muted-foreground text-sm">
          The full step-by-step traversal lives in the framework&rsquo;s{' '}
          <Link href={detail.journeyHref} className="underline">
            journey explorer
          </Link>
          .
        </p>
      </section>

      {/* F18 t-2. Placed after the audits, because the message is written having read where they
          stopped, and before the export, which is the compliance drawer rather than the coaching. */}
      <ReachOutComposer userId={userId} />

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-medium uppercase">
          Everything we hold about them
        </h2>
        <p className="text-muted-foreground text-sm">
          The complete record, including their own written answers — what you would send if this
          leader asked for a copy of their data.
        </p>
        <a
          href={`/api/v1/app/reclaim/admin/clients/${userId}/export`}
          className="inline-block rounded-md border px-3 py-2 text-sm"
        >
          Download the full record (JSON)
        </a>
      </section>
    </div>
  );
}
