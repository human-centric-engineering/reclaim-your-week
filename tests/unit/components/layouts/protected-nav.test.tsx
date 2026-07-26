/**
 * ProtectedNav — the app's authenticated nav, and the seam that puts it there.
 *
 * **This file exists because its absence had a cost.** `ProtectedNav` shipped untested, with a
 * hardcoded Dashboard / Profile / Settings / Admin array, and the leaf never added a link to
 * `/programme`. The result was a participant who followed an invite link, claimed a seat, set a
 * password, and landed on account scaffolding with no route to the audit they were invited to — the
 * entitlement chain correct the whole way, and nothing pointing at the door. No test could have caught
 * it, because no test rendered this component. Now one does, and it asserts the link is present by
 * `href`, so deleting it from `lib/app/protected-nav.ts` fails here.
 *
 * Structure mirrors `public-nav.test.tsx`: `navItems` resolves at module load, so the default case
 * `vi.resetModules()` first and the override case `vi.doMock`s the scaffold and re-imports fresh.
 *
 * @see components/layouts/protected-nav.tsx · lib/app/protected-nav.ts
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

const mockUseSession = vi.fn(() => ({ data: { user: { role: 'USER' } } }));

vi.mock('@/lib/auth/client', () => ({
  useSession: () => mockUseSession(),
}));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/app/protected-nav');
  mockUseSession.mockReturnValue({ data: { user: { role: 'USER' } } });
  vi.mocked(usePathname).mockReturnValue('/');
});

describe('ProtectedNav', () => {
  it('links a signed-in leader to the programme — the app surface, not just the account pages', async () => {
    vi.resetModules();
    const { ProtectedNav } = await import('@/components/layouts/protected-nav');
    render(React.createElement(ProtectedNav));

    // The regression this file was written for: without this link the audit is unreachable from the
    // UI for someone who has just accepted an invitation.
    expect(screen.getByRole('link', { name: /your audit/i })).toHaveAttribute('href', '/programme');
  });

  it('keeps the account pages reachable alongside it', async () => {
    vi.resetModules();
    const { ProtectedNav } = await import('@/components/layouts/protected-nav');
    render(React.createElement(ProtectedNav));

    // The dashboard stays: it carries email-verification state and the profile-completion prompt.
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('puts the audit first, ahead of the account pages', async () => {
    vi.resetModules();
    const { ProtectedNav } = await import('@/components/layouts/protected-nav');
    render(React.createElement(ProtectedNav));

    const hrefs = screen.getAllByRole('link').map((el) => el.getAttribute('href'));
    // Order is the reason the seam replaces rather than appends — appending would have put the
    // product after Settings.
    expect(hrefs[0]).toBe('/programme');
  });

  it('marks the audit active on its own child routes', async () => {
    vi.resetModules();
    vi.mocked(usePathname).mockReturnValue('/programme/calendar');
    const { ProtectedNav } = await import('@/components/layouts/protected-nav');
    render(React.createElement(ProtectedNav));

    expect(screen.getByRole('link', { name: /your audit/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('hides the admin link from a non-admin, and shows it to an admin', async () => {
    vi.resetModules();
    const { ProtectedNav } = await import('@/components/layouts/protected-nav');
    const { unmount } = render(React.createElement(ProtectedNav));
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
    unmount();

    mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
    render(React.createElement(ProtectedNav));
    expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin');
  });

  it('falls back to the platform default when the app sets no override', async () => {
    vi.resetModules();
    vi.doMock('@/lib/app/protected-nav', () => ({ protectedNavItems: null }));

    const { ProtectedNav } = await import('@/components/layouts/protected-nav');
    render(React.createElement(ProtectedNav));

    // Platform default is the four account links — and, tellingly, no app surface at all.
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: /your audit/i })).toBeNull();
  });
});
