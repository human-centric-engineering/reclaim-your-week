/**
 * The client list — the "Test account" badge (F19).
 *
 * This component had no test before F19 added the badge; scoped to what that change needs pinned —
 * the badge appears next to a test account, and the row count includes it (the accepted trade for a
 * screen an operator uses to find and remove them).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { listClients } = vi.hoisted(() => ({ listClients: vi.fn() }));
vi.mock('@/components/app/admin/actions', () => ({ listClients }));

import { ClientsTable } from '@/components/app/admin/clients/clients-table';

const row = (over: Record<string, unknown> = {}) => ({
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
  isPreview: false,
  ...over,
});

/** The table row for an address, so assertions cannot accidentally match another row's cell. */
async function rowFor(email: string) {
  const cell = await screen.findByText(email);
  const tr = cell.closest('tr');
  if (tr === null) throw new Error(`no row for ${email}`);
  return within(tr);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientsTable — the test-account badge', () => {
  it('badges a test account, in its own row', async () => {
    listClients.mockResolvedValue({
      clients: [
        row({ userId: 'u1', email: 'sam@example.org', isPreview: false }),
        row({ userId: 'u2', email: 'test@example.org', isPreview: true }),
      ],
      abandonedAfterDays: 21,
    });

    render(<ClientsTable />);

    expect((await rowFor('test@example.org')).getByText('Test account')).toBeInTheDocument();
    expect((await rowFor('sam@example.org')).queryByText('Test account')).not.toBeInTheDocument();
  });

  it('still counts a test account in the total shown', async () => {
    // The accepted trade: hiding it would leave an operator unable to find what she made in order to
    // remove it, so the count on this screen includes it — safe only because it is labelled.
    listClients.mockResolvedValue({
      clients: [row({ userId: 'u1', isPreview: true })],
      abandonedAfterDays: 21,
    });

    render(<ClientsTable />);

    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
  });
});
