/**
 * The bar the full-screen frame carries.
 *
 * Two lines of markup, and both are load-bearing: moving the audit into its own route group took away
 * the platform header, so this is the only navigation a leader has on a surface they sit in for forty
 * minutes. It carried exactly one link for a version, "Leave the audit", which pointed at the
 * dashboard — a page about an account, offered to somebody in the middle of a conversation about
 * their week. What replaced it is the corner every other product they use has: their own picture,
 * light or dark, and a route to their past audits inside the menu.
 *
 * The trail on the left is the other half. It answers "where am I" without a heading, and it has to
 * degrade properly: the wordmark is always a way back to the audit, and the two context steps are the
 * parts that go first on a narrow screen.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { useSession, signOut, track, reset } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: { signOut }, useSession: () => useSession() }));
vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  useAnalytics: () => ({ track, reset }),
}));

import { ThemeProvider } from '@/hooks/use-theme';
import {
  ProgrammeChrome,
  type ProgrammeChromeProps,
} from '@/components/app/reclaim/programme-chrome';

/** The bar needs the theme context its switch reads; everything else it needs is mocked above. */
function renderChrome(props: ProgrammeChromeProps = {}) {
  return render(
    <ThemeProvider>
      <ProgrammeChrome {...props} />
    </ThemeProvider>
  );
}

const LEADER = {
  data: { user: { id: 'u1', name: 'Sam Okonjo', email: 'sam@example.org', image: null } },
  isPending: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue(LEADER);
  localStorage.clear();
});

describe('ProgrammeChrome', () => {
  it('always names the product, and makes it the way back to the audit', () => {
    renderChrome();

    expect(screen.getByRole('link', { name: 'Reclaim your week' })).toHaveAttribute(
      'href',
      '/programme'
    );
  });

  it('says where the leader is when there is a phase to name', () => {
    renderChrome({ here: 'Section 1 · Current reality' });

    expect(screen.getByText('Section 1 · Current reality')).toBeInTheDocument();
  });

  it('says nothing about a phase before a run has been read', () => {
    renderChrome();

    expect(screen.queryByText(/Phase/)).not.toBeInTheDocument();
  });

  it('renders the screen this one sits inside as a step in the trail', () => {
    renderChrome({ back: { href: '/programme/history', label: 'Your audits' }, here: '2026 Q1' });

    expect(screen.getByRole('link', { name: 'Your audits' })).toHaveAttribute(
      'href',
      '/programme/history'
    );
    expect(screen.getByText('2026 Q1')).toBeInTheDocument();
  });

  /**
   * The reason the old single link is gone. If the corner ever loses these, a leader on the audit has
   * no route to their past audits and no way to sign out without typing a URL.
   */
  describe('the corner', () => {
    it('offers the light and dark switch', () => {
      renderChrome();

      expect(
        screen.getByRole('button', { name: 'Switch between light and dark' })
      ).toBeInTheDocument();
    });

    it('reaches the audits, the account and the way out from the leader’s own menu', async () => {
      const user = userEvent.setup();
      renderChrome();

      await user.click(screen.getByRole('button', { name: 'Your account' }));

      expect(screen.getByRole('menuitem', { name: /Your audits/ })).toHaveAttribute(
        'href',
        '/programme/history'
      );
      expect(screen.getByRole('menuitem', { name: /Your profile/ })).toHaveAttribute(
        'href',
        '/profile'
      );
      expect(screen.getByRole('menuitem', { name: /Sign out/ })).toBeInTheDocument();
      // Named, so a leader knows whose account they are in before they act on it.
      expect(screen.getByText('sam@example.org')).toBeInTheDocument();
    });

    it('keeps the admin surface out of an ordinary leader’s menu', async () => {
      const user = userEvent.setup();
      renderChrome();

      await user.click(screen.getByRole('button', { name: 'Your account' }));

      expect(screen.queryByRole('menuitem', { name: /Admin/ })).not.toBeInTheDocument();
    });

    it('offers the admin surface to an admin', async () => {
      useSession.mockReturnValue({
        ...LEADER,
        data: { user: { ...LEADER.data.user, role: 'ADMIN' } },
      });
      const user = userEvent.setup();
      renderChrome();

      await user.click(screen.getByRole('button', { name: 'Your account' }));

      expect(screen.getByRole('menuitem', { name: /Admin/ })).toHaveAttribute('href', '/admin');
    });

    it('holds the bar’s shape while the session is still arriving', () => {
      useSession.mockReturnValue({ data: null, isPending: true });
      renderChrome();

      expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
      // The wordmark is still there: a slow session must not leave a leader with a blank bar.
      expect(screen.getByRole('link', { name: 'Reclaim your week' })).toBeInTheDocument();
    });
  });
});
