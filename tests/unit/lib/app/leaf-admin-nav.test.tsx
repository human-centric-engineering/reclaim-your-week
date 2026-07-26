/**
 * Tests: the Reclaim Your Week admin nav section's active-state contract.
 *
 * Every item in this section lives *under* `/admin/programme`, which is also the
 * overview item's own href. The sidebar's default rule is prefix-based, so
 * without `exact: true` on the overview the sidebar lights two entries at once on
 * every sub-route — and the wrong one reads as "you are here". This renders the
 * real `AdminSidebar` against the real registration rather than asserting on the
 * flag, so it fails if either the nav config or the sidebar's rule regresses.
 *
 * @see lib/app/leaf-admin-nav.ts · components/admin/admin-sidebar.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { initAppNav } from '@/lib/app/admin-nav';
import { __resetNavRegistryForTests } from '@/lib/admin-nav/registry';

const pathnameMock = vi.fn(() => '/admin/programme');

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

/** The sidebar polls an approvals-count endpoint on mount; it is not under test. */
function stubCountsFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { counts: { paused_for_approval: 0, pending: 0, running: 0 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
  );
}

function programmeLink(href: string): HTMLElement {
  const link = screen.getAllByRole('link').find((el) => el.getAttribute('href') === href);
  expect(link, `link for ${href} not found`).toBeDefined();
  return link as HTMLElement;
}

describe('Reclaim Your Week admin nav — active state', () => {
  beforeEach(() => {
    // The sidebar registers sections once, at module load; the afterEach reset below
    // (which keeps this suite from bleeding into others) empties the registry, so
    // re-run the wiring here. Registration is idempotent by section title.
    initAppNav();
    pathnameMock.mockReset();
    pathnameMock.mockReturnValue('/admin/programme');
    stubCountsFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __resetNavRegistryForTests();
  });

  it('highlights Programme overview on its own route', () => {
    render(<AdminSidebar />);

    expect(programmeLink('/admin/programme')).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/admin/programme/clients', '/admin/programme/clients'],
    ['/admin/programme/clients/user_123', '/admin/programme/clients'],
    ['/admin/programme/shared', '/admin/programme/shared'],
    ['/admin/programme/content', '/admin/programme/content'],
    ['/admin/programme/access', '/admin/programme/access'],
  ])('on %s, only %s is highlighted — not the overview', (pathname, expectedHref) => {
    pathnameMock.mockReturnValue(pathname);
    render(<AdminSidebar />);

    expect(programmeLink(expectedHref)).toHaveAttribute('aria-current', 'page');
    expect(programmeLink('/admin/programme')).not.toHaveAttribute('aria-current', 'page');
  });

  it('leaves no sub-route unclaimed — every programme item is reachable as active', () => {
    // Guards the other half of `exact: true`: a route under /admin/programme with no
    // matching item would now highlight nothing at all.
    for (const href of [
      '/admin/programme',
      '/admin/programme/clients',
      '/admin/programme/shared',
      '/admin/programme/content',
      '/admin/programme/access',
    ]) {
      pathnameMock.mockReturnValue(href);
      const { unmount } = render(<AdminSidebar />);
      expect(programmeLink(href), `${href} highlights nothing`).toHaveAttribute(
        'aria-current',
        'page'
      );
      unmount();
    }
  });
});
