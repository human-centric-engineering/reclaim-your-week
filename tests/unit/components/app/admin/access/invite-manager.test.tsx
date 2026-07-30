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

/**
 * Open the invite form.
 *
 * The form lives behind a button now: this tab is a ledger with a toolbar, and the form was a fixed
 * cost paid on every visit by an operator who is almost always here to read the list.
 */
async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /invite someone/i }));
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
    await openForm(user);
    await user.type(await screen.findByLabelText(/first name/i), 'Priya');
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

  it('hides the link on request, without withdrawing the invitation', async () => {
    issueInvite.mockResolvedValue({ message: 'Invitation sent.', invitationUrl: LINK });

    const user = await issueVia(/send invitation/i);
    expect(await screen.findByText(LINK)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^hide$/i }));

    expect(screen.queryByText(LINK)).not.toBeInTheDocument();
    expect(revokeInvite).not.toHaveBeenCalled();
  });

  it('keeps the form open when an invitation already stood, because re-send is in it', async () => {
    // The remedy for "already pending" is the re-send button, which lives in this form. Closing it
    // on that message would put the fix one click further away than the problem.
    issueInvite.mockResolvedValue({
      message: 'An invitation is already pending for this address. Re-send it to issue a new link.',
      invitationUrl: null,
    });

    await issueVia(/send invitation/i);

    expect(await screen.findByText(/already pending/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-send with a new link/i })).toBeInTheDocument();
    // The address is still there to re-send to, rather than cleared out from under her.
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('priya@example.org');
  });
});

/**
 * The toolbar — what makes the ledger usable once it is full.
 *
 * The screen this replaced showed every invitation ever issued, in one unfiltered table, under a form
 * nobody was using. These pin the two controls that answer "where is the one I am looking for", and
 * the distinction the empty states have to keep: *no invitations* and *none matching* are different
 * sentences, and reading one as the other is how an operator concludes nobody has been invited.
 */
describe('InviteManager — finding a row in a full ledger', () => {
  const many = [
    row({ id: 'a', email: 'priya@example.org', status: 'pending' }),
    row({ id: 'b', email: 'sam@elsewhere.com', status: 'redeemed', redeemedByName: 'Sam' }),
    row({ id: 'c', email: 'jo@elsewhere.com', status: 'revoked' }),
  ];

  it('narrows the ledger to what the search matches', async () => {
    const user = userEvent.setup();
    listInvites.mockResolvedValue(many);
    render(<InviteManager />);

    expect(await screen.findByText('priya@example.org')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search invitations/i), 'elsewhere');

    expect(screen.queryByText('priya@example.org')).not.toBeInTheDocument();
    expect(screen.getByText('sam@elsewhere.com')).toBeInTheDocument();
    expect(screen.getByText('jo@elsewhere.com')).toBeInTheDocument();
  });

  it('searches the name an invitation was redeemed under, not only the address', async () => {
    // The address on the invitation and the person who turned up are not always the same string,
    // and the one she remembers is usually the person.
    const user = userEvent.setup();
    listInvites.mockResolvedValue(many);
    render(<InviteManager />);

    await screen.findByText('sam@elsewhere.com');
    await user.type(screen.getByLabelText(/search invitations/i), 'Sam');

    expect(screen.getByText('sam@elsewhere.com')).toBeInTheDocument();
    expect(screen.queryByText('priya@example.org')).not.toBeInTheDocument();
  });

  it('narrows the ledger by status', async () => {
    const user = userEvent.setup();
    listInvites.mockResolvedValue(many);
    render(<InviteManager />);

    await screen.findByText('priya@example.org');
    await user.selectOptions(screen.getByLabelText(/filter by status/i), 'pending');

    expect(screen.getByText('priya@example.org')).toBeInTheDocument();
    expect(screen.queryByText('sam@elsewhere.com')).not.toBeInTheDocument();
  });

  it('says "none matching" rather than "none yet" when a filter empties the table', async () => {
    // "No invitations yet" in front of a filtered-out ledger reads as "nobody has been invited",
    // which is the same lie the failed-load case exists to avoid.
    const user = userEvent.setup();
    listInvites.mockResolvedValue(many);
    render(<InviteManager />);

    await screen.findByText('priya@example.org');
    await user.type(screen.getByLabelText(/search invitations/i), 'nobody');

    expect(screen.getByText(/no invitation matches that search/i)).toBeInTheDocument();
    expect(screen.queryByText(/no invitations yet/i)).not.toBeInTheDocument();
  });

  it('restores the whole ledger when the filters are cleared', async () => {
    const user = userEvent.setup();
    listInvites.mockResolvedValue(many);
    render(<InviteManager />);

    await screen.findByText('priya@example.org');
    await user.type(screen.getByLabelText(/search invitations/i), 'nobody');
    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByText('priya@example.org')).toBeInTheDocument();
    expect(screen.getByText('sam@elsewhere.com')).toBeInTheDocument();
  });

  it('reports the ledger’s size for the tab strip', async () => {
    // The count beside the tab name is only honest if it comes from the load, not from a guess.
    const onCountChange = vi.fn();
    listInvites.mockResolvedValue(many);
    render(<InviteManager onCountChange={onCountChange} />);

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(3));
  });
});
