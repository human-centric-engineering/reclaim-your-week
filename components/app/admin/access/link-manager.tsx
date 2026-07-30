'use client';

/**
 * Group invite links (F11) — mint one, show its QR, withdraw it.
 *
 * The sibling of `invite-manager.tsx` and deliberately a **separate tab** rather than a third mode on
 * the invite form: the two answer different questions. That form invites a named person; this one
 * opens a door for a room, and the fields (a label, a seat count, a number of days) have nothing in
 * common with a name and an email.
 *
 * The table renders entirely from one enriched `GET` (repo rule: no per-row fetches). The QR is a
 * plain `<img>` against the admin QR route, so the browser's own "save image" and print paths work
 * without this component knowing anything about image encoding.
 *
 * ## Why the QR is a dialog and not an open row
 *
 * It used to expand inside the first cell, which pushed every row below it down by the height of a
 * QR code and left the table impossible to scan while a code was open. A code is also the one thing
 * on this screen that gets *shown to a room* — it wants the whole screen's attention, not a corner of
 * a cell.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, QrCode } from 'lucide-react';
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
import {
  listInviteLinks,
  mintInviteLink,
  revokeInviteLink,
  type InviteLinkRow,
  type InviteLinkConfig,
} from '@/components/app/reclaim/access/actions';

const STATUS_STYLE: Record<InviteLinkRow['status'], string> = {
  live: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  full: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  expired: 'bg-muted text-muted-foreground',
  revoked: 'bg-muted text-muted-foreground',
};

/**
 * The URL a person actually visits. Built from the browser's own origin rather than from an env var
 * plumbed through to the client, so what Rashmir copies is always the host she is looking at.
 */
