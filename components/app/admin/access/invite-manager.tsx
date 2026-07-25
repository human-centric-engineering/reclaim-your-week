'use client';

/**
 * Admin access surface (F8 t-1) — issue a tiered invite, see who holds one, withdraw one.
 *
 * A **leaf** admin surface under `app/admin/programme/**`, registered through `leaf-admin-nav.ts`.
 * Sunrise's generic `/admin/users/invite` page keeps working untouched for ordinary user admin (I10);
 * what it cannot express is the access **tier**, which is the whole point of this screen.
 *
 * The table renders entirely from one enriched `GET` (repo rule: no per-row fetches). The full client
 * list — mid-audit, abandoned-at-phase, cost per run — is F10 t-1's job, not this one's.
 */

import { useCallback, useEffect, useState } from 'react';
import { FieldHelp } from '@/components/ui/field-help';
import { RECLAIM_INVITE_TIERS } from '@/lib/app/programme/access/tiers';

interface InviteRow {
  id: string;
  email: string;
  tier: string;
  status: 'pending' | 'redeemed' | 'revoked';
  invitedByName: string | null;
  redeemedByName: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

const TIER_LABEL: Record<string, string> = {
  standard: 'Standard — one complete audit',
  client: 'Client — repeat audits for 12 months',
  referral: 'Referral — one complete audit',
  free: 'Free — one complete audit',
};

const STATUS_STYLE: Record<InviteRow['status'], string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  redeemed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  revoked: 'bg-muted text-muted-foreground',
};

export function InviteManager() {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState<string>('standard');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/app/reclaim/invites');
      if (!res.ok) throw new Error('load failed');
      const body: unknown = await res.json();
      const rows =
        typeof body === 'object' && body !== null && 'data' in body
          ? ((body as { data?: { invites?: InviteRow[] } }).data?.invites ?? [])
          : [];
      setInvites(rows);
      setLoadFailed(false);
    } catch {
      // Gate the render on the load (F7's lesson): an empty table after a failed fetch reads as
      // "no one has been invited", which is the opposite of the truth.
      setInvites(null);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const issue = async (resend: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/app/reclaim/invites${resend ? '?resend=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, tier }),
      });
      const body: unknown = await res.json();
      const message =
        typeof body === 'object' && body !== null && 'data' in body
          ? (body as { data?: { message?: string } }).data?.message
          : undefined;
      const apiError =
        typeof body === 'object' && body !== null && 'error' in body
          ? (body as { error?: { message?: string } }).error?.message
          : undefined;

      if (!res.ok) {
        setError(apiError ?? 'The invitation could not be issued.');
        return;
      }
      setNotice(message ?? 'Invitation issued.');
      if (message?.startsWith('An invitation is already pending') !== true) {
        setEmail('');
        setName('');
      }
      await load();
    } catch {
      setError('The invitation could not be issued.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/app/reclaim/invites/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('revoke failed');
      setNotice('Invitation withdrawn.');
      await load();
    } catch {
      setError('That invitation could not be withdrawn.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 3 && name.trim().length > 0 && !busy;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Access</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reclaim Your Week is invite-only. An account with no invitation cannot start an audit.
        </p>
      </header>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-lg font-medium">Invite someone</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="invite-name" className="text-sm font-medium">
              First name
            </label>
            <input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Priya"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="priya@example.org"
            />
          </div>
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <label htmlFor="invite-tier">Tier</label>
              <FieldHelp title="Access tiers">
                <p>
                  <strong>Standard</strong> grants one complete audit — the full first-audit
                  experience.
                </p>
                <p className="mt-2">
                  <strong>Client</strong> is for people you are working with: repeat audits for
                  twelve months, starting the first time they run one. They need to start within a
                  month of being invited.
                </p>
                <p className="mt-2">
                  <strong>Referral</strong> is what a participant sends to someone else. It grants
                  one audit, and earns the person who sent it a second one once the invitee finishes
                  theirs.
                </p>
              </FieldHelp>
            </span>
            <select
              id="invite-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {RECLAIM_INVITE_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t] ?? t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void issue(false)}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Send invitation'}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void issue(true)}
            className="border-input rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Re-send with a new link
          </button>
          {notice !== null && <p className="text-muted-foreground text-sm">{notice}</p>}
          {error !== null && <p className="text-destructive text-sm">{error}</p>}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Invitations</h2>
        {loadFailed && (
          <p className="text-muted-foreground mt-3 text-sm">
            The invitation list could not be loaded. Refresh to try again.
          </p>
        )}
        {invites === null && !loadFailed && (
          <p className="text-muted-foreground mt-3 text-sm">Loading…</p>
        )}
        {invites !== null && invites.length === 0 && (
          <p className="text-muted-foreground mt-3 text-sm">No invitations yet.</p>
        )}
        {invites !== null && invites.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Tier</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Referred by</th>
                  <th className="px-4 py-2.5 font-medium">Redeemed</th>
                  <th className="sr-only px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-t">
                    <td className="px-4 py-2.5">{invite.email}</td>
                    <td className="px-4 py-2.5 capitalize">{invite.tier}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[invite.status]}`}
                      >
                        {invite.status}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {invite.invitedByName ?? '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {invite.redeemedByName ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {invite.status === 'pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void revoke(invite.id)}
                          className="text-muted-foreground hover:text-foreground text-xs underline disabled:opacity-50"
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
