'use client';

/**
 * The preview screen (F19) — make a test account, drive it into a state, take it away again.
 *
 * ## What this screen is for
 *
 * Seeing the product as a leader sees it used to mean issuing an invitation and waiting for an email,
 * and locally it was impossible: with no mail provider configured the send is skipped and the link was
 * discarded. Two things fixed that. The Access screen now shows the invitation link itself, which is
 * how somebody walks the **real front door**. This screen is the other half: the states **behind** the
 * door, which otherwise need a full audit done by hand before the history, summary and share screens
 * have anything on them.
 *
 * ## Why creating an account here does not send an invitation
 *
 * It cannot. Account creation belongs to the platform and there is no hook at the moment an account
 * appears, so nothing could mark the resulting account as a test account, and it would count as a
 * client from its first minute. So the two paths are split by what each is good at, and **Mark an
 * existing account** is what makes the front-door walk safe afterwards.
 *
 * The table renders from one enriched `GET` (repo rule: no per-row fetches).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FieldHelp } from '@/components/ui/field-help';
import {
  listPreviewAccounts,
  createPreviewAccount,
  adoptPreviewAccount,
  fastForwardPreviewAccount,
  removePreviewAccount,
  type PreviewAccountRow,
  type PreviewCreated,
} from '@/components/app/admin/actions';

/**
 * `in_progress` reads as "In progress" rather than "Mid-audit" because an audit filled in *to the
 * summary* is in progress too — it stops before the finish button on purpose — and calling that
 * "Mid-audit" would point the operator at the wrong screen. Which phase it is on is not on this row:
 * the phase lives in the journey's node states, one read per run, and this list is one enriched query.
 */
const STATE_LABEL: Record<PreviewAccountRow['state'], string> = {
  none: 'Not started',
  in_progress: 'In progress',
  complete: 'Completed',
  abandoned: 'Abandoned',
};