function joinUrl(token: string): string {
  if (typeof window === 'undefined') return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface LinkManagerProps {
  /** Reports the ledger's size so the tab strip can carry the count. */
  onCountChange?: (count: number) => void;
}

export function LinkManager({ onCountChange }: LinkManagerProps = {}) {
  const [links, setLinks] = useState<InviteLinkRow[] | null>(null);
  const [config, setConfig] = useState<InviteLinkConfig | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [label, setLabel] = useState('');
  const [maxClaims, setMaxClaims] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showQrFor, setShowQrFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listInviteLinks();
      setLinks(result.links);
      setConfig(result.config);
      // Prefill from the server's own defaults, but never overwrite something already typed.
      setMaxClaims((current) =>
        current === '' ? String(result.config.joinLinkDefaultMaxClaims) : current
      );
      setExpiryDays((current) =>
        current === '' ? String(result.config.joinLinkDefaultDays) : current
      );
      setLoadFailed(false);
    } catch {
      // Gate the render on the load (F7's lesson): an empty table after a failed fetch reads as
      // "no links exist", which is the opposite of the truth.
      setLinks(null);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (links !== null) onCountChange?.(links.length);
  }, [links, onCountChange]);

  const mint = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const link = await mintInviteLink({
        label,
        maxClaims: Number.parseInt(maxClaims, 10),
        expiryDays: Number.parseInt(expiryDays, 10),
      });
      setNotice('Link created. Copy it, or show the code for people to scan.');
      setLabel('');
      setFormOpen(false);
      // Open the new link's code straight away — minting one is almost always followed by showing it.
      setShowQrFor(link.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await revokeInviteLink(id);
      setNotice('Link withdrawn. Invitations already claimed through it still work.');
      if (showQrFor === id) setShowQrFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link could not be withdrawn.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: InviteLinkRow) => {
    try {
      await navigator.clipboard.writeText(joinUrl(link.token));
      setCopied(link.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('The link could not be copied. Select the address and copy it by hand.');
    }
  };

  const parsedMax = Number.parseInt(maxClaims, 10);
  const parsedDays = Number.parseInt(expiryDays, 10);
  const canMint =
    label.trim().length > 0 &&
    Number.isInteger(parsedMax) &&
    parsedMax > 0 &&
    Number.isInteger(parsedDays) &&
    parsedDays > 0 &&
    !busy;

  const qrLink = links?.find((link) => link.id === showQrFor) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground max-w-xl text-sm">
          One link, shared with a room or a team. Everyone who opens it adds their own name and
          email, and each gets the same standard invitation as one you send by hand.
        </p>
        <Button className="ml-auto" onClick={() => setFormOpen(true)}>
          <Plus aria-hidden="true" />
          Create link
        </Button>
      </div>

      {(notice !== null || error !== null) && !formOpen && (
        <div
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-4',
            error !== null ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'
          )}
        >
          <p className={cn('text-sm', error !== null ? 'text-destructive' : 'text-foreground')}>
            {error ?? notice}
          </p>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setError(null);
            }}
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            Hide
          </button>
        </div>
      )}

      {loadFailed && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          The links could not be loaded. Refresh to try again.
        </p>
      )}
      {links === null && !loadFailed && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Loading…
        </p>
      )}
      {links !== null && links.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No links yet</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            Create one for a room, a cohort or a team, then share the address or put the code on a
            slide.
          </p>
        </div>
      )}

      {links !== null && links.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4">What it is for</TableHead>
                <TableHead className="px-4">Claimed</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Open until</TableHead>
                <TableHead className="sr-only px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="px-4 py-3 font-medium">{link.label}</TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="tabular-nums">
                      {link.claimCount} of {link.maxClaims}
                    </span>
                    {/* The seat count as a shape as well as a number: how full the room is, at a
                        glance, down a column of them. */}
                    <span
                      aria-hidden="true"
                      className="bg-muted mt-1.5 block h-1 w-16 overflow-hidden rounded-full"
                    >
                      <span
                        className="bg-foreground/40 block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round((link.claimCount / Math.max(1, link.maxClaims)) * 100))}%`,
                        }}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLE[link.status]
                      )}
                    >
                      {link.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3">
                    {formatDate(link.expiresAt)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => void copy(link)}
                        className="text-muted-foreground hover:text-foreground text-xs underline"
                      >
                        {copied === link.id ? 'Copied' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQrFor(link.id)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline"
                      >
                        <QrCode aria-hidden="true" className="h-3 w-3" />
                        Show code
                      </button>
                      {link.status === 'live' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void withdraw(link.id)}
                          className="text-muted-foreground hover:text-foreground text-xs underline disabled:opacity-50"
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
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
            <DialogTitle>Invite a group by link</DialogTitle>
            <DialogDescription>
              Everyone who opens it adds their own name and email, and each gets the same standard
              invitation as one you send by hand.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canMint) void mint();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="link-label">What it is for</Label>
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Leadership offsite, March"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5">
                  <Label htmlFor="link-max">How many people</Label>
                  <FieldHelp title="How many people">
                    <p>
                      The link stops working once this many people have claimed it. Set it to the
                      size of the room.
                    </p>
                    <p className="mt-2">
                      A link is a door: anyone who has the address can use it, including someone it
                      was forwarded to. This number is what keeps that bounded.
                    </p>
                    {config !== null && (
                      <p className="mt-2">
                        The most a single link can be opened for is {config.joinLinkMaxClaims}.
                      </p>
                    )}
                  </FieldHelp>
                </span>
                <Input
                  id="link-max"
                  type="number"
                  min={1}
                  max={config?.joinLinkMaxClaims ?? 50}
                  value={maxClaims}
                  onChange={(e) => setMaxClaims(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5">
                  {/* The unit belongs in the label, not only in the popover: a bare "7" beside "Open
                      for" is ambiguous, and reading it as weeks or months is a link left open far
                      too long. */}
                  <Label htmlFor="link-days">Open for (days)</Label>
                  <FieldHelp title="How long it stays open">
                    <p>Counted from now. After that the link stops working.</p>
                    <p className="mt-2">
                      This is separate from the invitation itself. Someone who claims a seat on the
                      last day still gets the usual seven days to set up their account.
                    </p>
                  </FieldHelp>
                </span>
                <Input
                  id="link-days"
                  type="number"
                  min={1}
                  max={90}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                />
              </div>
            </div>

            {error !== null && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button type="submit" disabled={!canMint}>
                {busy ? 'Working…' : 'Create link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={qrLink !== null} onOpenChange={(open) => !open && setShowQrFor(null)}>
        <DialogContent className="sm:max-w-sm">
          {qrLink !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{qrLink.label}</DialogTitle>
                <DialogDescription>
                  Point a camera at this, or read the address out. Both go to the same place.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                {/*
                  A plain `<img>`, not `next/image`. The source is an SVG from our own admin route,
                  and the optimiser refuses SVG unless `dangerouslyAllowSVG` is turned on globally —
                  trading a genuine security setting for a lint rule about bandwidth on a 1KB vector
                  that only an admin ever loads.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/app/reclaim/invite-links/${qrLink.id}/qr`}
                  alt={`QR code for ${qrLink.label}`}
                  className="h-56 w-56 rounded-lg border bg-white p-3"
                />
                <p className="text-muted-foreground text-center text-xs break-all">
                  {joinUrl(qrLink.token)}
                </p>
              </div>
              <DialogFooter className="sm:justify-center">
                <Button variant="outline" size="sm" onClick={() => void copy(qrLink)}>
                  {copied === qrLink.id ? 'Copied' : 'Copy link'}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/api/v1/app/reclaim/invite-links/${qrLink.id}/qr?format=png`}
                    download={`${qrLink.label}.png`}
                  >
                    Download for a slide
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
