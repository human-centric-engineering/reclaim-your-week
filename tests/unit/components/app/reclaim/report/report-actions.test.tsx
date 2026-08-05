/**
 * `<ReportActions>` — what a leader can do with the report, laid out as three named actions rather
 * than a row of identical pills (see the file's own header for what this replaced).
 *
 * `DownloadButton` is mocked here — its own fetch/blob/filename behaviour has a dedicated suite
 * (`download-button.test.tsx`). What is worth proving at this layer is what `ReportActions` itself
 * computes: the two download URLs are built from `runId`, `runId` is escaped so it cannot break out
 * of the path, the print button calls `window.print()` and nothing else, and the inline plain-text
 * link is a real anchor rather than a styled `DownloadButton`.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/app/reclaim/report/download-button', () => ({
  DownloadButton: ({
    href,
    fallbackFilename,
    tone,
    busyLabel,
    children,
  }: {
    href: string;
    fallbackFilename: string;
    tone?: string;
    busyLabel?: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      data-testid="download-button"
      data-href={href}
      data-fallback={fallbackFilename}
      data-tone={tone}
      data-busy-label={busyLabel}
    >
      {children}
    </button>
  ),
}));

import { ReportActions } from '@/components/app/reclaim/report/report-actions';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReportActions — the two things a leader downloads', () => {
  it('points the report download at this run’s report.pdf, styled as the primary action', () => {
    render(<ReportActions runId="run-1" />);

    const report = screen.getByRole('button', { name: 'Download the report' });
    expect(report).toHaveAttribute('data-href', '/api/v1/app/reclaim/runs/run-1/report.pdf');
    expect(report).toHaveAttribute('data-fallback', 'time-audit.pdf');
    expect(report).toHaveAttribute('data-tone', 'primary');
  });

  it('points the conversation download at this run’s transcript.pdf, styled as a quiet action', () => {
    render(<ReportActions runId="run-1" />);

    const transcript = screen.getByRole('button', { name: 'Download the conversation' });
    expect(transcript).toHaveAttribute(
      'data-href',
      '/api/v1/app/reclaim/runs/run-1/transcript.pdf'
    );
    expect(transcript).toHaveAttribute('data-fallback', 'time-audit-conversation.pdf');
    // Only the report gets the primary treatment — the transcript download passes no `tone` prop at
    // all, which `DownloadButton` itself defaults to 'quiet'.
    expect(transcript).not.toHaveAttribute('data-tone');
  });

  it('escapes the runId so it cannot break out of the API path', () => {
    render(<ReportActions runId="run/1 & co" />);

    const report = screen.getByRole('button', { name: 'Download the report' });
    expect(report).toHaveAttribute(
      'data-href',
      `/api/v1/app/reclaim/runs/${encodeURIComponent('run/1 & co')}/report.pdf`
    );
  });
});

describe('ReportActions — the plain-text transcript', () => {
  it('offers it as a real inline link rather than a styled download button', () => {
    render(<ReportActions runId="run-1" />);

    const link = screen.getByRole('link', { name: 'a plain text file' });
    expect(link).toHaveAttribute('href', '/api/v1/app/reclaim/runs/run-1/transcript.txt');
    expect(link).toHaveAttribute('download');
    // Two DownloadButtons only — the text twin does not get a third pill.
    expect(screen.getAllByTestId('download-button')).toHaveLength(2);
  });
});

describe('ReportActions — printing', () => {
  it('opens the browser print dialogue and does nothing else', async () => {
    // happy-dom does not implement window.print, so there is nothing to spy on yet — define it first.
    const printSpy = vi.fn();
    window.print = printSpy;
    const user = userEvent.setup();
    render(<ReportActions runId="run-1" />);

    await user.click(screen.getByRole('button', { name: 'Print this page' }));

    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
