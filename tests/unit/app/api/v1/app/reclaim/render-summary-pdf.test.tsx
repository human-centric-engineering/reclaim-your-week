/**
 * Unit: the summary PDF render helper (F15 t-1).
 *
 * A **real** end-to-end render — the document through `@react-pdf/renderer`'s `renderToBuffer` —
 * asserting a genuine PDF comes out of every shape the summary can take.
 *
 * These are structural checks by design (no-throw, `%PDF` magic, non-empty), and that is the same
 * trade `~/code/conquest` makes for the same reason: react-pdf emits a binary buffer, and extracting
 * text from it would mean running the environment-sensitive pdfjs engine that this repository
 * deliberately mocks everywhere else. Content-level behaviour belongs at the pure layer — what the
 * summary contains is `summary.test.ts`'s job, and what the analyst may say is
 * `analyst-reading.test.ts`'s.
 *
 * **What this catches, and why it is worth a real render.** A react-pdf document throws on a style
 * property the renderer does not support, on a `flex` value it cannot resolve, and on a `render`
 * callback with the wrong signature — none of which type-check catches, because the props are typed
 * loosely enough to accept CSS that has no meaning in a PDF. The shapes below are the ones that
 * actually differ in layout: no analyst reading, a full one, no ideal column, no chosen action.
 *
 * Timeouts are per-test rather than global: a real render is slow, and raising the whole suite's
 * limit to accommodate four tests would hide a hang everywhere else.
 */

import { describe, it, expect } from 'vitest';

import { renderSummaryPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-summary-pdf';
import { summaryPdfResponse } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/pdf-response';
import type { AuditSummary } from '@/lib/app/programme/summary';
import type { ChartData } from '@/lib/app/programme/chart/series';

const RENDER_TIMEOUT = 20_000;

const chart: ChartData = {
  source: 'current',
  totalHours: 40,
  unallocated: [],
  buckets: [
    {
      token: 'deep_work',
      slug: 'deep-work',
      title: 'Deep work',
      hours: 4,
      percent: 10,
      lowPercent: 15,
      highPercent: 25,
      status: 'under',
    },
    {
      token: 'delivery_operations',
      slug: 'delivery-operations',
      title: 'Delivery and operations',
      hours: 22,
      percent: 55,
      lowPercent: 10,
      highPercent: 20,
      status: 'over',
    },
  ],
};

function summary(over: Partial<AuditSummary> = {}): AuditSummary {
  return {
    firstName: 'Sam',
    auditedOn: '2026-07-29T10:00:00.000Z',
    contactEmail: 'rashmir@rashmir.net',
    role: 'Chief Executive',
    orgType: 'A social enterprise',
    period: 'last quarter',
    priorities: 'Get the new programme funded',
    current: chart,
    rows: [
      { token: 'deep_work', title: 'Deep work', current: 4, ideal: 10 },
      { token: 'delivery_operations', title: 'Delivery and operations', current: 22, ideal: 10 },
    ],
    action: {
      chosen: 'Two protected mornings a week',
      when: 'From Monday',
      howKnown: 'The bid is drafted by the end of the month',
    },
    report: null,
    footnote: 'A tool designed by Rashmir Balasubramaniam.',
    ...over,
  };
}

const reading = {
  chapters: [
    {
      section: 'why_now' as const,
      paragraphs: [
        'You said the bid was what kept you up, and the week you described has no room in it for one.',
      ],
    },
    {
      section: 'the_week' as const,
      paragraphs: ['Twenty two hours of it belongs to delivery.'],
    },
    {
      section: 'what_you_chose' as const,
      paragraphs: ['Two mornings, from Monday, with the Thursday stand-up handed to Priya.'],
    },
  ],
  closing: 'You have looked at this honestly, and that is the part nobody else can do.',
  gaps: [
    { token: 'deep_work', observation: 'Deep work sits at four hours against the ten you wanted.' },
    { token: 'delivery_operations', observation: 'Delivery holds twenty two hours of the week.' },
  ],
  pathway: [
    { horizon: 'now' as const, step: 'Two protected mornings', difference: 'Room to think.' },
    { horizon: 'next' as const, step: 'Handing over a meeting', difference: 'Two hours back.' },
    {
      horizon: 'later' as const,
      step: 'A standing review',
      difference: 'Less pulled into detail.',
    },
  ],
};

/** Every PDF begins `%PDF`. A buffer that does not is not one, however long it is. */
async function expectAPdf(input: AuditSummary): Promise<Buffer> {
  const buffer = await renderSummaryPdf(input);
  expect(buffer.length).toBeGreaterThan(1000);
  expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  return buffer;
}

describe('renderSummaryPdf', () => {
  it('renders a full summary with no analyst reading', { timeout: RENDER_TIMEOUT }, async () => {
    await expectAPdf(summary());
  });

  it('renders with the analyst’s sections', { timeout: RENDER_TIMEOUT }, async () => {
    const withReading = await expectAPdf(summary({ report: reading }));
    const without = await renderSummaryPdf(summary());
    // The sections are really drawn rather than silently dropped: more content, more bytes.
    expect(withReading.length).toBeGreaterThan(without.length);
  });

  it(
    'renders a reading stored before the narrative existed',
    { timeout: RENDER_TIMEOUT },
    async () => {
      // Old rows keep their gaps and pathway and have no arc. The document must be the shorter one
      // rather than a render that throws on a missing chapter list.
      await expectAPdf(summary({ report: { ...reading, chapters: [], closing: null } }));
    }
  );

  it('renders a sparse audit with nothing optional', { timeout: RENDER_TIMEOUT }, async () => {
    // The shape a leader who left early would produce. Every optional block absent at once, which is
    // the combination most likely to render an empty container or divide by a missing figure.
    await expectAPdf(
      summary({
        firstName: null,
        role: null,
        orgType: null,
        period: null,
        priorities: null,
        rows: [{ token: 'deep_work', title: 'Deep work', current: 4, ideal: null }],
        action: { chosen: null, when: null, howKnown: null },
      })
    );
  });

  it('survives a week with no hours in it at all', { timeout: RENDER_TIMEOUT }, async () => {
    // The bar scale divides by the largest figure. At zero across the board that is a division by
    // zero unless the floor holds, and a completed audit with every area at nought is reachable.
    await expectAPdf(
      summary({
        current: {
          ...chart,
          totalHours: 0,
          buckets: chart.buckets.map((b) => ({ ...b, hours: 0, percent: 0 })),
        },
      })
    );
  });
});

describe('summaryPdfResponse', () => {
  it('is an attachment, typed as a PDF, and never cached', async () => {
    const response = summaryPdfResponse(await renderSummaryPdf(summary()), summary());
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('names the file after the leader and the day', async () => {
    const buffer = await renderSummaryPdf(summary());
    const on = new Date('2026-07-29T12:00:00.000Z');
    expect(summaryPdfResponse(buffer, summary(), on).headers.get('Content-Disposition')).toContain(
      'filename="time-audit-sam-2026-07-29.pdf"'
    );
  });

  it('keeps the filename safe when the name is not', async () => {
    const buffer = await renderSummaryPdf(summary());
    const on = new Date('2026-07-29T12:00:00.000Z');
    // A quote or a slash in the name would break out of the header or invent a path.
    const nasty = summary({ firstName: 'Ann-Marie "AJ" O\'Brien/../x' });
    const disposition = summaryPdfResponse(buffer, nasty, on).headers.get('Content-Disposition');
    expect(disposition).toBe(
      'attachment; filename="time-audit-ann-marie-aj-o-brien-x-2026-07-29.pdf"'
    );
  });

  it('falls back to a name with no leader in it', async () => {
    const buffer = await renderSummaryPdf(summary());
    const on = new Date('2026-07-29T12:00:00.000Z');
    const anon = summary({ firstName: null });
    expect(summaryPdfResponse(buffer, anon, on).headers.get('Content-Disposition')).toContain(
      'filename="time-audit-2026-07-29.pdf"'
    );
  });
});
