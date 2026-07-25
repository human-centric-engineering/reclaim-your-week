/**
 * The comparative open, rendered (F9 t-2).
 *
 * **The load-bearing test in this feature is the last one here.** The plan named the design risk
 * plainly: `buildChartData` already knows whether a bucket is inside its benchmark, so rendering
 * "you were in range and are now over" is one line away — and a leader who deliberately gave time to
 * their team at the cost of strategy is a success that a valenced comparison draws as a failure.
 * I12 says the charts do not interpret; this asserts the sibling rule on screen.
 *
 * The assertion is deliberately about **treatment parity** rather than about specific class names: a
 * fall and a rise must be rendered the same way. That survives a restyle, which "does not contain the
 * word red" would not.
 *
 * The failed-fetch path is covered in `actions.test.ts` rather than here. The component's handling of
 * it is three lines (`.catch(() => null)`), and asserting it at this level means handing the render a
 * pre-rejected promise, which vitest reports as an unhandled rejection however the component handles
 * it. The contract worth pinning — that a failure surfaces as a thrown error the caller can swallow —
 * belongs at the actions layer, which is where the rest of this codebase pins it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { readComparison } = vi.hoisted(() => ({ readComparison: vi.fn() }));
vi.mock('@/components/app/reclaim/repeat/actions', () => ({ readComparison }));

import { Comparison } from '@/components/app/reclaim/repeat/comparison';

const PREVIOUS = {
  runId: 'run-1',
  quarter: '2026 Q1',
  completedAt: '2026-04-01T00:00:00.000Z',
};

beforeEach(() => readComparison.mockReset());

describe('Comparison', () => {
  it('renders nothing on a first audit — absent, not an empty table', async () => {
    readComparison.mockResolvedValue({ previous: null, buckets: [] });

    const { container } = render(<Comparison runId="run-2" />);
    await waitFor(() => expect(readComparison).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it('shows both numbers and the signed difference', async () => {
    readComparison.mockResolvedValue({
      previous: PREVIOUS,
      buckets: [
        {
          bucketSlug: 'deep-work',
          title: 'Deep work',
          previousHours: 10,
          currentHours: 4,
          differenceHours: -6,
        },
      ],
    });

    render(<Comparison runId="run-2" />);

    expect(await screen.findByText('Deep work')).toBeInTheDocument();
    expect(screen.getByText('10h')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.getByText('−6h')).toBeInTheDocument();
    expect(screen.getByText(/Last time \(2026 Q1\)/)).toBeInTheDocument();
  });

  it('gives a fall and a rise identical treatment (I12’s sibling)', async () => {
    readComparison.mockResolvedValue({
      previous: PREVIOUS,
      buckets: [
        {
          bucketSlug: 'deep-work',
          title: 'Deep work',
          previousHours: 10,
          currentHours: 4,
          differenceHours: -6,
        },
        {
          bucketSlug: 'team-development',
          title: 'Team development',
          previousHours: 2,
          currentHours: 8,
          differenceHours: 6,
        },
      ],
    });

    render(<Comparison runId="run-2" />);

    const fell = await screen.findByText('−6h');
    const rose = screen.getByText('+6h');

    // Same element type, same classes: nothing about the markup says one of these is bad news. A
    // quarter spent deliberately on the team is not a failure, and the product does not get to say
    // it is.
    expect(fell.tagName).toBe(rose.tagName);
    expect(fell.className).toBe(rose.className);

    // And no valenced vocabulary anywhere on the panel.
    const panel = fell.closest('section');
    const words = /improv|slipp|worse|better|declin|fell behind|good|bad|warning/i;
    expect(words.test(panel?.textContent ?? '')).toBe(false);
  });

  it('says “no change” rather than 0h, and dashes an unknown side', async () => {
    readComparison.mockResolvedValue({
      previous: PREVIOUS,
      buckets: [
        {
          bucketSlug: 'deep-work',
          title: 'Deep work',
          previousHours: 6,
          currentHours: 6,
          differenceHours: 0,
        },
        {
          bucketSlug: 'learning-development',
          title: 'Learning',
          previousHours: 3,
          currentHours: null,
          differenceHours: null,
        },
      ],
    });

    render(<Comparison runId="run-2" />);

    expect(await screen.findByText('no change')).toBeInTheDocument();
    // The bucket this audit has not reached yet reads as unknown, not as zero hours.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
