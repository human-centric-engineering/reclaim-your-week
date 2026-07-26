/**
 * The group-invite-link admin card, rendered (F11).
 *
 * What is pinned here is what Rashmir has to be able to trust while standing in front of a room: the
 * seat count she is looking at is the real one, the URL she copies is the one people will scan, and a
 * failed load never renders as "no links exist" (F7's lesson, which this card inherits deliberately).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { listInviteLinks, mintInviteLink, revokeInviteLink } = vi.hoisted(() => ({
  listInviteLinks: vi.fn(),
  mintInviteLink: vi.fn(),
  revokeInviteLink: vi.fn(),
}));
vi.mock('@/components/app/reclaim/access/actions', () => ({
  listInviteLinks,
  mintInviteLink,
  revokeInviteLink,
}));

import { LinkManager } from '@/components/app/admin/access/link-manager';

const CONFIG = { joinLinkDefaultMaxClaims: 10, joinLinkDefaultDays: 7, joinLinkMaxClaims: 50 };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'link1',
  token: 'abcdefghijklmnopqrstuv',
  label: 'Leadership offsite',
  tier: 'standard',
  maxClaims: 10,
  claimCount: 3,
  status: 'live' as const,
  expiresAt: '2026-08-02T00:00:00.000Z',
  createdAt: '2026-07-26T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  listInviteLinks.mockResolvedValue({ links: [row()], config: CONFIG });
  mintInviteLink.mockResolvedValue(row({ id: 'link2', label: 'New one' }));
});

describe('LinkManager', () => {
  it('prefills the form from the server’s own defaults', async () => {
    render(<LinkManager />);

    await waitFor(() => expect(screen.getByLabelText(/how many people/i)).toHaveValue(10));
    expect(screen.getByLabelText(/open for/i)).toHaveValue(7);
  });

  it('caps the seat input at the configured ceiling', async () => {
    render(<LinkManager />);

    // The server refuses above this too — the attribute is the courtesy, not the enforcement.
    await waitFor(() =>
      expect(screen.getByLabelText(/how many people/i)).toHaveAttribute('max', '50')
    );
  });

  it('shows how many of the seats have gone', async () => {
    render(<LinkManager />);

    expect(await screen.findByText('3 of 10')).toBeInTheDocument();
  });

  it('says nothing about links when the load fails, rather than showing an empty table', async () => {
    listInviteLinks.mockRejectedValue(new Error('network'));
    render(<LinkManager />);

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    // "No links yet" after a failed fetch is a lie, and it is the one that costs a room its door.
    expect(screen.queryByText(/no links yet/i)).not.toBeInTheDocument();
  });

  it('will not create a link without a label', async () => {
    const user = userEvent.setup();
    render(<LinkManager />);

    await waitFor(() => expect(screen.getByLabelText(/how many people/i)).toHaveValue(10));
    expect(screen.getByRole('button', { name: /create link/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/what it is for/i), 'Leadership offsite');
    expect(screen.getByRole('button', { name: /create link/i })).toBeEnabled();
  });

  it('creates a link with the numbers as numbers, not strings', async () => {
    const user = userEvent.setup();
    render(<LinkManager />);

    await waitFor(() => expect(screen.getByLabelText(/how many people/i)).toHaveValue(10));
    await user.type(screen.getByLabelText(/what it is for/i), 'Leadership offsite');
    await user.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() =>
      expect(mintInviteLink).toHaveBeenCalledWith({
        label: 'Leadership offsite',
        maxClaims: 10,
        expiryDays: 7,
      })
    );
  });

  it('surfaces the server’s refusal when a cap is above the ceiling', async () => {
    const user = userEvent.setup();
    mintInviteLink.mockRejectedValue(
      new Error('A link can be for at most 50 people. Issue a second link if you need more.')
    );
    render(<LinkManager />);

    await waitFor(() => expect(screen.getByLabelText(/how many people/i)).toHaveValue(10));
    await user.type(screen.getByLabelText(/what it is for/i), 'Too big');
    await user.click(screen.getByRole('button', { name: /create link/i }));

    expect(await screen.findByText(/at most 50 people/i)).toBeInTheDocument();
  });

  it('shows the QR and the full URL people will scan', async () => {
    const user = userEvent.setup();
    render(<LinkManager />);

    await user.click(await screen.findByRole('button', { name: /show code/i }));

    const qr = screen.getByAltText(/qr code for leadership offsite/i);
    expect(qr).toHaveAttribute('src', '/api/v1/app/reclaim/invite-links/link1/qr');
    // The URL is shown as text as well as encoded, so it can be read out or typed by anyone whose
    // camera will not cooperate.
    expect(screen.getByText(/\/join\/abcdefghijklmnopqrstuv$/)).toBeInTheDocument();
  });

  it('offers a downloadable code for a slide', async () => {
    const user = userEvent.setup();
    render(<LinkManager />);

    await user.click(await screen.findByRole('button', { name: /show code/i }));

    expect(screen.getByRole('link', { name: /download for a slide/i })).toHaveAttribute(
      'href',
      '/api/v1/app/reclaim/invite-links/link1/qr?format=png'
    );
  });

  it('offers withdraw only while a link is live', async () => {
    listInviteLinks.mockResolvedValue({
      links: [row({ id: 'a', status: 'live' }), row({ id: 'b', status: 'revoked' })],
      config: CONFIG,
    });
    render(<LinkManager />);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /withdraw/i })).toHaveLength(1)
    );
  });

  it('says plainly that withdrawing does not take back what people already claimed', async () => {
    const user = userEvent.setup();
    revokeInviteLink.mockResolvedValue(undefined);
    render(<LinkManager />);

    await user.click(await screen.findByRole('button', { name: /withdraw/i }));

    // Rashmir needs to know this before she hesitates over the button, not after.
    expect(await screen.findByText(/already claimed through it still work/i)).toBeInTheDocument();
  });
});
