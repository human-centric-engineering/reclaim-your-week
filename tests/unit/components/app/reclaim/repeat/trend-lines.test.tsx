/**
 * The trend lines, rendered (F9 t-1).
 *
 * Two things this pins. **It is silent unless there is something to say** — the panel sits directly
 * above the invitation to begin an audit, so a first-time leader must not meet an empty chart, an
 * error box, or a one-point "trend". And **it stays neutral**: buckets keep Rashmir's canonical order
 * rather than being sorted by biggest mover (that ordering would itself be a claim about what
 * matters), and a fall is rendered exactly like a rise.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { readTrends } = vi.hoisted(() => ({ readTrends: vi.fn() }));
vi.mock('@/components/app/reclaim/repeat/actions', () => ({ readTrends }));

import { TrendLines } from '@/components/app/reclaim/repeat/trend-lines';
import { NO_VALUE } from '@/components/app/reclaim/format';

const runs = [
  { runId: 'r1', quarter: '2026 Q1', completedAt: '2026-04-01T00:00:00.000Z' },
  { runId: 'r2', quarter: '2026 Q2', completedAt: '2026-07-01T00:00:00.000Z' },
];

beforeEach(() => readTrends.mockReset());

describe('TrendLines', () => {
  it('renders nothing when there is not enough data yet', async () => {
    readTrends.mockResolvedValue({ runs: runs.slice(0, 1), buckets: [], enoughData: false });

    const { container } = render(<TrendLines />);
    await waitFor(() => expect(readTrends).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it('shows each bucket’s hours per audit, labelled by the period audited', async () => {
    readTrends.mockResolvedValue({
      runs,
      buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [10, 4] }],
      enoughData: true,
    });

    render(<TrendLines />);

    expect(await screen.findByText('Deep work')).toBeInTheDocument();
    expect(screen.getByText('10h')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.getByText(/2026 Q1 then 2026 Q2/)).toBeInTheDocument();
  });

  it('renders a gap as a gap, not as zero hours', async () => {
    readTrends.mockResolvedValue({
      runs,
      buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [10, null] }],
      enoughData: true,
    });

    render(<TrendLines />);

    await screen.findByText('Deep work');
    expect(screen.getByText('·')).toBeInTheDocument();
    expect(screen.queryByText('0h')).not.toBeInTheDocument();
  });

  it('treats a fall and a rise identically, and never sorts by biggest mover', async () => {
    readTrends.mockResolvedValue({
      runs,
      buckets: [
        { bucketSlug: 'deep-work', title: 'Deep work', hours: [10, 4] },
        { bucketSlug: 'team-development', title: 'Team development', hours: [2, 8] },
      ],
      enoughData: true,
    });

    render(<TrendLines />);

    const fell = await screen.findByText(/−6h/);
    const rose = screen.getByText(/\+6h/);
    expect(fell.className).toBe(rose.className);

    // Canonical order preserved: deep work is §1's first bucket and stays first, even though the
    // other moved by the same amount. Ordering by "biggest change" would be the tool deciding what
    // mattered about their quarter.
    const titles = screen.getAllByText(/Deep work|Team development/).map((el) => el.textContent);
    expect(titles).toEqual(['Deep work', 'Team development']);

    const panel = fell.closest('section');
    expect(/improv|slipp|worse|better|declin|good|bad/i.test(panel?.textContent ?? '')).toBe(false);
  });

  it('labels an audit by its finish date when no period was recorded', async () => {
    readTrends.mockResolvedValue({
      runs: runs.map((r) => ({ ...r, quarter: null })),
      buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [10, 4] }],
      enoughData: true,
    });

    render(<TrendLines />);
    expect(await screen.findByText(/Apr 2026 then Jul 2026/)).toBeInTheDocument();
  });

  it('says “no change” for a bucket that stayed put, and nothing for one point', async () => {
    readTrends.mockResolvedValue({
      runs,
      buckets: [
        { bucketSlug: 'deep-work', title: 'Deep work', hours: [6, 6] },
        // One known point across two audits: no line to draw and no change to state.
        { bucketSlug: 'learning-development', title: 'Learning', hours: [null, 3] },
      ],
      enoughData: true,
    });

    render(<TrendLines />);
    expect(await screen.findByText('no change')).toBeInTheDocument();
    // The shared NO_VALUE placeholder, not a literal: I2 makes U+2014 zero-tolerance in
    // coach-voiced copy, so a table's "no number here" mark is an en dash from one constant.
    expect(screen.getByText(NO_VALUE)).toBeInTheDocument();
  });

  it('breaks the line at a gap rather than drawing through a value nobody gave', async () => {
    readTrends.mockResolvedValue({
      runs: [...runs, { runId: 'r3', quarter: '2026 Q3', completedAt: '2026-10-01T00:00:00.000Z' }],
      // Answered, skipped, answered. The sparkline must be two separate strokes, not one line
      // sloping through the quarter they did not record.
      buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [10, null, 6] }],
      enoughData: true,
    });

    const { container } = render(<TrendLines />);
    await screen.findByText('Deep work');

    const path = container.querySelector('path')?.getAttribute('d') ?? '';
    // Two `M` (move-to) commands = the pen lifted over the gap.
    expect((path.match(/M/g) ?? []).length).toBe(2);
  });

  it('renders no sparkline at all from a single known point', async () => {
    readTrends.mockResolvedValue({
      runs,
      buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [null, 6] }],
      enoughData: true,
    });

    const { container } = render(<TrendLines />);
    await screen.findByText('Deep work');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('says the movement is theirs to interpret', async () => {
    readTrends.mockResolvedValue({
      runs,
      buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [10, 4] }],
      enoughData: true,
    });

    render(<TrendLines />);
    // I16 on screen: the tool hands the reading back rather than making it.
    expect(await screen.findByText(/yours to say/)).toBeInTheDocument();
  });
});
