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
import userEvent from '@testing-library/user-event';

/*
 * The bar's two corner controls stand in as nothing here. Both reach for a provider this suite has no
 * reason to mount (`useTheme`, `useAnalytics`), and neither is what any assertion below is about; each
 * has its own suite. Stubbing them keeps this file about the surface it names.
 */
vi.mock('@/components/app/reclaim/theme-switch', () => ({ ThemeSwitch: () => null }));
vi.mock('@/components/app/reclaim/account-menu', () => ({ AccountMenu: () => null }));

const { readRuns, abandonRun } = vi.hoisted(() => ({ readRuns: vi.fn(), abandonRun: vi.fn() }));
vi.mock('@/components/app/reclaim/history/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/reclaim/history/actions')>()),
  readRuns,
  abandonRun,
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

describe('AuditHistory — letting an open audit go (F16 t-1)', () => {
  beforeEach(() => {
    abandonRun.mockReset();
  });

  it('asks once before letting go, and does nothing on the first click', async () => {
    readRuns.mockResolvedValue([OPEN]);
    const user = userEvent.setup();
    render(<AuditHistory />);

    await user.click(
      await screen.findByRole('button', { name: /start again from the beginning/i })
    );

    expect(screen.getByText(/Everything you have said stays here/)).toBeInTheDocument();
    expect(abandonRun).not.toHaveBeenCalled();
  });

  it('backs out of the confirmation without abandoning anything', async () => {
    readRuns.mockResolvedValue([OPEN]);
    const user = userEvent.setup();
    render(<AuditHistory />);

    await user.click(
      await screen.findByRole('button', { name: /start again from the beginning/i })
    );
    await user.click(screen.getByRole('button', { name: /keep this one/i }));

    expect(screen.queryByText(/Everything you have said stays here/)).not.toBeInTheDocument();
    expect(abandonRun).not.toHaveBeenCalled();
  });

  it('abandons the run and reloads the list on confirmation', async () => {
    readRuns.mockResolvedValueOnce([OPEN]).mockResolvedValueOnce([]);
    abandonRun.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuditHistory />);

    await user.click(
      await screen.findByRole('button', { name: /start again from the beginning/i })
    );
    await user.click(screen.getByRole('button', { name: /yes, start again/i }));

    expect(abandonRun).toHaveBeenCalledWith('run-open');
    // The list is re-read rather than trusted to update itself — the leader now sees whatever the
    // server actually holds, which for a run that just started over is "nothing open".
    await screen.findByRole('link', { name: /begin an audit/i });
  });

  it('surfaces a refusal and leaves the confirmation open to try again', async () => {
    readRuns.mockResolvedValue([OPEN]);
    abandonRun.mockRejectedValue(new Error('That audit is already finished'));
    const user = userEvent.setup();
    render(<AuditHistory />);

    await user.click(
      await screen.findByRole('button', { name: /start again from the beginning/i })
    );
    await user.click(screen.getByRole('button', { name: /yes, start again/i }));

    expect(await screen.findByText(/That audit is already finished/)).toBeInTheDocument();
    // The confirmation stays up — a failed attempt should not silently drop the leader back to the
    // unconfirmed state, which would read as though nothing had been asked at all.
    expect(screen.getByRole('button', { name: /yes, start again/i })).toBeInTheDocument();
  });
});
