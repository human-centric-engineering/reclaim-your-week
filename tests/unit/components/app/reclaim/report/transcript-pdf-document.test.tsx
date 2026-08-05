/**
 * Unit: `<TranscriptPdfDocument>` — a leader's own conversation, rendered.
 *
 * A **real** end-to-end render through `@react-pdf/renderer`'s `renderToBuffer`, the same trade the
 * sibling `render-summary-pdf.test.tsx` makes and for the same reason: react-pdf throws on a style or
 * layout it cannot resolve, and that is exactly the class of bug a type-check does not catch (the
 * props are typed loosely enough to accept CSS with no meaning in a PDF). Structural checks only —
 * no-throw, the `%PDF` magic bytes, and byte-length comparisons across shapes — because extracting
 * text back out of the buffer would mean running the environment-sensitive pdfjs engine this
 * repository deliberately avoids everywhere else.
 *
 * Timeouts are per-test rather than global, matching the sibling suite: a real render is slow, and
 * raising the whole file's budget to accommodate it would hide a hang everywhere else in this file.
 */

import { describe, it, expect } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';

import { TranscriptPdfDocument } from '@/components/app/reclaim/report/transcript-pdf-document';
import type { OwnTranscript } from '@/lib/app/programme/runs/transcript';

const RENDER_TIMEOUT = 20_000;

function transcript(over: Partial<OwnTranscript> = {}): OwnTranscript {
  return {
    runId: 'run-1',
    firstName: 'Sam',
    startedAt: new Date('2026-07-29T10:00:00.000Z'),
    turns: [
      { id: 't1', role: 'leader', text: 'Roughly twenty hours in meetings.', at: new Date() },
      { id: 't2', role: 'coach', text: 'That is half the week.', at: new Date() },
      { id: 't3', role: 'leader', text: 'I will protect Tuesday mornings.', at: new Date() },
    ],
    ...over,
  };
}

/** Every PDF begins `%PDF`. A buffer that does not is not one, however long it is. */
async function expectAPdf(input: OwnTranscript): Promise<Buffer> {
  const buffer = await renderToBuffer(<TranscriptPdfDocument transcript={input} />);
  expect(buffer.length).toBeGreaterThan(500);
  expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  return buffer;
}

describe('TranscriptPdfDocument', () => {
  it('renders a conversation with both speakers', { timeout: RENDER_TIMEOUT }, async () => {
    await expectAPdf(transcript());
  });

  it(
    'renders the run’s whole conversation, and grows with it',
    { timeout: RENDER_TIMEOUT },
    async () => {
      // Not a record that silently truncates: a longer conversation is really drawn, not dropped.
      const short = await expectAPdf(transcript());
      const long = await expectAPdf(
        transcript({
          turns: Array.from({ length: 20 }, (_, i) => ({
            id: `t${i}`,
            role: i % 2 === 0 ? ('leader' as const) : ('coach' as const),
            text: `Turn number ${i}, with enough words in it to take up real space on the page.`,
            at: new Date(),
          })),
        })
      );
      expect(long.length).toBeGreaterThan(short.length);
    }
  );

  it(
    'renders a run whose conversation has no turns recorded',
    { timeout: RENDER_TIMEOUT },
    async () => {
      // Reachable: a leader who reached phase 6 by the panels alone, before the conversation was the
      // way through. Must render the "nothing recorded" sentence rather than an empty container or a
      // crash on an empty list.
      await expectAPdf(transcript({ turns: [] }));
    }
  );

  it('renders for a leader with no first name on file', { timeout: RENDER_TIMEOUT }, async () => {
    // The anonymous heading branch ("Your conversation" instead of "Sam's conversation").
    await expectAPdf(transcript({ firstName: null }));
  });

  it('renders a single long turn without throwing', { timeout: RENDER_TIMEOUT }, async () => {
    // Long turns are deliberately allowed to break across a page (only short ones are `wrap={false}`);
    // a very long single turn is the shape most likely to trip a wrap/flex resolution error.
    await expectAPdf(
      transcript({
        turns: [
          {
            id: 't1',
            role: 'leader',
            text: 'A single very long turn. '.repeat(200),
            at: new Date(),
          },
        ],
      })
    );
  });
});
