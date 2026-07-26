/**
 * The group-link claim form, rendered (F11).
 *
 * This screen is the first thing a leader ever sees, before an account and before consent, usually on
 * a phone in a room. So what is pinned here is mostly about what it does **not** do — ask for a
 * password, create anything, or blame the person when a link is closed — plus the one behaviour that
 * silently costs money if it breaks: the honeypot travelling with every submission.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { claimJoinLink } = vi.hoisted(() => ({ claimJoinLink: vi.fn() }));
vi.mock('@/components/app/reclaim/access/actions', () => ({ claimJoinLink }));

import { JoinForm } from '@/components/app/reclaim/access/join-form';

beforeEach(() => {
  claimJoinLink.mockReset();
  claimJoinLink.mockResolvedValue({ outcome: 'invited', message: 'Check your email.' });
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), 'Priya');
  await user.type(screen.getByLabelText(/email/i), 'priya@example.org');
  await user.click(screen.getByRole('button', { name: /send me the link/i }));
}

describe('JoinForm', () => {
  it('asks for a name and an email, and nothing else', () => {
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    // No password: the account is created later, through the emailed invitation, which is what
    // proves the address belongs to them. A password field here would imply otherwise.
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('will not submit until both fields have something in them', async () => {
    const user = userEvent.setup();
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    const submit = screen.getByRole('button', { name: /send me the link/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/first name/i), 'Priya');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/email/i), 'priya@example.org');
    expect(submit).toBeEnabled();
  });

  it('sends the honeypot field with the claim so the server can refuse a bot', async () => {
    const user = userEvent.setup();
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    await fillAndSubmit(user);

    await waitFor(() =>
      expect(claimJoinLink).toHaveBeenCalledWith('abcdefghijklmnopqrstuv', {
        name: 'Priya',
        email: 'priya@example.org',
        // Empty from a real person. The server refuses anything else.
        website: '',
      })
    );
  });

  it('hides the honeypot from people and from assistive technology', () => {
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute('aria-hidden', 'true');
    expect(honeypot).toHaveAttribute('tabindex', '-1');
  });

  it('sends people to their inbox rather than anywhere in the app', async () => {
    const user = userEvent.setup();
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    await fillAndSubmit(user);

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    // The form is gone: there is nothing more for them to do here, and leaving it on screen invites
    // a second submission that costs the room another seat.
    expect(screen.queryByRole('button', { name: /send me the link/i })).not.toBeInTheDocument();
  });

  it('offers sign-in, not a retry, to someone who already has an account', async () => {
    const user = userEvent.setup();
    claimJoinLink.mockResolvedValue({
      outcome: 'already_registered',
      message: 'You already have an account with this address.',
    });
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    await fillAndSubmit(user);

    expect(await screen.findByText(/already have an account/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('reads a repeat claim as reassurance rather than as an error', async () => {
    const user = userEvent.setup();
    claimJoinLink.mockResolvedValue({
      outcome: 'already_claimed',
      message: 'Check your email. There is an invitation waiting.',
    });
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    await fillAndSubmit(user);

    // Same headline as a first claim: their inbox is in the same state, and a second tap on a phone
    // is not a mistake to be corrected (I17).
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('shows the server’s own sentence when a link will not serve, and keeps the form', async () => {
    const user = userEvent.setup();
    claimJoinLink.mockRejectedValue(
      new Error('This link has expired. Whoever shared it can send you a new one.')
    );
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    await fillAndSubmit(user);

    // The four link-state refusals each tell a person in a room something different about what to do
    // next; flattening them into one client-side string would take that away.
    expect(await screen.findByText(/this link has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send me the link/i })).toBeInTheDocument();
  });

  it('links the privacy notice, because it is asking for personal data', async () => {
    render(<JoinForm token="abcdefghijklmnopqrstuv" />);

    expect(screen.getByRole('link', { name: /privacy notice/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });
});
