/**
 * Transcript PDF render helper.
 *
 * The twin of `render-summary-pdf.tsx`, and here for the same reason: `renderToBuffer` is Node-only,
 * the route pins `runtime = 'nodejs'`, and everything under `lib/app/programme/**` stays edge-safe
 * and framework-agnostic.
 */

import { renderToBuffer } from '@react-pdf/renderer';

import { TranscriptPdfDocument } from '@/components/app/reclaim/report/transcript-pdf-document';
import type { OwnTranscript } from '@/lib/app/programme/runs/transcript';

/** Render a leader's own conversation to a PDF byte buffer. */
export async function renderTranscriptPdf(transcript: OwnTranscript): Promise<Buffer> {
  return renderToBuffer(<TranscriptPdfDocument transcript={transcript} />);
}
