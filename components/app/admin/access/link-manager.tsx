'use client';

/**
 * Group invite links (F11) — mint one, show its QR, withdraw it.
 *
 * The sibling of `invite-manager.tsx` and deliberately a **separate card** rather than a third mode
 * on the invite form: the two answer different questions. That form invites a named person; this one
 * opens a door for a room, and the fields (a label, a seat count, a number of days) have nothing in
 * common with a name and an email.
 *
 * The table renders entirely from one enriched `GET` (repo rule: no per-row fetches). The QR is a
 * plain `<img>` against the admin QR route, so the browser's own "save image" and print paths work
 * without this component knowing anything about image encoding.
 */

import { useCallback, useEffect, useState } from 'react';
import { FieldHelp } from '@/components/ui/field-help';
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

export function LinkManager() {
  const [links, setLinks] = useState<InviteLinkRow[] | null>(null);
  const [config, setConfig] = useState<InviteLinkConfig | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [label, setLabel] = useState('');
  const [maxClaims, setMaxClaims] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <section className="bg-card rounded-lg border p-5">
      <h2 className="text-lg font-medium">Invite a group by link</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        One link, shared with a room or a team. Everyone who opens it adds their own name and email,
        and each gets the same standard invitation as one you send by hand.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="link-label" className="text-sm font-medium">
            What it is for
          </label>
          <input
            id="link-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Leadership offsite, March"
          />
        </div>
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <label htmlFor="link-max">How many people</label>
            <FieldHelp title="How many people">
              <p>
                The link stops working once this many people have claimed it. Set it to the size of
                the room.
              </p>
              <p className="mt-2">
                A link is a door: anyone who has the address can use it, including someone it was
                forwarded to. This number is what keeps that bounded.
              </p>
              {config !== null && (
                <p className="mt-2">
                  The most a single link can be opened for is {config.joinLinkMaxClaims}.
                </p>
              )}
            </FieldHelp>
          </span>
          <input
            id="link-max"
            type="number"
            min={1}
            max={config?.joinLinkMaxClaims ?? 50}
            value={maxClaims}
            onChange={(e) => setMaxClaims(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {/* The unit belongs in the label, not only in the popover: a bare "7" beside "Open for"
                is ambiguous, and reading it as weeks or months is a link left open far too long. */}
            <label htmlFor="link-days">Open for (days)</label>
            <FieldHelp title="How long it stays open">
              <p>Counted from now. After that the link stops working.</p>
              <p className="mt-2">
                This is separate from the invitation itself. Someone who claims a seat on the last
                day still gets the usual seven days to set up their account.
              </p>
            </FieldHelp>
          </span>
          <input
            id="link-days"
            type="number"
            min={1}
            max={90}
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canMint}
          onClick={() => void mint()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Create link'}
        </button>
        {notice !== null && <p className="text-muted-foreground text-sm">{notice}</p>}
        {error !== null && <p className="text-destructive text-sm">{error}</p>}
      </div>

      {loadFailed && (
        <p className="text-muted-foreground mt-5 text-sm">
          The links could not be loaded. Refresh to try again.
        </p>
      )}
      {links !== null && links.length === 0 && (
        <p className="text-muted-foreground mt-5 text-sm">No links yet.</p>
      )}

      {links !== null && links.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">What it is for</th>
                <th className="px-4 py-2.5 font-medium">Claimed</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Open until</th>
                <th className="sr-only px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-t align-top">
                  <td className="px-4 py-2.5">
                    {link.label}
                    {showQrFor === link.id && (
                      <div className="mt-3 space-y-2">
                        {/*
                          A plain `<img>`, not `next/image`. The source is an SVG from our own admin
                          route, and the optimiser refuses SVG unless `dangerouslyAllowSVG` is turned
                          on globally — trading a genuine security setting for a lint rule about
                          bandwidth on a 1KB vector that only an admin ever loads.
                        */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/v1/app/reclaim/invite-links/${link.id}/qr`}
                          alt={`QR code for ${link.label}`}
                          className="h-44 w-44 rounded border bg-white p-2"
                        />
                        <p className="text-muted-foreground text-xs break-all">
                          {joinUrl(link.token)}
                        </p>
                        <a
                          href={`/api/v1/app/reclaim/invite-links/${link.id}/qr?format=png`}
                          download={`${link.label}.png`}
                          className="text-muted-foreground hover:text-foreground text-xs underline"
                        >
                          Download for a slide
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {link.claimCount} of {link.maxClaims}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[link.status]}`}
                    >
                      {link.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5">
                    {formatDate(link.expiresAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => void copy(link)}
                        className="text-muted-foreground hover:text-foreground text-xs underline"
                      >
                        {copied === link.id ? 'Copied' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQrFor(showQrFor === link.id ? null : link.id)}
                        className="text-muted-foreground hover:text-foreground text-xs underline"
                      >
                        {showQrFor === link.id ? 'Hide code' : 'Show code'}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
