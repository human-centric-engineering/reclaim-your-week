/**
 * The shared-results inbox — the "Test account" badge (F19).
 *
 * This component had no test before F19 added the badge. A fabricated share must not read as a real
 * leader waiting for a reply, which is what this pins.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { readInbox } = vi.hoisted(() => ({ readInbox: vi.fn() }));
vi.mock('@/components/app/admin/actions', () => ({ readInbox }));

import { SharedResults } from '@/components/app/admin/shared/shared-results';

const AGGREGATE = {
  cohort: 0,
  minimumCohort: 5,
  suppressed: true,
  buckets: [],
  mostOftenEmpty: [],
};

const share = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  name: 'Sam Client',
  email: 'sam@example.org',
  auditRunId: 'run-1',
  sharedAt: '2026-07-30T00:00:00.000Z',
  quarter: '2026 Q3',
  feedback: null,
  transcriptConsent: false,
  isPreview: false,
  ...over,
});

// The row shows the name when one is on file, and only falls back to the email otherwise — so the
// lookup has to match what actually renders, not the raw fixture field.
async function rowFor(displayedAs: string) {
  const el = await screen.findByText(displayedAs);
  const li = el.closest('li');
  if (li === null) throw new Error(`no row for ${displayedAs}`);
  return within(li);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SharedResults — the test-account badge', () => {
  it('badges a share from a test account', async () => {
    readInbox.mockResolvedValue({
      shared: [
        share({ userId: 'u1', name: 'Sam Client', isPreview: false }),
        share({
          userId: 'u2',
          name: 'Test Leader',
          email: 'test@example.org',
          isPreview: true,
          auditRunId: 'run-2',
        }),
      ],
      aggregate: AGGREGATE,
    });

    render(<SharedResults />);

    expect((await rowFor('Test Leader')).getByText('Test account')).toBeInTheDocument();
    expect((await rowFor('Sam Client')).queryByText('Test account')).not.toBeInTheDocument();
  });

  it('falls back to the email when no name is on file', async () => {
    readInbox.mockResolvedValue({
      shared: [share({ name: null, email: 'noname@example.org' })],
      aggregate: AGGREGATE,
    });

    render(<SharedResults />);

    expect(await screen.findByText('noname@example.org')).toBeInTheDocument();
  });
});
