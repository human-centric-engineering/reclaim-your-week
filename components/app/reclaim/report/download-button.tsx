'use client';

/**
 * A download that says what it is doing.
 *
 * ## Why this is not the plain anchor it replaces
 *
 * `DownloadReport` used to be `<a href download>`, and the argument for it was good: the browser
 * already knows how to download a file, it streams, it survives a leader with JavaScript still
 * loading, and wrapping it in `fetch` buys a spinner and costs all of that.
 *
 * What that argument missed is what the leader sees. The report is **rendered on request** — a
 * server-side `@react-pdf/renderer` pass over a document that can run to several pages — so there is
 * a real pause between the click and the file. A plain anchor spends that pause looking like a link
 * that did not work, and a failed request lands as either nothing at all or a file called
 * `report.pdf` containing a JSON error. "The download button doesn't do anything" is what that looks
 * like from the outside, and it is indistinguishable from a broken route.
 *
 * So: `fetch` to a blob, an explicit `busy` state while it renders, and a plain sentence when it
 * fails. The trade is real and it is taken deliberately — this control needs JavaScript, and the
 * whole screen it lives on is a client component behind a session already.
 *
 * **The filename still comes from the server.** `Content-Disposition` names the file (with the
 * leader's own name and the date in it), so it is read off the response rather than guessed here.
 * Two places naming one file is how you end up with a document that does not know whose it is.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking synchronously after
 * `click()` races the browser's own read of it in Safari, and the cost of waiting is one frame.
 */

import { useCallback, useState } from 'react';
import { Download } from 'lucide-react';

/** Pull the server's filename out of `Content-Disposition`, or fall back to a sensible one. */
function filenameFrom(header: string | null, fallback: string): string {
  if (header === null) return fallback;
  const quoted = /filename="([^"]+)"/.exec(header);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename=([^;]+)/.exec(header);
  return bare?.[1]?.trim() || fallback;
}

export interface DownloadButtonProps {
  /** The endpoint to fetch. Must answer with a `Content-Disposition` filename. */
  href: string;
  /** The name to save under if the server does not give one. */
  fallbackFilename: string;
  children: React.ReactNode;
  /** What it is doing while it waits. Defaults to the wording most of these want. */
  busyLabel?: string;
  /** `primary` is the report itself; everything else is `quiet`. */
  tone?: 'primary' | 'quiet';
}

export function DownloadButton({
  href,
  fallbackFilename,
  children,
  busyLabel = 'Preparing…',
  tone = 'quiet',
}: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get('content-disposition'), fallbackFilename);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [href, fallbackFilename]);

  return (
    <span className="inline-flex flex-col gap-1 print:hidden">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className={
          tone === 'primary'
            ? 'bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60'
            : 'border-border text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm transition-colors disabled:opacity-60'
        }
      >
        <Download aria-hidden className="h-4 w-4" />
        {busy ? busyLabel : children}
      </button>
      {failed && (
        <span className="text-muted-foreground text-xs" role="status">
          That did not download. You can try again.
        </span>
      )}
    </span>
  );
}
