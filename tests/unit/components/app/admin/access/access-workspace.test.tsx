/**
 * The Access screen's frame — one header, two tabs, two ledgers.
 *
 * What is pinned here is the reason the tabs exist at all. The screen this replaced stacked form,
 * table, form, table, which reads fine with one row in each and becomes unusable the moment either
 * ledger fills. So: only one job is in view at a time, and the counts beside the tab names are true
 * before anything has been clicked — the second is what stops the strip being navigation only, and
 * it is the part a lazy `TabsContent` would quietly break.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The URL, which is where the open tab actually lives.
 *
 * `useUrlTabs` derives the active tab from the query string and writes back through
 * `router.replace`, so a click and the resulting state are two halves of a round trip through the
 * router. The mock keeps them apart deliberately: one test asserts the write, another sets the query
 * string and asserts what renders. Faking a router that re-renders would test the fake.
 */
const { replace, searchParams } = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: { current: new URLSearchParams() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/programme/access',
  useSearchParams: () => searchParams.current,
}));

const { listInvites, listInviteLinks } = vi.hoisted(() => ({
  listInvites: vi.fn(),
  listInviteLinks: vi.fn(),
}));
vi.mock('@/components/app/reclaim/access/actions', () => ({
  listInvites,
  issueInvite: vi.fn(),
  revokeInvite: vi.fn(),
  grantAnotherAudit: vi.fn(),
  listInviteLinks,
  mintInviteLink: vi.fn(),
  revokeInviteLink: vi.fn(),
}));

import { AccessWorkspace } from '@/components/app/admin/access/access-workspace';

const invite = {
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
};

const link = {
  id: 'link1',
  token: 'abcdefghijklmnopqrstuv',
  label: 'Leadership offsite',
  tier: 'standard',
  maxClaims: 10,
  claimCount: 3,
  status: 'live' as const,
  expiresAt: '2026-08-02T00:00:00.000Z',
  createdAt: '2026-07-26T00:00:00.000Z',
};

const CONFIG = { joinLinkDefaultMaxClaims: 10, joinLinkDefaultDays: 7, joinLinkMaxClaims: 50 };

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  listInvites.mockResolvedValue([invite, { ...invite, id: 'inv2', email: 'sam@example.org' }]);
  listInviteLinks.mockResolvedValue({ links: [link], config: CONFIG });
});

/**
 * Which tab panel a row is sitting in, by its `data-state`.
 *
 * Not `toBeVisible`: the inactive panel is force-mounted and hidden by a Tailwind class, and no
 * stylesheet is loaded under Vitest — every node in the document would report as visible. The panel's
 * own state is the thing being asserted anyway.
 */
function panelStateFor(text: string): string | null {
  const panel = screen.getByText(text).closest('[role="tabpanel"]');
  if (panel === null) throw new Error(`"${text}" is not inside a tab panel`);
  return panel.getAttribute('data-state');
}

describe('AccessWorkspace', () => {
  it('opens on the people ledger, with the group links out of the way', async () => {
    render(<AccessWorkspace />);

    expect(await screen.findByText('priya@example.org')).toBeInTheDocument();
    expect(panelStateFor('priya@example.org')).toBe('active');
    // Rendered but hidden, so the tab strip can count it — not on screen competing for attention.
    expect(panelStateFor('Leadership offsite')).toBe('inactive');
  });

  it('counts both ledgers before either tab is opened', async () => {
    // The inactive tab is force-mounted for exactly this: a count that only appears once you click
    // the tab is not information, it is a reward for guessing.
    render(<AccessWorkspace />);

    const links = await screen.findByRole('tab', { name: /group links/i });
    await waitFor(() => expect(links).toHaveTextContent('1'));
    expect(await screen.findByRole('tab', { name: /people/i })).toHaveTextContent('2');
  });

  it('opens on the ledger the URL names, so a sent link lands where it says', async () => {
    searchParams.current = new URLSearchParams('tab=links');
    render(<AccessWorkspace />);

    expect(await screen.findByText('Leadership offsite')).toBeInTheDocument();
    expect(panelStateFor('Leadership offsite')).toBe('active');
    expect(panelStateFor('priya@example.org')).toBe('inactive');
  });

  it('puts the open tab in the URL, so the screen can be linked to', async () => {
    const user = userEvent.setup();
    render(<AccessWorkspace />);

    await user.click(await screen.findByRole('tab', { name: /group links/i }));

    expect(replace).toHaveBeenCalledWith('/admin/programme/access?tab=links', { scroll: false });
  });
});
