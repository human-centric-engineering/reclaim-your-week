/**
 * Summary PDF render helper (F15 t-1).
 *
 * The one place `renderToBuffer` is called. Node-only — the route pins `runtime = 'nodejs'` — which
 * is why it sits here beside the route rather than in `lib/app/programme/**`, where everything else
 * is edge-safe and framework-agnostic. Same split `~/code/conquest` uses.
 */

import { renderToBuffer } from '@react-pdf/renderer';

import { SummaryPdfDocument } from '@/components/app/reclaim/report/summary-pdf-document';
import type { AuditSummary } from '@/lib/app/programme/summary';

/** Render a built summary to a PDF byte buffer. Takes the summary, never a run id: the document and
 *  the screen must be driven from one `buildSummary` call so they cannot disagree about a figure. */
export async function renderSummaryPdf(summary: AuditSummary): Promise<Buffer> {
  return renderToBuffer(<SummaryPdfDocument summary={summary} />);
}
