/**
 * The leader's own menu, in the programme bar.
 *
 * What this must get right: **your audits** leads the menu (the surface this component exists to
 * carry, per its own docstring), the menu never offers an affordance signed out, and sign-out tracks
 * then resets analytics before the hard navigation home — mirroring `components/auth/user-button.tsx`
 * and `components/auth/logout-button.tsx`, which this component deliberately does not reuse (it needs
 * a leaf route, `/programme/history`, that those platform components cannot carry).
 *
 * @see /components/app/reclaim/account-menu.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUseSession = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/client', () => ({
  authClient: { signOut: mockSignOut },
  useSession: () => mockUseSession(),
}));

const mockTrack = vi.hoisted(() => vi.fn());
const mockReset = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({ track: mockTrack, reset: mockReset }),
  EVENTS: { USER_LOGGED_OUT: 'user_logged_out' },
}));

import { AccountMenu } from '@/components/app/reclaim/account-menu';

const USER = {
  id: 'user-1',
  name: 'Sam Okafor',
  email: 'sam@example.com',
  image: null,
  role: 'USER',
};

function signedIn(overrides: Partial<typeof USER> = {}) {
  mockUseSession.mockReturnValue({
    data: { user: { ...USER, ...overrides } },
    isPending: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTrack.mockResolvedValue(undefined);
  mockReset.mockResolvedValue(undefined);
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountMenu', () => {
  it('renders a same-sized placeholder while the session is pending, so the bar does not jump', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });

    const { container } = render(<AccountMenu />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const placeholder = container.querySelector('[aria-hidden]');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveClass('h-8', 'w-8', 'rounded-full');
  });

  it('renders nothing signed out, rather than a login affordance behind the edge gate', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    const { container } = render(<AccountMenu />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stands the caller’s own affordance in the corner signed out, for the pages anyone can reach', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(<AccountMenu signedOut={<a href="/login">Sign in</a>} />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows the placeholder, not the signed-out affordance, while the session is still unknown', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });

    const { container } = render(<AccountMenu signedOut={<a href="/login">Sign in</a>} />);

    // Otherwise a signed-in leader is offered "Sign in" for a moment on every public page load.
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument();
  });

  it('shows the initials of the signed-in user on the trigger', () => {
    signedIn();
    render(<AccountMenu />);

    const trigger = screen.getByRole('button', { name: 'Your account' });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('SO')).toBeInTheDocument();
  });

  it('falls back to "You" when the session has no name, rather than showing empty initials', () => {
    signedIn({ name: '' });
    render(<AccountMenu />);

    expect(screen.getByText('Y')).toBeInTheDocument();
  });

  it('leads the menu with the leaf route this component exists to carry', async () => {
    signedIn();
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Your account' }));

    const items = await screen.findAllByRole('menuitem');
    // "Your audits" is first: the surface a leader comes back for, per the component's own docstring.
    expect(items[0]).toHaveTextContent('Your audits');
    expect(items[0].closest('a')).toHaveAttribute('href', '/programme/history');
  });

  it('offers the profile and settings links the platform user-button cannot carry here', async () => {
    signedIn();
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Your account' }));

    const profile = await screen.findByRole('menuitem', { name: /Your profile/ });
    const settings = screen.getByRole('menuitem', { name: /Account settings/ });
    expect(profile.closest('a')).toHaveAttribute('href', '/profile');
    expect(settings.closest('a')).toHaveAttribute('href', '/settings');
  });

  it('shows the signed-in user’s name and email in the menu label', async () => {
    signedIn();
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Your account' }));

    expect(await screen.findByText('Sam Okafor')).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
  });

  it('offers an admin link only for an ADMIN session', async () => {
    signedIn({ role: 'ADMIN' });
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Your account' }));

    const admin = await screen.findByRole('menuitem', { name: /Admin/ });
    expect(admin.closest('a')).toHaveAttribute('href', '/admin');
  });

  it('hides the admin link for a non-admin session', async () => {
    signedIn({ role: 'USER' });
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Your account' }));

    await screen.findByRole('menuitem', { name: /Your audits/ });
    expect(screen.queryByRole('menuitem', { name: /Admin/ })).not.toBeInTheDocument();
  });

  describe('signing out', () => {
    it('tracks the logout event, resets analytics identity, then hard-navigates home, in that order', async () => {
      signedIn();
      const user = userEvent.setup();
      const callOrder: string[] = [];

      mockSignOut.mockImplementation(
        async (options: { fetchOptions?: { onSuccess?: () => Promise<void> | void } }) => {
          await options.fetchOptions?.onSuccess?.();
        }
      );
      mockTrack.mockImplementation(() => {
        callOrder.push('track');
        return Promise.resolve();
      });
      mockReset.mockImplementation(() => {
        callOrder.push('reset');
        return Promise.resolve();
      });

      render(<AccountMenu />);
      await user.click(screen.getByRole('button', { name: 'Your account' }));
      await user.click(await screen.findByRole('menuitem', { name: /Sign out/ }));

      await waitFor(() => {
        expect(mockTrack).toHaveBeenCalledWith('user_logged_out');
        expect(mockReset).toHaveBeenCalled(); // test-review:accept no_arg_called — callback-fired guard;
        expect(window.location.href).toBe('/');
      });
      expect(callOrder).toEqual(['track', 'reset']);
    });

    /**
     * The menu is held open for this one item, and that is the whole point of the label.
     *
     * Radix dismisses on select by default, which unmounted the item before the request it had just
     * started could settle — so "Signing out…" was state nothing could ever display. `onSelect` +
     * `preventDefault` keeps it mounted, and this pins the behaviour in the session where a leader
     * would actually meet it: press, and the answer is still on screen.
     */
    it('shows "Signing out…" in the open menu while the request is still in flight', async () => {
      signedIn();
      const user = userEvent.setup();
      mockSignOut.mockImplementation(() => new Promise(() => {}));

      render(<AccountMenu />);
      await user.click(screen.getByRole('button', { name: 'Your account' }));
      await user.click(await screen.findByRole('menuitem', { name: /Sign out/ }));

      // No reopen: the menu the leader pressed in is the menu still showing them what happened.
      expect(screen.getByRole('menu')).toBeInTheDocument();
      const item = await screen.findByRole('menuitem', { name: 'Signing out…' });
      expect(item).toHaveAttribute('aria-disabled', 'true');
    });

    it('reverts to an enabled "Sign out" item once the server refuses the request', async () => {
      signedIn();
      const user = userEvent.setup();
      mockSignOut.mockImplementation(
        async (options: { fetchOptions?: { onError?: () => void } }) => {
          options.fetchOptions?.onError?.();
        }
      );

      render(<AccountMenu />);
      await user.click(screen.getByRole('button', { name: 'Your account' }));
      await user.click(await screen.findByRole('menuitem', { name: /Sign out/ }));

      // Neither the tracking nor the hard navigation ran, since the sign-out itself never succeeded.
      expect(mockTrack).not.toHaveBeenCalled(); // test-review:accept no_arg_called — error-path guard: function must not be called;
      expect(window.location.href).toBe('');

      // The menu is still open, which is what makes the recovery visible: the item goes back to
      // "Sign out" and can be pressed again, rather than leaving the leader on a dead menu.
      const item = await screen.findByRole('menuitem', { name: 'Sign out' });
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('reverts to enabled after authClient.signOut throws rather than rejecting through fetchOptions', async () => {
      signedIn();
      const user = userEvent.setup();
      mockSignOut.mockRejectedValue(new Error('network down'));

      render(<AccountMenu />);
      await user.click(screen.getByRole('button', { name: 'Your account' }));

      await expect(
        user.click(await screen.findByRole('menuitem', { name: /Sign out/ }))
      ).resolves.not.toThrow();

      const item = await screen.findByRole('menuitem', { name: 'Sign out' });
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
});
