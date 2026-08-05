/**
 * `<DownloadButton>` — the fetch-to-blob download that replaced a plain anchor (see the file's own
 * header comment for why). The behaviour worth proving is not "fetch was called" but what the
 * component does with what comes back: the filename is read off `Content-Disposition` rather than
 * guessed, a failed response or a network error both land on the same plain-sentence failure state,
 * and the control is disabled while it is working so a leader cannot fire a second request underneath
 * the first.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DownloadButton } from '@/components/app/reclaim/report/download-button';

const fetchMock = vi.fn();

/** Every anchor the component creates, in creation order — the only way to read `.download` back. */
let createdAnchors: HTMLAnchorElement[];

function makeResponse(over: Partial<Response> & { headers?: Headers } = {}): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    blob: async () => new Blob(['pdf-bytes']),
    ...over,
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  createdAnchors = [];
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: unknown) => {
    const el = realCreateElement(tag, opts as ElementCreationOptions);
    if (tag === 'a') createdAnchors.push(el as HTMLAnchorElement);
    return el;
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DownloadButton — the resting state', () => {
  it('shows the label it was given and is not disabled', () => {
    render(
      <DownloadButton
        href="/api/v1/app/reclaim/runs/run-1/report.pdf"
        fallbackFilename="report.pdf"
      >
        Download the report
      </DownloadButton>
    );

    const button = screen.getByRole('button', { name: 'Download the report' });
    expect(button).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('carries the primary treatment only when asked for it', () => {
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="report.pdf" tone="primary">
        Download the report
      </DownloadButton>
    );

    // `report-actions.tsx` is the only caller that opts into this; everything else is `quiet`. The
    // class itself is the only observable difference the `tone` prop makes.
    expect(screen.getByRole('button', { name: 'Download the report' }).className).toContain(
      'bg-primary'
    );
  });
});

describe('DownloadButton — while it is working', () => {
  it('shows the busy label and disables the button until the fetch settles', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    const user = userEvent.setup();

    render(
      <DownloadButton
        href="/api/v1/app/reclaim/runs/run-1/report.pdf"
        fallbackFilename="report.pdf"
        busyLabel="Making your report…"
      >
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    expect(screen.getByRole('button', { name: 'Making your report…' })).toBeDisabled();

    resolveFetch(makeResponse());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Download the report' })).toBeEnabled()
    );
  });
});

describe('DownloadButton — the filename it saves under', () => {
  it('fetches the given href', async () => {
    fetchMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();
    render(
      <DownloadButton
        href="/api/v1/app/reclaim/runs/run-1/report.pdf"
        fallbackFilename="report.pdf"
      >
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run-1/report.pdf')
    );
  });

  it('reads a quoted filename off Content-Disposition rather than guessing one', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        headers: new Headers({
          'content-disposition': 'attachment; filename="time-audit-sam-2026-07-29.pdf"',
        }),
      })
    );
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="fallback.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    await waitFor(() => expect(createdAnchors).toHaveLength(1));
    expect(createdAnchors[0].download).toBe('time-audit-sam-2026-07-29.pdf');
  });

  it('reads an unquoted filename too', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        headers: new Headers({ 'content-disposition': 'attachment; filename=plain.pdf' }),
      })
    );
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="fallback.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    await waitFor(() => expect(createdAnchors).toHaveLength(1));
    expect(createdAnchors[0].download).toBe('plain.pdf');
  });

  it('falls back to the given filename when the server sends no header at all', async () => {
    fetchMock.mockResolvedValue(makeResponse({ headers: new Headers() }));
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="time-audit.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    await waitFor(() => expect(createdAnchors).toHaveLength(1));
    expect(createdAnchors[0].download).toBe('time-audit.pdf');
  });

  it('falls back to the given filename when the header has no filename in it', async () => {
    // Distinct from "no header at all": here Content-Disposition is present but carries no
    // `filename=` attribute, so neither regex matches and the fallback has to be reached the long way.
    fetchMock.mockResolvedValue(
      makeResponse({ headers: new Headers({ 'content-disposition': 'attachment' }) })
    );
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="time-audit.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    await waitFor(() => expect(createdAnchors).toHaveLength(1));
    expect(createdAnchors[0].download).toBe('time-audit.pdf');
  });
});

describe('DownloadButton — when the download does not work', () => {
  it('shows a plain failure sentence when the server answers with an error status', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: false, status: 500 }));
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="report.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    expect(
      await screen.findByText('That did not download. You can try again.')
    ).toBeInTheDocument();
    // Not left spinning, and no anchor was ever built for a response that never arrived.
    expect(screen.getByRole('button', { name: 'Download the report' })).toBeEnabled();
    expect(createdAnchors).toHaveLength(0);
  });

  it('shows the same failure sentence when the fetch itself throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="report.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    expect(
      await screen.findByText('That did not download. You can try again.')
    ).toBeInTheDocument();
  });

  it('clears the failure once a retry succeeds', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ ok: false, status: 500 }));
    const user = userEvent.setup();
    render(
      <DownloadButton href="/report.pdf" fallbackFilename="report.pdf">
        Download the report
      </DownloadButton>
    );

    await user.click(screen.getByRole('button', { name: 'Download the report' }));
    await screen.findByText('That did not download. You can try again.');

    fetchMock.mockResolvedValueOnce(makeResponse());
    await user.click(screen.getByRole('button', { name: 'Download the report' }));

    await waitFor(() =>
      expect(
        screen.queryByText('That did not download. You can try again.')
      ).not.toBeInTheDocument()
    );
  });
});
