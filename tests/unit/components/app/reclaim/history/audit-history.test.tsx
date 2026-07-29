/**
 * The audit history.
 *
 * The distinction this screen has to get right is between an audit that continues and one that
 * opens for reading. Send an open audit to the read-only page and the leader meets a screen that
 * cannot do the one thing they came for; send a finished one into `/programme` and they meet the
 * entry screen for a *new* audit, which is worse, because the run they were looking for is not
 * there and nothing says why.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * The bar's two corner controls stand in as nothing here. Both reach for a provider this suite has no
 * reason to mount (`useTheme`, `useAnalytics`), and neither is what any assertion below is about; each
 * has its own suite. Stubbing them keeps this file about the surface it names.
 */
vi.mock('@/components/app/reclaim/theme-switch', () => ({ ThemeSwitch: () => null }));
vi.mock('@/components/app/reclaim/account-menu', () => ({ AccountMenu: () => null }));

const { readRuns } = vi.hoisted(() => ({ readRuns: vi.fn() }));
vi.mock('@/components/app/reclaim/history/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/reclaim/history/actions')>()),
  readRuns,
}));

import { AuditHistory } from '@/components/app/reclaim/history/audit-history';

const FINISHED = {
  id: 'run-finished',
  quarter: '2026 Q1',
  status: 'complete',
  startedAt: '2026-01-04T09:00:00.000Z',
  completedAt: '2026-01-06T17:30:00.000Z',
  hasConversation: true,
  progress: null,
};

const OPEN = {
  id: 'run-open',
  quarter: null,
  status: 'in_progress',
  startedAt: '2026-07-02T08:00:00.000Z',
  completedAt: null,
  hasConversation: false,
  progress: { phaseKey: 'phase-2-energy', phaseLabel: 'Energy', phaseIndex: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuditHistory', () => {
  it('opens a finished audit for reading, at its own page', async () => {
    readRuns.mockResolvedValue([FINISHED]);
    render(<AuditHistory />);

    const link = await screen.findByRole('link', { name: /2026 Q1/ });
    expect(link).toHaveAttribute('href', '/programme/history/run-finished');
    expect(screen.getByText(/Finished 6 January 2026/)).toBeInTheDocument();
  });

  it('hands an unfinished audit back to the audit itself, which is what can continue it', async () => {
    readRuns.mockResolvedValue([OPEN, FINISHED]);
    render(<AuditHistory />);

    const link = await screen.findByRole('link', { name: /Take this up again/ });
    expect(link).toHaveAttribute('href', '/programme');
  });

  it('names the section an unfinished audit stopped at, so coming back does not start with guessing', async () => {
    readRuns.mockResolvedValue([OPEN]);
    render(<AuditHistory />);

    expect(await screen.findByText(/section 2, Energy/)).toBeInTheDocument();
  });

  it('invites a first audit rather than showing an empty list', async () => {
    readRuns.mockResolvedValue([]);
    render(<AuditHistory />);

    const link = await screen.findByRole('link', { name: /Begin an audit/ });
    expect(link).toHaveAttribute('href', '/programme');
  });

  it('says so plainly when the audits cannot be read', async () => {
    readRuns.mockRejectedValue(new Error('nope'));
    render(<AuditHistory />);

    expect(await screen.findByText(/could not load your audits/)).toBeInTheDocument();
  });
});
