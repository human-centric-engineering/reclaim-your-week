/**
 * I12 — the picture and its interpretation are separate beats.
 *
 * The invariant says "the component boundary enforces it", and for a whole version that was aspiration
 * rather than fact: both surfaces drew the chart the instant a single reading landed, so a leader
 * assembled their week one bar at a time and there was no reveal left to have. What enforces it now is
 * three things, and this file guards all three, because any one of them alone can be quietly undone.
 *
 *  1. **The condition.** Ready means the week is whole, not that there is something to draw.
 *  2. **The surfaces.** Neither renders an interpretation in the same beat as the chart, and neither
 *     renders the chart before the reveal.
 *  3. **The server.** Phase 1 cannot be left until the reveal is recorded on the run
 *     (`422 CHART_REVEAL_REQUIRED`). A gate the UI alone holds is not a gate, which is the argument
 *     I9 already settled for the reflection.
 *
 * Guards 2 and 3 read source text rather than behaviour. That is a deliberate trade: the alternative
 * is rendering two React trees and driving a route, which these files already do in their own unit
 * tests. What no behavioural test catches is a future edit that reintroduces the *old shape* — and
 * that shape is recognisable by grep.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chartRevealReady,
  chartRevealed,
  CHART_REVEAL_MOMENT,
  CHART_REVEAL_PHASE,
} from '@/lib/app/programme/chart/reveal';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import type { Answers } from '@/lib/app/programme/chart/series';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const CONVERSATION = 'components/app/reclaim/coach/phase-conversation.tsx';
const PANEL = 'components/app/reclaim/phase/phase1-panel.tsx';
const TRANSITION = 'app/api/v1/app/reclaim/runs/[runId]/transition/route.ts';

describe('I12 — the reveal condition', () => {
  it('is not satisfied by a single reading', () => {
    const first = RECLAIM_BUCKETS.find((b) => !b.conditional)!;
    const oneAnswer: Answers = {
      [`reclaim_current_hours__${bucketToken(first.slug)}`]: { value: '9', valueJson: 9 },
    };
    expect(chartRevealReady(oneAnswer)).toBe(false);
  });

  it('is satisfied only when every area the leader was asked about has a figure', () => {
    const answers: Answers = {};
    const visible = RECLAIM_BUCKETS.filter((b) => !b.conditional);
    for (const bucket of visible.slice(0, -1)) {
      answers[`reclaim_current_hours__${bucketToken(bucket.slug)}`] = { value: '4', valueJson: 4 };
    }
    expect(chartRevealReady(answers)).toBe(false);

    const last = visible[visible.length - 1];
    answers[`reclaim_current_hours__${bucketToken(last.slug)}`] = { value: '4', valueJson: 4 };
    expect(chartRevealReady(answers)).toBe(true);
  });

  it('is recorded on the run, so a reload cannot replay the beat', () => {
    expect(chartRevealed([])).toBe(false);
    expect(chartRevealed([CHART_REVEAL_MOMENT])).toBe(true);
  });
});

describe('I12 — both surfaces reveal rather than accumulate', () => {
  for (const [name, path] of [
    ['the conversation', CONVERSATION],
    ['the form panel', PANEL],
  ] as const) {
    it(`${name} gates the chart on the reveal state, not on a running count`, () => {
      const source = read(path);
      expect(source).toContain('chartRevealState');
      // The two triggers this replaced. Either one back in the tree means the chart has started
      // drawing itself again while the leader is still filling the week in.
      expect(source).not.toMatch(/capturedCount > 0 &&\s*<?ReclaimChart/);
      expect(source).not.toMatch(/\{anyHours && \(/);
    });

    it(`${name} renders the chart only once the reveal has happened`, () => {
      // Deliberately not a scan of what sits beside the chart in the same block: that fires falsely
      // on the first caption anyone adds, and the "no interpretation" half is already structural —
      // `ReclaimChart` emits numbers and no prose. What matters, and what regressed before, is that
      // the chart cannot appear before the leader has asked to see it.
      const source = read(path);
      // `<ReclaimChart data=` rather than `<ReclaimChart`, so a docblock mentioning the component
      // is not mistaken for the render site.
      const chartLine = source.split('\n').findIndex((l) => l.includes('<ReclaimChart data='));
      expect(chartLine, `${path} no longer renders the chart`).toBeGreaterThan(-1);
      const guard = source
        .split('\n')
        .slice(Math.max(0, chartLine - 3), chartLine)
        .join('\n');
      expect(guard).toMatch(/isRevealed|chart !== null/);
    });
  }
});

describe('I12 — the server holds the gate', () => {
  it('refuses to leave phase 1 without the reveal', () => {
    const source = read(TRANSITION);
    expect(source).toContain('CHART_REVEAL_REQUIRED');
    expect(source).toContain('CHART_REVEAL_PHASE');
    expect(source).toContain('chartRevealed');
  });

  it('names the phase the gate applies to', () => {
    expect(CHART_REVEAL_PHASE).toBe('phase-1-current');
  });
});
