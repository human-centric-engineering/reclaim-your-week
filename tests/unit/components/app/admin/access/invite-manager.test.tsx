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
