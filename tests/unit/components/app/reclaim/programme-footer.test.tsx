/**
 * The rail along the bottom of the programme frame.
 *
 * The audit gave up the platform's footer when it moved into its own route group, and with it three
 * things a leader is entitled to reach from wherever they are: where their answers go, how to reach a
 * person, and the consent control. Cookie preferences is the one that is not a design choice — the
 * platform renders it in its own footer regardless of the nav seam, because it has to stay reachable.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { openPreferences } = vi.hoisted(() => ({ openPreferences: vi.fn() }));
vi.mock('@/lib/consent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/consent')>()),
  useConsent: () => ({ openPreferences }),
}));

import { ProgrammeFooter } from '@/components/app/reclaim/programme-footer';

describe('ProgrammeFooter', () => {
  it('reaches the privacy notice, which for this audit is part of the offer', () => {
    render(<ProgrammeFooter />);

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });

  it('reaches a person, named as help rather than as a form', () => {
    render(<ProgrammeFooter />);

    expect(screen.getByRole('link', { name: 'Help and support' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('credits the studio without turning it into a fourth thing to click while auditing', () => {
    render(<ProgrammeFooter />);

    const credit = screen.getByRole('link', { name: 'Built by HCE Studio' });

    expect(credit).toHaveAttribute('href', 'https://www.hce.studio/');
    // The links are one group and the credit is not part of it — see the footer's own note.
    expect(credit.parentElement).toBe(
      screen.getByRole('link', { name: 'Privacy' }).closest('footer')
    );
  });

  it('keeps the consent control reachable, because that is not ours to drop', async () => {
    render(<ProgrammeFooter />);

    await userEvent.click(screen.getByRole('button', { name: 'Cookie preferences' }));

    expect(openPreferences).toHaveBeenCalledTimes(1);
  });
});