const STATE_STYLE: Record<PreviewAccountRow['state'], string> = {
  none: 'bg-muted text-muted-foreground',
  in_progress: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  complete: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  abandoned: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PreviewManager() {
  const [accounts, setAccounts] = useState<PreviewAccountRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'fresh' | 'mid-audit' | 'summary'>('fresh');
  const [adoptEmail, setAdoptEmail] = useState('');
  const [adoptLabel, setAdoptLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The credential, held for exactly one render. Never re-fetched, because it is not stored anywhere.
  const [created, setCreated] = useState<PreviewCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await listPreviewAccounts());
      setLoadFailed(false);
    } catch {
      // Gate the render on the load (F7's lesson): an empty table after a failed fetch reads as "there
      // are no test accounts", which would send an operator off to make another one.
      setAccounts(null);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a mutation, keeping the notice/error handling in one place. */
  const run = async (action: () => Promise<string>, fallback: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setCreated(null);
    try {
      const result = await createPreviewAccount({
        label,
        ...(email.trim() === '' ? {} : { email: email.trim() }),
        state,
      });
      setCreated(result);
      setNotice(result.message);
      setLabel('');
      setEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That test account could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async () => {
    if (created === null) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('The password could not be copied. Select it and copy it by hand.');
    }
  };

  const canCreate = label.trim().length > 0 && !busy;
  const canAdopt = adoptEmail.trim().length > 3 && adoptLabel.trim().length > 0 && !busy;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Preview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Accounts for walking through the product yourself. They are left out of the published
          figures and never sent a quarterly reminder, and they are labelled wherever they appear on
          the other screens. To see the very first minutes a leader has, invite yourself on{' '}
          <Link href="/admin/programme/access" className="underline">
            Access
          </Link>{' '}
          and open the link it gives you, then mark that account below.
        </p>
      </header>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-lg font-medium">Create a test account</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <label htmlFor="preview-label">What it is for</label>
              <FieldHelp title="Why this needs a name">
                <p>
                  This is what shows on the badge next to the account on Clients and Shared results.
                  Somebody looking at that screen in three months, possibly you, needs to know why
                  the account exists without having to guess.
                </p>
                <p className="mt-2">Something like “checking the summary layout, 30 July”.</p>
              </FieldHelp>
            </span>
            <input
              id="preview-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Checking the summary layout"
            />
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <label htmlFor="preview-email">Email</label>
              <FieldHelp title="Which address to use">
                <p>
                  Leave this blank and we use a variation on your own address, so everything the
                  product would send a leader arrives in your inbox. Most mail providers deliver
                  anything with a <strong>+</strong> in it straight to you.
                </p>
                <p className="mt-2">
                  If you type an address instead, <strong>real product email goes to it</strong>: a
                  welcome message now, and a completion message if you finish an audit. Use one you
                  can open.
                </p>
              </FieldHelp>
            </span>
            <input
              id="preview-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="A variation on yours"
            />
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <label htmlFor="preview-state">Where it starts</label>
              <FieldHelp title="What each starting point gives you">
                <p>
                  <strong>Ready to begin</strong> signs in to the terms, then the start of an audit.
                  This is the one to use if you want to see what a leader actually does.
                </p>
                <p className="mt-2">
                  <strong>Mid-audit</strong> fills in the first phases and stops part way, so you
                  can look at the screens without answering everything first.
                </p>
                <p className="mt-2">
                  <strong>At the summary</strong> fills in the whole audit and stops on the last
                  screen, which is where the summary, the report and the sharing choices are.
                  Signing in as the account opens there.
                </p>
                <p className="mt-2">
                  It stops <em>before</em> &lsquo;finish my audit&rsquo;, deliberately. Finishing
                  moves the summary into the history read-back, takes the sharing choices away
                  entirely, and leaves the account back at the invitation to begin — so a test
                  account driven past that button cannot show you any of the three. Press it
                  yourself when you want to see what finishing does, including the email it sends.
                </p>
                <p className="mt-2">
                  The answers are made up, but everything is written the way the audit itself writes
                  it, so what you see is what a leader would see.
                </p>
              </FieldHelp>
            </span>
            <select
              id="preview-state"
              value={state}
              onChange={(e) => setState(e.target.value as 'fresh' | 'mid-audit' | 'summary')}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="fresh">Ready to begin</option>
              <option value="mid-audit">Mid-audit</option>
              <option value="summary">At the summary</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => void create()}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Create test account'}
          </button>
          {notice !== null && <p className="text-muted-foreground text-sm">{notice}</p>}
          {error !== null && <p className="text-destructive text-sm">{error}</p>}
        </div>

        {/*
          The sign-in details, shown once. The password is generated and never stored — there is no
          row it could be read back from — so the wording has to say so plainly, or the reasonable
          assumption is that it can be looked up again later.
        */}
        {created !== null && (
          <div className="bg-muted/40 mt-5 rounded-md border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Sign in as this account</h3>
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="text-muted-foreground hover:text-foreground text-xs underline"
              >
                Hide
              </button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Shown once. The password is not stored anywhere, so it cannot be shown again. Open{' '}
              <a href={created.signInUrl} className="underline" target="_blank" rel="noreferrer">
                the sign-in page
              </a>{' '}
              in a private window (e.g. open a browser window in &apos;incognito&apos; mode), so you
              stay signed in as yourself here.
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground w-20 text-xs uppercase">Email</dt>
                <dd className="min-w-0 flex-1">
                  <code className="bg-background block truncate rounded border px-2 py-1.5 text-xs">
                    {created.account.email}
                  </code>
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground w-20 text-xs uppercase">Password</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  <code className="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1.5 text-xs">
                    {created.password}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyPassword()}
                    className="border-input rounded-md border px-3 py-1.5 text-xs font-medium"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-lg font-medium">Mark an existing account as a test account</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          For an account you made yourself by opening an invitation link. Until it is marked, it
          counts as a client in every figure on the other screens.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="adopt-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="adopt-email"
              type="email"
              value={adoptEmail}
              onChange={(e) => setAdoptEmail(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="you+test1@yourdomain.org"
            />
          </div>
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <label htmlFor="adopt-label">What it is for</label>
              <FieldHelp title="Why this needs a name">
                <p>
                  The same as on a test account you create here: this is what shows on the badge
                  next to the account on Clients and Shared results, and it is the only thing on
                  those screens that says why the account exists.
                </p>
                <p className="mt-2">
                  For an account you walked an invitation link with, something like “walked the
                  invitation link, 30 July” is enough.
                </p>
              </FieldHelp>
            </span>
            <input
              id="adopt-label"
              value={adoptLabel}
              onChange={(e) => setAdoptLabel(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Walked the invitation link, 30 July"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!canAdopt}
          onClick={() =>
            void run(async () => {
              const message = await adoptPreviewAccount({
                email: adoptEmail.trim().toLowerCase(),
                label: adoptLabel,
              });
              setAdoptEmail('');
              setAdoptLabel('');
              return message;
            }, 'That account could not be marked.')
          }
          className="border-input mt-5 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Mark as a test account
        </button>
      </section>

      <section>
        <h2 className="text-lg font-medium">Test accounts</h2>
        {loadFailed && (
          <p className="text-muted-foreground mt-3 text-sm">
            The test accounts could not be loaded. Refresh to try again.
          </p>
        )}
        {accounts === null && !loadFailed && (
          <p className="text-muted-foreground mt-3 text-sm">Loading…</p>
        )}
        {accounts !== null && accounts.length === 0 && (
          <p className="text-muted-foreground mt-3 text-sm">No test accounts yet.</p>
        )}
        {accounts !== null && accounts.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">What it is for</th>
                  <th className="px-4 py-2.5 font-medium">Audit</th>
                  <th className="px-4 py-2.5 font-medium">Made by</th>
                  <th className="px-4 py-2.5 font-medium">Made</th>
                  {/*
                    Visible, and named for what the two buttons underneath write. It used to be
                    `sr-only`, which left the two controls reading as `Mid-audit` next to a badge
                    also reading `Mid-audit` — the same word twice in one row, once as a state and
                    once as a command, with nothing to say which was which.
                  */}
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="flex items-center justify-end gap-1.5">
                      Fill in an audit
                      <FieldHelp title="What these three do">
                        <p>
                          <strong>Fill in mid-audit</strong> and{' '}
                          <strong>Fill in to the summary</strong> write a whole audit for this
                          account: made-up answers, put through the same engine a leader&rsquo;s own
                          answers go through, stopping part way or on the last screen.
                        </p>
                        <p className="mt-2">
                          Each one starts a <strong>new</strong> audit rather than moving the one
                          already there, and the badge in the Audit column is whichever is most
                          recent. So an account already showing <strong>In progress</strong> has to
                          be finished or let go first, from the account itself.
                        </p>
                        <p className="mt-2">
                          <strong>Fill in to the summary</strong> is the way to reach the summary,
                          the report and the sharing choices — all three live on the last screen,
                          before &lsquo;finish my audit&rsquo;. Neither button presses that:
                          finishing is what sends the <strong>completion email</strong> to the
                          address in the first column, and it should be your decision to send it.
                        </p>
                        <p className="mt-2">
                          <strong>Remove</strong> erases the account and everything it built up.
                        </p>
                      </FieldHelp>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.userId} className="border-t">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/programme/clients/${account.userId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {account.email}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">{account.label}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[account.state]}`}
                      >
                        {STATE_LABEL[account.state]}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {account.createdByName ?? '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {formatDate(account.createdAt)}
                    </td>
                    {/*
                      Verb-first labels, and bordered rather than underlined. Both changes are the
                      same point: these two write a whole audit into an account, so they must not
                      look like, or read like, somewhere to click through to.
                    */}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => fastForwardPreviewAccount(account.userId, { to: 'mid-audit' }),
                            'That account could not be advanced.'
                          )
                        }
                        className="border-input hover:bg-muted rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        Fill in mid-audit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => fastForwardPreviewAccount(account.userId, { to: 'summary' }),
                            'That account could not be advanced.'
                          )
                        }
                        className="border-input hover:bg-muted ml-2 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        Fill in to the summary
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => removePreviewAccount(account.userId),
                            'That test account could not be removed.'
                          )
                        }
                        className="text-destructive ml-3 text-xs underline underline-offset-2 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted-foreground mt-3 text-xs">
          One thing these accounts do still affect: the framework&rsquo;s own map and module pages
          under Framework count their journeys, and there is no way to leave them out from here.
        </p>
      </section>
    </div>
  );
}
