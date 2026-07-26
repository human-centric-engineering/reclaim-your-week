/**
 * EnquiryForm tests.
 *
 * The behaviour worth protecting here is the **subject composition**: the tick boxes are the only
 * record that someone asked for an invitation, and they survive only as a composed subject line on a
 * core route we do not own. If that composition breaks, an invitation request arrives looking like
 * any other message and nobody notices it was one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnquiryForm } from '@/components/app/contact/enquiry-form';

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
  APIClientError: class APIClientError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'APIClientError';
      this.code = code;
    }
  },
}));

vi.mock('@/lib/analytics/events', () => ({
  useFormAnalytics: vi.fn(() => ({ trackFormSubmitted: vi.fn() })),
}));

/** Fills the three required fields, leaving the tick boxes to the caller. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Ada Lovelace');
  await user.type(screen.getByLabelText('Your email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Your message'), 'My weeks have stopped fitting together.');
}

/** The body of the single POST the form makes. */
async function sentBody() {
  const { apiClient } = await import('@/lib/api/client');
  const call = vi.mocked(apiClient.post).mock.calls[0];
  return (call?.[1] as { body: Record<string, unknown> }).body;
}

describe('components/app/contact/enquiry-form', () => {
  let mockTrackFormSubmitted: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { apiClient } = await import('@/lib/api/client');
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: { message: 'ok' } });

    const { useFormAnalytics } = await import('@/lib/analytics/events');
    mockTrackFormSubmitted = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useFormAnalytics).mockReturnValue({
      trackFormSubmitted: mockTrackFormSubmitted,
    } as unknown as ReturnType<typeof useFormAnalytics>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('subject composition', () => {
    it('names an invitation request in the subject when that box is ticked', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await user.click(screen.getByLabelText(/would like an invitation/i));
      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(async () => {
        expect(await sentBody()).toMatchObject({ subject: 'Invitation request' });
      });
    });

    it('joins several ticked topics in the order they are listed', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      // Ticked out of order to prove the subject follows the list, not the clicks.
      await user.click(screen.getByLabelText(/interested in working with Rashmir/i));
      await user.click(screen.getByLabelText(/would like an invitation/i));
      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(async () => {
        expect(await sentBody()).toMatchObject({
          subject: 'Invitation request · Coaching enquiry',
        });
      });
    });

    it('falls back to a general enquiry when nothing is ticked', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      // The core route requires a non-empty subject, so "no ticks" must never send an empty one.
      await waitFor(async () => {
        expect(await sentBody()).toMatchObject({ subject: 'General enquiry' });
      });
    });
  });

  describe('submission', () => {
    it('sends the message verbatim and carries the empty honeypot', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(async () => {
        expect(await sentBody()).toEqual({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          subject: 'General enquiry',
          message: 'My weeks have stopped fitting together.',
          website: '',
        });
      });

      const { apiClient } = await import('@/lib/api/client');
      expect(vi.mocked(apiClient.post).mock.calls[0]?.[0]).toBe('/api/v1/contact');
    });

    it('tells an invitation asker that invitations are issued by hand', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await user.click(screen.getByLabelText(/would like an invitation/i));
      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText(/issued by hand/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    });

    it('gives everyone else the plain reply-time note', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText(/within a few working days/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/issued by hand/i)).not.toBeInTheDocument();
    });

    it('tracks the submission as a contact form submission', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(mockTrackFormSubmitted).toHaveBeenCalledWith('contact');
      });
    });
  });

  describe('validation and failure', () => {
    it('does not send until name, email and message are valid', async () => {
      const user = userEvent.setup({ delay: null });
      render(<EnquiryForm />);

      await user.click(screen.getByLabelText(/would like an invitation/i));
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });

      const { apiClient } = await import('@/lib/api/client');
      expect(apiClient.post).not.toHaveBeenCalled(); // test-review:accept no_arg_called — nothing may leave the browser while the form is invalid
    });

    it('surfaces the route’s own refusal rather than a generic message', async () => {
      const user = userEvent.setup({ delay: null });
      const { apiClient, APIClientError } = await import('@/lib/api/client');
      vi.mocked(apiClient.post).mockRejectedValue(
        new APIClientError('Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED')
      );

      render(<EnquiryForm />);
      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
      // The form stays on screen with the message intact so it can be sent again.
      expect(screen.getByLabelText('Your message')).toHaveValue(
        'My weeks have stopped fitting together.'
      );
    });
  });
});
