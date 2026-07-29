/**
 * Profile page tests.
 *
 * Sunrise shipped this route without a suite. It is this app's code now, and the parts worth holding
 * are the ones a refactor would quietly break: the session guard that turns a stale cookie into a
 * clean sign-in, the fields actually asked of the database, and the reading a leader gets back —
 * including the empty ones, which the page shows rather than hides on purpose.
 *
 * The two client leaves inside `ProgrammeChrome` are stubbed, matching `run-review.test.tsx`: they
 * read the session client, which is not what this suite is about.
 *
 * @see app/(programme)/profile/page.tsx
 * @see components/app/reclaim/account/profile-view.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/lib/auth/utils', () => ({
  getServerSession: vi.fn(),
}));

/** Throws the same sentinel the redirect mock does, so callers can assert execution stopped. */
vi.mock('@/lib/auth/clear-session', () => ({
  clearInvalidSession: vi.fn((returnUrl: string) => {
    throw new Error(
      `NEXT_REDIRECT:/api/auth/clear-session?returnUrl=${encodeURIComponent(returnUrl)}`
    );
  }),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/components/app/reclaim/theme-switch', () => ({ ThemeSwitch: () => null }));
vi.mock('@/components/app/reclaim/account-menu', () => ({ AccountMenu: () => null }));

import ProfilePage, { metadata } from '@/app/(programme)/profile/page';
import { getServerSession } from '@/lib/auth/utils';
import { clearInvalidSession } from '@/lib/auth/clear-session';
import { prisma } from '@/lib/db/client';

const MOCK_SESSION = {
  session: {
    id: 'session_abc',
    userId: 'user_abc',
    expiresAt: new Date(Date.now() + 86400_000),
    token: 'tok_abc',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: 'user_abc',
    email: 'alice@example.com',
    name: 'Alice Example',
    emailVerified: true,
    image: null,
    role: 'USER' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

/** A fully populated DB row. Overrides let each test empty exactly one thing. */
function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Alice Example',
    email: 'alice@example.com',
    emailVerified: true,
    image: null,
    role: 'USER',
    createdAt: new Date('2024-03-09T00:00:00Z'),
    bio: 'Runs a small foundation.',
    timezone: 'Europe/London',
    location: 'Bristol',
    ...overrides,
  };
}

async function renderPage(user: Record<string, unknown> | null = makeUser()) {
  vi.mocked(getServerSession).mockResolvedValue(MOCK_SESSION);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
  render(await ProfilePage());
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('titles the page in the words the account menu uses for it', () => {
      expect(metadata.title).toBe('Your profile');
    });
  });

  describe('authentication guard', () => {
    it('clears the session and redirects when there is no session', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT');
      expect(clearInvalidSession).toHaveBeenCalledWith('/profile');
      // The guard has to stop the page, not merely log: a null session below would throw on
      // `session.user.id` and a leader would meet a crash instead of a sign-in.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('clears the session and redirects when the session points at a user who is gone', async () => {
      vi.mocked(getServerSession).mockResolvedValue(MOCK_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(ProfilePage()).rejects.toThrow('NEXT_REDIRECT');
      expect(clearInvalidSession).toHaveBeenCalledWith('/profile');
    });
  });

  describe('the database read', () => {
    it('reads the signed-in user, and no other', async () => {
      await renderPage();

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user_abc' } })
      );
    });

    it('does not select fields this page has no business reading', async () => {
      await renderPage();

      // The page shows no phone number and no preferences, so it should not be asking for them.
      // Sunrise's version selected `phone`; dropping it is deliberate, and this is what keeps it out.
      const select = vi.mocked(prisma.user.findUnique).mock.calls[0][0].select;
      expect(select).not.toHaveProperty('phone');
      expect(select).not.toHaveProperty('preferences');
    });
  });

  describe('what a leader reads', () => {
    it('shows their name, email and where they are', async () => {
      await renderPage();

      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your profile');
      expect(screen.getByRole('heading', { level: 2, name: 'Alice Example' })).toBeInTheDocument();
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
      expect(screen.getByText('Bristol')).toBeInTheDocument();
    });

    it('spells the stored timezone out rather than showing the raw zone id', async () => {
      await renderPage(makeUser({ timezone: 'America/New_York' }));

      expect(screen.getByText('America / New York')).toBeInTheDocument();
      expect(screen.queryByText('America/New_York')).not.toBeInTheDocument();
    });

    it('shows an unset field as unset rather than hiding the row', async () => {
      await renderPage(makeUser({ location: null, timezone: null }));

      // Two empty rows, both still labelled: a page that omits what it does not have makes somebody
      // wonder what else it is not saying.
      expect(screen.getByText('Where you are')).toBeInTheDocument();
      expect(screen.getByText('Your timezone')).toBeInTheDocument();
      expect(screen.getAllByText('Not set')).toHaveLength(2);
    });

    it('shows the bio when there is one', async () => {
      await renderPage();

      expect(screen.getByText('About you')).toBeInTheDocument();
      expect(screen.getByText('Runs a small foundation.')).toBeInTheDocument();
    });

    it('omits the About section for a bio that is only whitespace', async () => {
      await renderPage(makeUser({ bio: '   ' }));

      expect(screen.queryByText('About you')).not.toBeInTheDocument();
    });

    it('says when an email is not yet confirmed', async () => {
      await renderPage(makeUser({ emailVerified: false }));

      expect(screen.getByText(/Email not yet confirmed/)).toBeInTheDocument();
    });

    it('names an administrator as one', async () => {
      await renderPage(makeUser({ role: 'ADMIN' }));

      expect(screen.getByText(/Administrator/)).toBeInTheDocument();
    });

    it('sends anyone wanting to change something to account settings', async () => {
      await renderPage();

      // The split is the platform's and a good one: this page is a reading, editing is one link away.
      expect(screen.getByRole('link', { name: 'Change these' })).toHaveAttribute(
        'href',
        '/settings'
      );
    });
  });

  describe('the frame it renders in', () => {
    it('renders the programme bar rather than the platform header', async () => {
      await renderPage();

      const bar = screen.getByRole('navigation', { name: 'Where you are' });
      expect(within(bar).getByRole('link', { name: 'Reclaim your week' })).toHaveAttribute(
        'href',
        '/programme'
      );
      expect(within(bar).getByText('Your profile')).toBeInTheDocument();
    });
  });
});
