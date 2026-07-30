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
 *
 * ## Why the form is behind a button
 *
 * This tab is a **ledger with a toolbar**, not a form with a ledger underneath. The form is a fixed
 * cost paid on every visit; the ledger grows without limit, and an operator opening this screen is
 * almost always here to read it rather than to add to it. So the form lives in a dialog, and the
 * first thing on screen is the list plus the two controls that make a long list navigable — a search
 * box and a status filter.
 *
 * ## Why five columns and not eight
 *
 * Nothing was dropped; three pairs were merged, because each pair is one fact read together.
 * Delivery ("did the email arrive") sits under the invitation's own status, since a *pending* invite
 * whose mail *failed* is a single sentence about one row. Provenance — claimed through a group link,
 * or referred by a participant — is one "Source" cell. Two columns headed "Email" meant two different
 * things and that is now impossible to read wrongly.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FieldHelp } from '@/components/ui/field-help';
import { cn } from '@/lib/utils';
import { RECLAIM_INVITE_TIERS } from '@/lib/app/programme/access/tiers';
import {
  listInvites,
  issueInvite,
  revokeInvite,
  grantAnotherAudit,
  type InviteRow,
} from '@/components/app/reclaim/access/actions';

const TIER_LABEL: Record<string, string> = {
  standard: 'Standard — one complete audit',
  client: 'Client — repeat audits for 12 months',
  referral: 'Referral — one complete audit',
  free: 'Free — one complete audit',
};

/**
 * How the invitation email went. `disabled` (no mail provider configured) is worded separately from
 * `failed` (the provider refused) because they ask different things of her: one is a deployment
 * setting somebody needs to fix, the other is an incident that may already be over.
 */
const EMAIL_LABEL: Record<string, string> = {
  sent: 'sent',
  failed: 'failed',
  disabled: 'not configured',
  pending: 'already pending',
};

/** Only the two that need doing something about are coloured; a clean send stays quiet. */
const EMAIL_TONE: Record<string, string> = {
  sent: 'text-muted-foreground',
  failed: 'text-destructive font-medium',
  disabled: 'text-amber-700 font-medium dark:text-amber-400',
  pending: 'text-muted-foreground',
};

const STATUS_STYLE: Record<InviteRow['status'], string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  redeemed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  revoked: 'bg-muted text-muted-foreground',
};

const STATUS_FILTERS = ['all', 'pending', 'redeemed', 'revoked'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: 'All statuses',
  pending: 'Pending',
  redeemed: 'Redeemed',
  revoked: 'Withdrawn',
};

/** The one place the native selects on this screen borrow the `Input` shape from. */
const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export interface InviteManagerProps {
  /** Reports the ledger's size so the tab strip can carry the count. */
  onCountChange?: (count: number) => void;
}

