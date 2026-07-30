/**
 * The invitations ledger, rendered — specifically the "Email" column.
 *
 * A failed send deliberately does not fail the invite: the row is the entitlement and the email is
 * only its delivery, so somebody whose invitation bounced is still properly invited. The cost of that
 * correct design is that their row looks *identical* to one that arrived, and the only trace of the
 * failure is a log line nobody is watching. This column is what makes it visible, so this is what
 * pins it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { listInvites, issueInvite, revokeInvite, grantAnotherAudit } = vi.hoisted(() => ({
  listInvites: vi.fn(),
  issueInvite: vi.fn(),
  revokeInvite: vi.fn(),
  grantAnotherAudit: vi.fn(),
}));
vi.mock('@/components/app/reclaim/access/actions', () => ({
  listInvites,
  issueInvite,
  revokeInvite,
  grantAnotherAudit,
}));

import { InviteManager } from '@/components/app/admin/access/invite-manager';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  email: 'priya@example.org',
  tier: 'standard',
  status: 'pending' as const,
  invitedByName: null,
  redeemedByName: null,
  viaLinkLabel: null,
  emailStatus: 'sent',
  redeemedAt: null,
  createdAt: '2026-07-26T00:00:00.000Z',
  ...over,
});

/** The table row for an address, so assertions cannot accidentally match another row's cell. */
async function rowFor(email: string) {
  const cell = await screen.findByText(email);
  const tr = cell.closest('tr');
  if (tr === null) throw new Error(`no row for ${email}`);
  return within(tr);
}

beforeEach(() => {
  vi.clearAllMocks();
  listInvites.mockResolvedValue([row()]);
});

describe('InviteManager — the email column', () => {
  it('shows a failed send as failed', async () => {
    listInvites.mockResolvedValue([row({ emailStatus: 'failed' })]);
    render(<InviteManager />);

    expect((await rowFor('priya@example.org')).getByText('failed')).toBeInTheDocument();
  });

  it('distinguishes "not configured" from "failed"', async () => {
    // Different things to do about them: one is a deployment setting, the other is an incident.
    listInvites.mockResolvedValue([row({ emailStatus: 'disabled' })]);
    render(<InviteManager />);

    const r = await rowFor('priya@example.org');
    expect(r.getByText('not configured')).toBeInTheDocument();
    expect(r.queryByText('failed')).not.toBeInTheDocument();
  });

  it('shows a dash, not a status, for an invite issued before this was recorded', async () => {
    // Absent is not the same as failed. Claiming otherwise would report old invitations as broken
    // when the truth is that we do not know.
    listInvites.mockResolvedValue([row({ emailStatus: null })]);
    render(<InviteManager />);

    const r = await rowFor('priya@example.org');
    expect(r.queryByText('failed')).not.toBeInTheDocument();
    expect(r.queryByText('sent')).not.toBeInTheDocument();
  });

  it('keeps the delivery status separate from the invitation’s own status', async () => {
    // A pending invitation whose email failed is the whole point of the column: the invite is live
    // and usable, and nobody has been told about it.
    listInvites.mockResolvedValue([row({ status: 'pending', emailStatus: 'failed' })]);
    render(<InviteManager />);

    const r = await rowFor('priya@example.org');
    expect(r.getByText('pending')).toBeInTheDocument();
    expect(r.getByText('failed')).toBeInTheDocument();
  });

  it('shows which group link an invitation was claimed through', async () => {
    listInvites.mockResolvedValue([row({ viaLinkLabel: 'Leadership offsite' })]);
    render(<InviteManager />);

    expect((await rowFor('priya@example.org')).getByText('Leadership offsite')).toBeInTheDocument();
  });

  it('says nothing about invitations when the load fails', async () => {
    listInvites.mockRejectedValue(new Error('network'));
    render(<InviteManager />);

    // "No invitations yet" after a failed fetch reads as "nobody has been invited", which is the
    // opposite of the truth.
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/no invitations yet/i)).not.toBeInTheDocument());
  });
});

/**
 * The link reveal — what makes an invitation deliverable when its email is not.
 *
 * The status column already tells her a send failed; until this existed there was nothing she could
 * do about it, because the plaintext token lived for the length of one function call and only its
 * hash was kept. These pin the two states that matter and the sentence that stops her looking for the
 * link again tomorrow.
 */
describe('InviteManager — the invitation link', () => {
  const LINK = 'https://ryw.test/accept-invite?token=abc123&email=priya%40example.org';

  /** Fill the form and press a button, as an operator issuing an invitation. */
  async function issueVia(label: RegExp) {
    const user = userEvent.setup();
    render(<InviteManager />);
    await user.type(screen.getByLabelText(/first name/i), 'Priya');
    await user.type(screen.getByLabelText(/^email$/i), 'priya@example.org');
    await user.click(screen.getByRole('button', { name: label }));
    return user;
  }

  it('shows the link, and says it cannot be shown again', async () => {
    issueInvite.mockResolvedValue({ message: 'Invitation sent.', invitationUrl: LINK });

    await issueVia(/send invitation/i);

    expect(await screen.findByText(LINK)).toBeInTheDocument();
    // The sentence is the point: only a fingerprint is stored, so an operator who dismisses this and
    // comes back looking for it will not find it. Saying so is what makes "re-send" discoverable.
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be shown again/i)).toBeInTheDocument();
  });

  it('shows no link when an invitation already stood', async () => {
    // Nothing was minted on this path, so there is no plaintext in existence. A reveal here would
    // have to invent one.
    issueInvite.mockResolvedValue({
      message: 'An invitation is already pending for this address. Re-send it to issue a new link.',
      invitationUrl: null,
    });

    await issueVia(/send invitation/i);

    expect(await screen.findByText(/already pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
  });

  it('copies the link to the clipboard', async () => {
    issueInvite.mockResolvedValue({ message: 'Invitation sent.', invitationUrl: LINK });
    // happy-dom ships a real clipboard, so spy on `writeText` rather than reassigning
    // `navigator.clipboard`, which is getter-only.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const user = await issueVia(/send invitation/i);
    await user.click(await screen.findByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('tells the operator to copy by hand when the clipboard refuses', async () => {
    // Clipboard writes fail on an insecure origin and under some permission policies. Silently doing
    // nothing would look like the button is broken, with the link sitting right there on screen.
    issueInvite.mockResolvedValue({ message: 'Invitation sent.', invitationUrl: LINK });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    const user = await issueVia(/send invitation/i);
    await user.click(await screen.findByRole('button', { name: /copy link/i }));

    expect(await screen.findByText(/copy it by hand/i)).toBeInTheDocument();
  });

  it('drops the link when the invitation is withdrawn', async () => {
    // Withdrawing deletes the token, so the link on screen now refuses everyone. Leaving a copy
    // button there hands over an address that fails, which is worse than having none.
    issueInvite.mockResolvedValue({ message: 'Invitation sent.', invitationUrl: LINK });
    revokeInvite.mockResolvedValue(undefined);

    const user = await issueVia(/send invitation/i);
    expect(await screen.findByText(LINK)).toBeInTheDocument();

    await user.click(
      (await rowFor('priya@example.org')).getByRole('button', { name: /withdraw/i })
    );

    await waitFor(() => expect(screen.queryByText(LINK)).not.toBeInTheDocument());
  });
});
