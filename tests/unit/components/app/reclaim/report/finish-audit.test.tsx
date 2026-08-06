/**
 * `<FinishAudit>` — the one control on the report screen that changes something permanently. The
 * three sentences beside the button are asserted in `phase6-panel.test.tsx` (they are part of the
 * parent's contract too); this file is about the button's own state machine — busy, success, and the
 * two failure shapes `completeAudit` can throw.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { completeAudit } = vi.hoisted(() => ({ completeAudit: vi.fn() }));
vi.mock('@/components/app/reclaim/phase/actions', () => ({ completeAudit }));

import { FinishAudit } from '@/components/app/reclaim/report/finish-audit';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FinishAudit — says what it does before it is pressed', () => {
  it('explains that the report stays and the conversation closes', () => {
    render(<FinishAudit runId="run-1" onFinished={vi.fn()} />);

    expect(
      screen.getByText(/marks this audit complete and closes the conversation with the coach/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Your report is not going anywhere\./)).toBeInTheDocument();
  });
});

describe('FinishAudit — finishing', () => {
  it('completes the run for this runId and tells the parent it finished', async () => {
    completeAudit.mockResolvedValue(undefined);
    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<FinishAudit runId="run-42" onFinished={onFinished} />);

    await user.click(screen.getByRole('button', { name: 'Finish my audit' }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(completeAudit).toHaveBeenCalledWith('run-42');
  });

  it('shows a busy label and disables the button while it waits', async () => {
    let resolveComplete: () => void = () => {};
    completeAudit.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveComplete = resolve;
      })
    );
    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<FinishAudit runId="run-1" onFinished={onFinished} />);

    await user.click(screen.getByRole('button', { name: 'Finish my audit' }));

    expect(screen.getByRole('button', { name: 'Finishing…' })).toBeDisabled();

    resolveComplete();
    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    // Deliberate: success has no `finally` resetting busy, unlike the catch branch. In production
    // `onFinished` moves the leader off this section entirely; nothing here re-enables the button on
    // its own, because nothing should — there is no "finish again" to offer.
    expect(screen.getByRole('button', { name: 'Finishing…' })).toBeDisabled();
  });
});

describe('FinishAudit — when it fails', () => {
  it('shows the thrown message and lets the leader try again, without calling onFinished', async () => {
    completeAudit.mockRejectedValue(new Error('We could not finish your audit just now.'));
    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<FinishAudit runId="run-1" onFinished={onFinished} />);

    await user.click(screen.getByRole('button', { name: 'Finish my audit' }));

    expect(
      await screen.findByText('We could not finish your audit just now. You can try again.')
    ).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
    // Not left spinning: the button comes back so the leader has something they can do.
    expect(screen.getByRole('button', { name: 'Finish my audit' })).toBeEnabled();
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    completeAudit.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(<FinishAudit runId="run-1" onFinished={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Finish my audit' }));

    expect(await screen.findByText('Something went wrong. You can try again.')).toBeInTheDocument();
  });
});