export function InviteManager({ onCountChange }: InviteManagerProps = {}) {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState<string>('standard');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // The link just issued. Held in state and never re-fetched, because the server keeps only its hash:
  // once this is cleared it is gone, and re-sending is the only way to produce another.
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setInvites(await listInvites());
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

  useEffect(() => {
    if (invites !== null) onCountChange?.(invites.length);
  }, [invites, onCountChange]);

  const issue = async (resend: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setIssuedUrl(null);
    try {
      const { message, invitationUrl } = await issueInvite({ name, email, tier, resend });
      setNotice(message);
      setIssuedUrl(invitationUrl);
      // Keep the fields — and the dialog — when nothing was actually sent, so the operator can hit
      // re-send without retyping the address they just entered. Re-send is a button in this dialog,
      // so closing it would put the only remedy one click further away than the problem.
      if (!message.startsWith('An invitation is already pending')) {
        setEmail('');
        setName('');
        setFormOpen(false);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The invitation could not be issued.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (issuedUrl === null) return;
    try {
      await navigator.clipboard.writeText(issuedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('The link could not be copied. Select the address and copy it by hand.');
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    // Withdrawing deletes the token, so any link still on screen is dead. Clear it rather than leave
    // a copy button that hands over an address which now refuses everyone.
    setIssuedUrl(null);
    try {
      await revokeInvite(id);
      setNotice('Invitation withdrawn.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That invitation could not be withdrawn.');
    } finally {
      setBusy(false);
    }
  };

  const regrant = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await grantAnotherAudit({ email: email.trim().toLowerCase(), tier }));
      setEmail('');
      setName('');
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That audit could not be granted.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 3 && name.trim().length > 0 && !busy;
  // A re-grant needs no name — it acts on an account that already exists.
  const canRegrant = email.trim().length > 3 && !busy;

  const filtered = useMemo(() => {
    if (invites === null) return [];
    const q = query.trim().toLowerCase();
    return invites.filter((invite) => {
      if (statusFilter !== 'all' && invite.status !== statusFilter) return false;
      if (q === '') return true;
      return [invite.email, invite.redeemedByName, invite.invitedByName, invite.viaLinkLabel].some(
        (field) => field !== null && field !== undefined && field.toLowerCase().includes(q)
      );
    });
  }, [invites, query, statusFilter]);

  const filtering = query.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* Toolbar: what makes a long ledger navigable, plus the one way to add to it. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search invitations"
            placeholder="Search by email, name or link"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
          className={cn(SELECT_CLASS, 'w-auto')}
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {STATUS_FILTER_LABEL[value]}
            </option>
          ))}
        </select>
        {invites !== null && filtering && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {filtered.length} of {invites.length}
          </p>
        )}
        <Button className="ml-auto" onClick={() => setFormOpen(true)}>
          <UserPlus aria-hidden="true" />
          Invite someone
        </Button>
      </div>

      {/*
        What just happened, and — when there is one — the link the email carries.

        Here for two jobs. It lets her deliver an invitation by hand when the email did not arrive —
        the "failed" and "not configured" cases the table already makes visible, which until now she
        could see and do nothing about. And it is how anyone tests the product without an inbox:
        invite yourself at a plus-address, open this link, and you are walking the same first minutes
        a leader walks.

        Shown once and not recoverable, because the server stores only the hash. The wording has to
        say so, or the reasonable assumption is that it can be looked up again later.
      */}
      {(notice !== null || error !== null) && !formOpen && (
        <div
          className={cn(
            'rounded-lg border p-4',
            error !== null && 'border-destructive/40 bg-destructive/5',
            // A link that exists for this one render earns more than a grey box: dismissing it by
            // accident is unrecoverable, and nothing else on the screen is.
            error === null &&
              issuedUrl !== null &&
              'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
            error === null && issuedUrl === null && 'bg-muted/40'
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={cn('text-sm', error !== null ? 'text-destructive' : 'text-foreground')}>
              {error ?? notice}
            </p>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setError(null);
                setIssuedUrl(null);
              }}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              Hide
            </button>
          </div>
          {issuedUrl !== null && (
            <div className="mt-3">
              <p className="text-muted-foreground text-xs">
                The invitation link, shown once. Only a fingerprint of it is kept, so it cannot be
                shown again — to get another, re-send with a new link. It expires in seven days and
                works a single time.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1.5 text-xs">
                  {issuedUrl}
                </code>
                <Button size="sm" variant="outline" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {loadFailed && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          The invitation list could not be loaded. Refresh to try again.
        </p>
      )}
      {invites === null && !loadFailed && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Loading…
        </p>
      )}
      {invites !== null && invites.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No invitations yet</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            An account with no invitation cannot start an audit. Invite the first person to open the
            programme.
          </p>
        </div>
      )}
      {invites !== null && invites.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">No invitation matches that search.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setQuery('');
              setStatusFilter('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4">Invitee</TableHead>
                <TableHead className="px-4">Tier</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Source</TableHead>
                <TableHead className="px-4">Redeemed by</TableHead>
                <TableHead className="sr-only px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((invite) => (
                <TableRow key={invite.id} className="align-top">
                  <TableCell className="px-4 py-3 font-medium">{invite.email}</TableCell>
                  <TableCell className="px-4 py-3 capitalize">{invite.tier}</TableCell>
                  {/*
                    The invitation's own status, and under it whether it actually reached them. A
                    failed send does not cost someone their invitation, which is right, and is exactly
                    why it has to be visible here: otherwise the row looks identical to one that
                    arrived.
                  */}
                  <TableCell className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLE[invite.status]
                      )}
                    >
                      {invite.status}
                    </span>
                    {invite.emailStatus !== null && (
                      <span className="mt-1.5 flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Email</span>
                        <span className={EMAIL_TONE[invite.emailStatus] ?? 'text-muted-foreground'}>
                          {EMAIL_LABEL[invite.emailStatus] ?? invite.emailStatus}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  {/* Where the invitation came from: a group link she opened, a participant's
                      referral, or her own hand. */}
                  <TableCell className="px-4 py-3 text-sm">
                    {invite.viaLinkLabel !== null && (
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground text-xs">Link</span>
                        {invite.viaLinkLabel}
                      </span>
                    )}
                    {invite.invitedByName !== null && (
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground text-xs">Referred by</span>
                        {invite.invitedByName}
                      </span>
                    )}
                    {invite.viaLinkLabel === null && invite.invitedByName === null && (
                      <span className="text-muted-foreground">Direct</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3">
                    {invite.redeemedByName ?? '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              Issuing or re-sending shows you the link itself, so you can pass it on by hand if the
              email does not arrive.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) void issue(false);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">First name</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya@example.org"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5">
                <Label htmlFor="invite-tier">Tier</Label>
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
                    one audit, and earns the person who sent it a second one once the invitee
                    finishes theirs.
                  </p>
                </FieldHelp>
              </span>
              <select
                id="invite-tier"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className={SELECT_CLASS}
              >
                {RECLAIM_INVITE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
            </div>

            {notice !== null && <p className="text-muted-foreground text-sm">{notice}</p>}
            {error !== null && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!canSubmit}
                onClick={() => void issue(true)}
              >
                Re-send with a new link
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {busy ? 'Working…' : 'Send invitation'}
              </Button>
            </DialogFooter>
          </form>

          {/*
            The third path, kept apart from the two above it because it acts on an account that
            already exists and therefore needs no name. Sitting it in the same button row as
            "Send invitation" is what made the old card read as three equal choices.
          */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium">Already has an account?</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Someone who has used the audit their invitation included can be given another. Their
              email alone is enough.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={!canRegrant}
              onClick={() => void regrant()}
            >
              Give another audit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
