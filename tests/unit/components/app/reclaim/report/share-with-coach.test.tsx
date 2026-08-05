/**
 * `<ShareWithCoach>` — the one sharing question this product asks (see the file's own header for what
 * the four-tickbox panel it replaced got wrong). The behaviour worth proving: the transcript question
 * only ever reaches the server tied to its parent (`shareTranscript: withCoach && shareTranscript`,
 * even if the box was ticked before the parent was unticked), the quote consent is asked only when
 * there is a sentence to quote, and the saved message names who can see the report rather than just
 * confirming a click landed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { shareSummary } = vi.hoisted(() => ({ shareSummary: vi.fn() }));
vi.mock('@/components/app/reclaim/phase/actions', () => ({ shareSummary }));

import { ShareWithCoach } from '@/components/app/reclaim/report/share-with-coach';
import type { ShareInput } from '@/components/app/reclaim/phase/actions';

beforeEach(() => {
  vi.clearAllMocks();
});

function lastCall(): ShareInput {
  const call = shareSummary.mock.calls.at(-1) as [string, ShareInput];
  return call[1];
}

describe('ShareWithCoach — nothing is ticked by default', () => {
  it('opens with sharing off and no transcript question visible', () => {
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    expect(screen.getByLabelText(/share my report with rashmir/i)).not.toBeChecked();
    expect(screen.queryByLabelText(/read our conversation/i)).not.toBeInTheDocument();
  });

  it('reveals the transcript question only once the report itself is shared', async () => {
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    expect(screen.queryByLabelText(/read our conversation/i)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/share my report with rashmir/i));
    expect(screen.getByLabelText(/read our conversation/i)).toBeInTheDocument();
  });
});

describe('ShareWithCoach — the takeaway and quote consent', () => {
  it('asks nothing about quoting when there is no takeaway to quote', () => {
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    expect(screen.queryByText(/what you said you were taking away/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/quoted anonymously/i)).not.toBeInTheDocument();
  });

  it('shows the saved takeaway and asks for quote consent once there is one', () => {
    render(<ShareWithCoach runId="run-1" takeaway="I was paying for my own availability." />);

    expect(screen.getByText('I was paying for my own availability.')).toBeInTheDocument();
    expect(screen.getByLabelText(/quoted anonymously/i)).not.toBeChecked();
  });
});

describe('ShareWithCoach — saving', () => {
  it('withdraws the transcript question with its parent, even if it was ticked first', async () => {
    // The state a leader reaches by ticking both, then changing their mind about the parent only:
    // the transcript box unmounts but its own state does not reset, so the guard has to live in what
    // gets sent, not in the checkbox.
    shareSummary.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByLabelText(/share my report with rashmir/i));
    await user.click(screen.getByLabelText(/read our conversation/i));
    await user.click(screen.getByLabelText(/share my report with rashmir/i)); // untick the parent
    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    await waitFor(() => expect(shareSummary).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ withCoach: false, shareTranscript: false });
  });

  it('sends shareTranscript true only when both boxes are ticked together', async () => {
    shareSummary.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByLabelText(/share my report with rashmir/i));
    await user.click(screen.getByLabelText(/read our conversation/i));
    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    await waitFor(() => expect(shareSummary).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ withCoach: true, shareTranscript: true });
  });

  it('treats "Prefer not to say" the same as no answer', async () => {
    shareSummary.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.selectOptions(screen.getByLabelText(/age range/i), 'Prefer not to say');
    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    await waitFor(() => expect(shareSummary).toHaveBeenCalled());
    expect(lastCall().ageBand).toBeUndefined();
  });

  it('passes through a real age band choice', async () => {
    shareSummary.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.selectOptions(screen.getByLabelText(/age range/i), '45–54');
    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    await waitFor(() => expect(shareSummary).toHaveBeenCalled());
    expect(lastCall().ageBand).toBe('45–54');
  });

  it('trims the takeaway and sends undefined for a blank one', async () => {
    shareSummary.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="  Room to think.  " />);

    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    await waitFor(() => expect(shareSummary).toHaveBeenCalled());
    expect(lastCall().takeaway).toBe('Room to think.');
  });

  it('sends the quote consent only when it was ticked', async () => {
    shareSummary.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="Room to think." />);

    await user.click(screen.getByLabelText(/quoted anonymously/i));
    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    await waitFor(() => expect(shareSummary).toHaveBeenCalled());
    expect(lastCall().quotable).toBe(true);
  });

  it('shows a busy label and disables the button while saving', async () => {
    let resolveSave: (v: boolean) => void = () => {};
    shareSummary.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    resolveSave(false);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save these choices' })).toBeEnabled()
    );
  });
});

describe('ShareWithCoach — after saving', () => {
  it('says the report is now visible to Rashmir when it was shared', async () => {
    shareSummary.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByLabelText(/share my report with rashmir/i));
    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    expect(await screen.findByText('Saved. Rashmir can see this report.')).toBeInTheDocument();
  });

  it('states the fact rather than a cheer when nothing was shared', async () => {
    shareSummary.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    expect(await screen.findByText('Saved. This report has not been shared.')).toBeInTheDocument();
  });

  it('clears the saved message the moment a choice changes again', async () => {
    shareSummary.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByRole('button', { name: 'Save these choices' }));
    await screen.findByText('Saved. This report has not been shared.');

    await user.click(screen.getByLabelText(/share my report with rashmir/i));

    expect(screen.queryByText('Saved. This report has not been shared.')).not.toBeInTheDocument();
  });

  it('shows the thrown message and lets the leader try again', async () => {
    shareSummary.mockRejectedValue(new Error('We could not save your choices just now.'));
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    expect(
      await screen.findByText('We could not save your choices just now. You can try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save these choices' })).toBeEnabled();
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    shareSummary.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(<ShareWithCoach runId="run-1" takeaway="" />);

    await user.click(screen.getByRole('button', { name: 'Save these choices' }));

    expect(await screen.findByText('Something went wrong. You can try again.')).toBeInTheDocument();
  });
});
