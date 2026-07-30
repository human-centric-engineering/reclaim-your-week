/**
 * The PDF download response (F15 t-1).
 *
 * Wraps a rendered buffer with the content type, an `attachment` disposition and a safe filename.
 * `no-store` because a summary reflects the run at request time: the analyst's sections can appear
 * on a later read than an earlier one, and a cached copy would show a leader an artifact they have
 * already seen superseded.
 */

import type { AuditSummary } from '@/lib/app/programme/summary';

/**
 * A filename a leader can find again on their desktop.
 *
 * Their own first name where the audit captured one, and the date they downloaded it — not the run
 * id, which means nothing to them, and not the period ("last quarter"), which does not survive
 * contact with a filesystem. Two downloads on the same day overwrite each other, which is the
 * behaviour anyone expects from re-downloading the same document.
 *
 * `slugify` is deliberately local rather than imported: the only one in the tree lives in the
 * knowledge chunker, and a report route reaching into core's document pipeline for four lines of
 * string handling is coupling nobody would choose twice.
 */
function filenameFor(summary: AuditSummary, on: Date): string {
  const who = (summary.firstName ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // Strip anything that is not a letter, a digit or a separator, then collapse the separators.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = on.toISOString().slice(0, 10);
  return ['time-audit', who, day].filter(Boolean).join('-') + '.pdf';
}

/** Build the download response for a rendered summary PDF. */
export function summaryPdfResponse(
  buffer: Buffer,
  summary: AuditSummary,
  on: Date = new Date()
): Response {
  // Buffer → a fresh Uint8Array so the BodyInit is a plain ArrayBuffer view, avoiding the
  // SharedArrayBuffer-typed overload Node's Buffer surfaces under some TS lib configurations.
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameFor(summary, on)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
