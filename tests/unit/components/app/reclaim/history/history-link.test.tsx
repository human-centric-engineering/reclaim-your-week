/**
 * The one way into the history, on the entry screen.
 *
 * The restraint is the behaviour worth pinning: a leader who has never finished an audit should not
 * be offered a door onto an empty room, and a request that fails should cost them nothing, because
 * this sits beside the invitation to begin rather than being it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { readRuns } = vi.hoisted(() => ({ readRuns: vi.fn() }));
vi.mock('@/components/app/reclaim/history/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/reclaim/history/actions')>()),
  readRuns,
}));

import { HistoryLink } from '@/components/app/reclaim/history/history-link';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HistoryLink', () => {
  it('offers the history once there is one to offer', async () => {
    readRuns.mockResolvedValue([{ id: 'a' }]);
    render(<HistoryLink />);

    const link = await screen.findByRole('link', { name: 'Look back at your last audit' });
    expect(link).toHaveAttribute('href', '/programme/history');
  });

  it('counts them, so the link says what is behind it', async () => {
    readRuns.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    render(<HistoryLink />);

    expect(
      await screen.findByRole('link', { name: 'Look back at your 3 audits' })
    ).toBeInTheDocument();
  });

  it('shows nothing to a leader who has not run one', async () => {
    readRuns.mockResolvedValue([]);
    const { container } = render(<HistoryLink />);

    await waitFor(() => expect(readRuns).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent when the list cannot be read, since the entry screen still works without it', async () => {
    readRuns.mockRejectedValue(new Error('nope'));
    const { container } = render(<HistoryLink />);

    await waitFor(() => expect(readRuns).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
