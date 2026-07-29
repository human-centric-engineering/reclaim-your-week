/**
 * The bar the public pages wear.
 *
 * What this must get right is the corner. The platform header carries `UserButton`, which cannot
 * offer `/programme/history` — so a signed-in leader who followed "Privacy" out of the audit's own
 * footer had no way back to the run they were in the middle of. That is the defect this component
 * exists to fix, and the rest of the bar is only what makes it not look like a second product: the
 * links stay on the fork-owned seam, the labels stay visible on a phone (unlike the platform nav,
 * which hides them below `sm` and would render our icon-less items as nothing at all), and signed out
 * the corner offers the one door an invite-gated product has.
 *
 * `usePathname` is globally mocked to '/' (tests/setup.ts).
 *
 * @see /components/app/public/site-header.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import * as React from 'react';

const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/client', () => ({
  authClient: { signOut: vi.fn() },
  useSession: () => mockUseSession(),
}));

vi.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({ track: vi.fn(), reset: vi.fn() }),
  EVENTS: { USER_LOGGED_OUT: 'user_logged_out' },
}));

import { ThemeProvider } from '@/hooks/use-theme';
import { SiteHeader } from '@/components/app/public/site-header';
import { BRAND } from '@/lib/brand';

/** The bar needs the theme context its switch reads; everything else it needs is mocked above. */
function renderHeader(Header: React.ComponentType = SiteHeader) {
  return render(
    <ThemeProvider>
      <Header />
    </ThemeProvider>
  );
}

function signedIn() {
  mockUseSession.mockReturnValue({
    data: { user: { id: 'u1', name: 'Sam Okafor', email: 'sam@example.com', image: null } },
    isPending: false,
  });
}

function signedOut() {
  mockUseSession.mockReturnValue({ data: null, isPending: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  signedOut();
});

afterEach(() => {
  vi.mocked(usePathname).mockReturnValue('/'); // restore the global mock default
});

describe('SiteHeader', () => {
  it('carries a signed-in leader back to their audits — the link the platform header cannot hold', async () => {
    signedIn();
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: 'Your account' }));

    const audits = await screen.findByRole('menuitem', { name: /Your audits/ });
    expect(audits.closest('a')).toHaveAttribute('href', '/programme/history');
  });

  it('offers the one door an invite-gated product has when nobody is signed in', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    // No "Create account": v1 is invite-gated (F8), so that door opens on an empty room.
    expect(screen.queryByRole('link', { name: /create account/i })).toBeNull();
  });

  it('renders the fork-owned nav rather than a list of its own', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
  });

  it('takes its links from the seam, so header and footer cannot disagree about the public pages', async () => {
    vi.resetModules();
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: [{ href: '/pricing', label: 'Pricing' }],
      footerNavItems: null,
      footerLegalItems: null,
    }));

    // Both re-imported from the reset registry: a fresh module graph means a fresh theme context, and
    // the statically-imported provider above would no longer be the one the fresh switch reads.
    const { SiteHeader: Overridden } = await import('@/components/app/public/site-header');
    const { ThemeProvider: FreshTheme } = await import('@/hooks/use-theme');
    render(
      <FreshTheme>
        <Overridden />
      </FreshTheme>
    );

    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    // Replacement, not append — the same contract the platform components honour.
    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();

    vi.doUnmock('@/lib/app/public-nav');
    vi.resetModules();
  });

  it('marks the page being read, so the bar says where you are', () => {
    vi.mocked(usePathname).mockReturnValue('/privacy');
    renderHeader();

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('does not light Home on every page, since every path is a prefix of it', () => {
    vi.mocked(usePathname).mockReturnValue('/contact');
    renderHeader();

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps its labels as text, which is the whole nav on a phone', () => {
    renderHeader();

    // The platform nav wraps each label in `hidden sm:inline`; ours must not, because these items
    // carry no icons and would leave a narrow screen with an empty bar.
    for (const label of ['Home', 'About', 'Privacy', 'Contact']) {
      expect(screen.getByRole('link', { name: label }).className).not.toContain('hidden');
    }
  });

  it('returns to the landing page from the wordmark, which is the brand seam and not a literal', () => {
    renderHeader();

    // `BRAND.name` rather than "Reclaim Your Week": the name is env-driven (`NEXT_PUBLIC_APP_NAME`),
    // and a hard-coded string here would pass while the bar showed something else in production.
    expect(screen.getByRole('link', { name: BRAND.name })).toHaveAttribute('href', '/');
  });
});
