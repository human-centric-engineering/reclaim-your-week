/**
 * Unit: the transcript PDF render helper — the twin of `render-summary-pdf.tsx`.
 *
 * A **real** end-to-end render — the document through `@react-pdf/renderer`'s `renderToBuffer` —
 * asserting a genuine PDF comes out of every shape a transcript can take. Same trade as
 * `render-summary-pdf.test.tsx` for the same reason: react-pdf emits a binary buffer, and extracting
 * text from it would mean running the environment-sensitive pdfjs engine this repository mocks
 * everywhere else. These are structural checks (no-throw, `%PDF` magic, non-empty, and — where the
 * document's own shape lets us — relative size), which is what proves the render helper actually
 * draws what it is given rather than producing a fixed-size document regardless of input.
 *
 * **What this catches, and why it is worth a real render.** A react-pdf document throws on a style
 * property the renderer does not support or a `flex` value it cannot resolve — none of which
 * type-check catches, because the props are typed loosely enough to accept CSS with no meaning in a
 * PDF. The shapes below are the ones that actually differ in layout: no turns at all, one turn,
 * many turns, a leader with no name.
 *
 * Timeouts are per-test rather than global: a real render is slow, and raising the whole suite's
 * limit to accommodate a handful of tests would hide a hang everywhere else.
 */

import { describe, it, expect } from 'vitest';

import { renderTranscriptPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-transcript-pdf';
import type { OwnTranscript, OwnTranscriptTurn } from '@/lib/app/programme/runs/transcript';

const RENDER_TIMEOUT = 20_000;

function turn(over: Partial<OwnTranscriptTurn> = {}): OwnTranscriptTurn {
  return {
    id: 'turn-1',
    role: 'coach',
    text: 'What would you change about this week?',
    at: new Date('2026-07-29T10:01:00.000Z'),
    ...over,
  };
}

function transcript(over: Partial<OwnTranscript> = {}): OwnTranscript {
  return {
    runId: 'clxrun00000000000000000a',
    firstName: 'Sam',
    startedAt: new Date('2026-07-29T10:00:00.000Z'),
    turns: [
      turn({ id: 't1', role: 'coach', text: 'What would you change about this week?' }),
      turn({ id: 't2', role: 'leader', text: 'I would give the mornings back to the bid.' }),
    ],
    ...over,
  };
}

/** Every PDF begins `%PDF`. A buffer that does not is not one, however long it is. */
async function expectAPdf(input: OwnTranscript): Promise<Buffer> {
  const buffer = await renderTranscriptPdf(input);
  expect(buffer.length).toBeGreaterThan(1000);
  expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  return buffer;
}

describe('renderTranscriptPdf', () => {
  it('renders a conversation with several turns', { timeout: RENDER_TIMEOUT }, async () => {
    await expectAPdf(transcript());
  });

  it(
    'draws the turns it is given: more of them is a bigger document',
    { timeout: RENDER_TIMEOUT },
    async () => {
      const single = await expectAPdf(transcript({ turns: [turn({ id: 'only' })] }));
      const many = await expectAPdf(
        transcript({
          turns: Array.from({ length: 12 }, (_, i) =>
            turn({
              id: `t${i}`,
              role: i % 2 === 0 ? 'coach' : 'leader',
              text: `Turn number ${i}, said at length so the page actually fills up with it.`,
            })
          ),
        })
      );
      // Not a fixed-size document: the content really is drawn from what it was handed, rather than
      // a template that ignores `transcript.turns` past the first entry.
      expect(many.length).toBeGreaterThan(single.length);
    }
  );

  it(
    'renders a run with no conversation recorded, rather than throwing on an empty list',
    { timeout: RENDER_TIMEOUT },
    async () => {
      // The state a leader who only used the panels would produce — reachable per readOwnTranscript's
      // own contract (an empty `turns` array is real, not an error).
      await expectAPdf(transcript({ turns: [] }));
    }
  );

  it(
    'falls back to a generic heading with no leader name',
    { timeout: RENDER_TIMEOUT },
    async () => {
      await expectAPdf(transcript({ firstName: null }));
    }
  );

  it('survives a turn long enough to wrap across a page', { timeout: RENDER_TIMEOUT }, async () => {
    // A forty-minute audit produces long turns; the document must let them break across pages
    // rather than crashing on an unbounded block.
    const long = 'This is a long answer. '.repeat(400);
    await expectAPdf(transcript({ turns: [turn({ id: 'long', role: 'leader', text: long })] }));
  });
});
