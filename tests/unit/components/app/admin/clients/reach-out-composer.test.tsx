/**
 * Writing to a leader who stopped (F18 t-2) — the composer on their record.
 *
 * Load-bearing: **the product never sends this on its own.** Every path here starts from a draft the
 * operator can freely rewrite, and `send` posts whatever is on screen — never the original draft —
 * which is what the "posts what was typed, not the draft" test below actually proves, not merely
 * states. The two warning conditions (already written to, opted out of nudges) are asserted to be
 * facts shown beside the composer, never a disabled button — I16 is aimed at the tool overruling a
 * coach, and a refusal here would be exactly that.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReachOutComposer } from '@/components/app/admin/clients/reach-out-composer';

const { readReachOut, sendReachOut } = vi.hoisted(() => ({
  readReachOut: vi.fn(),
  sendReachOut: vi.fn(),
}));
vi.mock('@/components/app/admin/actions', () => ({ readReachOut, sendReachOut }));

const DRAFT = {
  subject: 'Your time audit is still open',
  body: 'Hello Ada,\n\nRashmir',
  auditRunId: 'run-1',
  phaseLabel: 'Energy',
  alreadyWrittenForThisRun: false,
  optedOutOfNudges: false,
};

beforeEach(() => {
  readReachOut.mockReset();
  sendReachOut.mockReset();
  readReachOut.mockResolvedValue({ draft: DRAFT, sent: [] });
});

describe('ReachOutComposer', () => {
  it('loads the draft for this leader and starts closed', async () => {
    render(<ReachOutComposer userId="u1" />);

    await screen.findByText('Write to them');
    expect(readReachOut).toHaveBeenCalledWith('u1');
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
  });

  it('opens the composer pre-filled with the draft', async () => {
    const user = userEvent.setup();
    render(<ReachOutComposer userId="u1" />);

    await user.click(await screen.findByRole('button', { name: /start a message/i }));

    expect(screen.getByDisplayValue(DRAFT.subject)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Hello Ada,/)).toBeInTheDocument();
  });

  it('posts what was typed, not the original draft', async () => {
    sendReachOut.mockResolvedValue({
      delivered: true,
      record: {
        id: 'm1',
        auditRunId: 'run-1',
        subject: 'Rewritten subject',
        body: 'Rewritten body.',
        status: 'sent',
        sentAt: '2026-07-30T00:00:00.000Z',
        sentByName: 'Rashmir',
      },
    });
    const user = userEvent.setup();
    render(<ReachOutComposer userId="u1" />);

    await user.click(await screen.findByRole('button', { name: /start a message/i }));
    const subjectField = screen.getByLabelText('Subject');
    await user.clear(subjectField);
    await user.type(subjectField, 'Rewritten subject');
    const bodyField = screen.getByLabelText('Message');
    await user.clear(bodyField);
    await user.type(bodyField, 'Rewritten body.');
    await user.click(screen.getByRole('button', { name: /send it/i }));

    expect(sendReachOut).toHaveBeenCalledWith('u1', {
      subject: 'Rewritten subject',
      body: 'Rewritten body.',
      auditRunId: 'run-1',
    });
    expect(await screen.findByText(/kept on their record below/)).toBeInTheDocument();
  });

  it('reports a failed delivery without hiding that the attempt was recorded', async () => {
    sendReachOut.mockResolvedValue({
      delivered: false,
      record: {
        id: 'm2',
        auditRunId: 'run-1',
        subject: DRAFT.subject,
        body: DRAFT.body,
        status: 'failed',
        sentAt: '2026-07-30T00:00:00.000Z',
        sentByName: 'Rashmir',
      },
    });
    const user = userEvent.setup();
    render(<ReachOutComposer userId="u1" />);

    await user.click(await screen.findByRole('button', { name: /start a message/i }));
    await user.click(screen.getByRole('button', { name: /send it/i }));

    expect(await screen.findByText(/did not reach the mail provider/)).toBeInTheDocument();
  });

  it('shows, but does not act on, a warning that someone already wrote about this audit', async () => {
    readReachOut.mockResolvedValue({
      draft: { ...DRAFT, alreadyWrittenForThisRun: true },
      sent: [],
    });
    render(<ReachOutComposer userId="u1" />);

    expect(
      await screen.findByText(/Somebody has already written to them about this audit/)
    ).toBeInTheDocument();
    // A fact beside the composer, not a blocked button — I16.
    expect(screen.getByRole('button', { name: /start a message/i })).toBeEnabled();
  });

  it('shows, but does not act on, a warning that the leader opted out of nudges', async () => {
    readReachOut.mockResolvedValue({
      draft: { ...DRAFT, optedOutOfNudges: true },
      sent: [],
    });
    render(<ReachOutComposer userId="u1" />);

    expect(await screen.findByText(/turned the quarterly reminders off/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start a message/i })).toBeEnabled();
  });

  it('lists a previously sent message with its body, so the next one is written knowing the last', async () => {
    readReachOut.mockResolvedValue({
      draft: DRAFT,
      sent: [
        {
          id: 'm0',
          auditRunId: 'run-1',
          subject: 'Earlier note',
          body: 'Something I said before.',
          status: 'sent',
          sentAt: '2026-07-01T00:00:00.000Z',
          sentByName: 'Rashmir',
        },
      ],
    });
    render(<ReachOutComposer userId="u1" />);

    expect(await screen.findByText('Earlier note')).toBeInTheDocument();
    expect(screen.getByText('Something I said before.')).toBeInTheDocument();
  });

  it('says nothing here is sent automatically, plainly, on every render', async () => {
    render(<ReachOutComposer userId="u1" />);
    expect(await screen.findByText(/Nothing here is sent automatically/)).toBeInTheDocument();
  });
});
