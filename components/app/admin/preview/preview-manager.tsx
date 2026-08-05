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
import { RECLAIM_PHASES } from '@/lib/app/programme/map';
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
 * Where a fabricated audit stops: `fresh` for no audit at all, otherwise a phase key of the map.
 *
 * One value rather than the old `state` plus a separate phase, because to an operator they are one
 * question with eight answers. The three-state control this replaces could only ever offer two of the
 * seven screens, and its "Mid-audit" always meant phase 4 — the API had accepted a phase since the
 * feature shipped and nothing on the screen ever sent one.
 */
type PreviewTarget = string;

const LAST_PHASE_KEY = RECLAIM_PHASES[RECLAIM_PHASES.length - 1]?.key ?? 'phase-6-summary';

/**
 * The choices, in the order a leader meets them.
 *
 * Built from the map rather than typed out, so a phase added or renamed upstream appears here without
 * anybody remembering to come and add it. The two ends are worded for what they *are* to the operator
 * rather than by phase number: nobody wants "phase 6", they want the summary.
 */
const TARGET_OPTIONS: { value: PreviewTarget; label: string }[] = [
  { value: 'fresh', label: 'Ready to begin (no audit yet)' },
  ...RECLAIM_PHASES.map((phase, index) => ({
    value: String(phase.key),
    label:
      phase.key === LAST_PHASE_KEY
        ? `At the summary (phase ${index})`
        : `Sitting at ${phase.label.toLowerCase()} (phase ${index})`,
  })),
];

/**
 * Turn one chosen target into the request body the API takes.
 *
 * The API kept its `to` / `toPhase` pair, so this is where the screen's one question is translated
 * back into it. `summary` is not simply "phase 6": it is the target that writes the report agent's reading,
 * so the last phase has to be sent under that name and not as a `toPhase`.
 */
function targetToRequest(target: PreviewTarget): { to: 'mid-audit' | 'summary'; toPhase?: string } {
  if (target === LAST_PHASE_KEY) return { to: 'summary' };
  return { to: 'mid-audit', toPhase: target };
}

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
  const [target, setTarget] = useState<PreviewTarget>('fresh');
  /**
   * The phase each existing row is about to be filled in to, keyed by account.
   *
   * Per row rather than one shared value because an operator working through a list is comparing
   * screens: filling one account in to phase 2 and the next to phase 5 is the whole point, and a
   * single selector would silently reset between them.
   */
  const [rowTargets, setRowTargets] = useState<Record<string, PreviewTarget>>({});
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
      const fill = target === 'fresh' ? null : targetToRequest(target);
      const result = await createPreviewAccount({
        label,
        ...(email.trim() === '' ? {} : { email: email.trim() }),
        state: fill === null ? 'fresh' : fill.to,
        ...(fill?.toPhase === undefined ? {} : { toPhase: fill.toPhase }),
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
                  Every other choice is a <strong>phase to stop at</strong>. The account is filled
                  in as far as that phase and left sitting on it, holding exactly what a leader who
                  had got that far would hold and nothing from later on. Pick the screen you want to
                  look at.
                </p>
                <p className="mt-2">
                  <strong>At the summary</strong> is the last of them, and it is where the summary,
                  the report and the sharing choices live. It stops <em>before</em> &lsquo;finish my
                  audit&rsquo;, deliberately. Finishing moves the summary into the history
                  read-back, takes the sharing choices away entirely, and leaves the account back at
                  the invitation to begin, so a test account driven past that button cannot show you
                  any of the three. Press it yourself when you want to see what finishing does,
                  including the email it sends.
                </p>
                <p className="mt-2">
                  The answers are made up, but everything is written the way the audit itself writes
                  it, so what you see is what a leader would see. That now includes the
                  conversation: the coach and the leader both have turns, made up in the same way,
                  and marked as made up wherever anybody reads them back.
                </p>
                <p className="mt-2">
                  Two things a filled-in account does <em>not</em> have. It never takes the calendar
                  upload, so the perception-versus-reality chart stays empty, because a fabricator
                  that always uploaded could not show you the path a leader who declines it walks.
                  And nothing here presses share, so the sharing choices are untouched when you get
                  there.
                </p>
              </FieldHelp>
            </span>
            <select
              id="preview-state"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
                    Visible, and named for what the control underneath writes. It used to be
                    `sr-only`, which left the controls reading as `Mid-audit` next to a badge also
                    reading `Mid-audit` — the same word twice in one row, once as a state and once
                    as a command, with nothing to say which was which.
                  */}
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="flex items-center justify-end gap-1.5">
                      Fill in an audit
                      <FieldHelp title="What these do">
                        <p>
                          Pick a <strong>phase</strong> and press <strong>Fill in</strong>. It
                          writes a whole audit for this account as far as that phase: made-up
                          answers and a made-up conversation, both put through the same engine a
                          leader&rsquo;s own answers go through, and it leaves the account sitting
                          there.
                        </p>
                        <p className="mt-2">
                          Each one starts a <strong>new</strong> audit rather than moving the one
                          already there, and the badge in the Audit column is whichever is most
                          recent. So an account already showing <strong>In progress</strong> has to
                          be finished or let go first, from the account itself.
                        </p>
                        <p className="mt-2">
                          <strong>At the summary</strong> is how you reach the summary, the report
                          and the sharing choices, which all live on the last screen, before
                          &lsquo;finish my audit&rsquo;. Nothing here presses that: finishing is
                          what sends the <strong>completion email</strong> to the address in the
                          first column, and it should be your decision to send it.
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
                      A verb-first label, and bordered rather than underlined. Both are the same
                      point: this writes a whole audit into an account, so it must not look like, or
                      read like, somewhere to click through to. The phase sits beside it rather than
                      inside a menu of buttons, because there are seven of them now.
                    */}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <label className="sr-only" htmlFor={`fill-phase-${account.userId}`}>
                        How far to fill in {account.email}
                      </label>
                      <select
                        id={`fill-phase-${account.userId}`}
                        disabled={busy}
                        value={rowTargets[account.userId] ?? LAST_PHASE_KEY}
                        onChange={(e) =>
                          setRowTargets((current) => ({
                            ...current,
                            [account.userId]: e.target.value,
                          }))
                        }
                        className="border-input bg-background rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {/*
                          `fresh` is absent on purpose. It is a thing an account can be *created* as,
                          not a thing this button could do to one: there is no fabrication that
                          removes an audit, and offering it here would promise an undo that does not
                          exist. Use Remove and make another.
                        */}
                        {TARGET_OPTIONS.filter((option) => option.value !== 'fresh').map(
                          (option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          )
                        )}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              fastForwardPreviewAccount(
                                account.userId,
                                targetToRequest(rowTargets[account.userId] ?? LAST_PHASE_KEY)
                              ),
                            'That account could not be advanced.'
                          )
                        }
                        className="border-input hover:bg-muted ml-2 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        Fill in
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
