/**
 * The client record — the "Test account" badge (F19).
 *
 * This component had no test before F19 added the badge; scoped to the one thing that change needs
 * pinned rather than writing a first full suite for a screen this branch did not otherwise touch.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { getClient } = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock('@/components/app/admin/actions', () => ({ getClient }));
vi.mock('@/components/app/admin/clients/reach-out-composer', () => ({
  ReachOutComposer: () => null,
}));

import { ClientDetail } from '@/components/app/admin/clients/client-detail';

const DETAIL = (isPreview: boolean) => ({
  client: {
    userId: 'u1',
    name: 'Sam Client',
    email: 'sam@example.org',
    joinedAt: '2026-07-01T00:00:00.000Z',
    tier: 'standard',
    auditsGranted: 1,
    auditsUsed: 0,
    windowEndsAt: null,
    policyVersion: 'draft-1',
    marketingOptIn: false,
    referredByName: null,
    inviteTier: null,
    status: 'never_started' as const,
    currentPhaseLabel: null,
    completedRuns: 0,
    lastActivityAt: null,
    chatCostUsd: null,
    lastReachedOutAt: null,
    qualification: {},
    isPreview,
  },
  context: [],
  runs: [],
  journeyHref: '/admin/framework/journeys/j1',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientDetail — the test-account badge', () => {
  it('shows the badge for a test account', async () => {
    getClient.mockResolvedValue(DETAIL(true));

    render(<ClientDetail userId="u1" />);

    expect(await screen.findByText('Test account')).toBeInTheDocument();
  });

  it('shows no badge for a real client', async () => {
    getClient.mockResolvedValue(DETAIL(false));

    render(<ClientDetail userId="u1" />);

    await screen.findByText('Sam Client');
    expect(screen.queryByText('Test account')).not.toBeInTheDocument();
  });

  it('falls back to the email as the heading when no name is on file', async () => {
    getClient.mockResolvedValue({
      ...DETAIL(false),
      client: { ...DETAIL(false).client, name: null },
    });

    render(<ClientDetail userId="u1" />);

    expect(await screen.findByRole('heading', { name: 'sam@example.org' })).toBeInTheDocument();
  });
});
