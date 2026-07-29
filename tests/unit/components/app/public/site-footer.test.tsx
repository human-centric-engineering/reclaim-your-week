/**
 * The rail along the bottom of the public pages.
 *
 * This footer replaced the platform's, so it inherits the platform's one non-negotiable: the consent
 * control is rendered regardless of the nav seam, because the seam governs links and consent is a
 * legal requirement in many jurisdictions. The rest is the ordinary end-of-document furniture —
 * where else to go, the terms, and the legal entity rather than the product name, which is the same
 * distinction the privacy notice's controller field rests on.
 *
 * @see /components/app/public/site-footer.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

const { openPreferences } = vi.hoisted(() => ({ openPreferences: vi.fn() }));
vi.mock('@/lib/consent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/consent')>()),
  useConsent: () => ({ openPreferences }),
}));

import { SiteFooter } from '@/components/app/public/site-footer';
import { BRAND } from '@/lib/brand';

afterEach(() => {
  vi.clearAllMocks();
});

describe('SiteFooter', () => {
  it('keeps the consent control reachable, because that is not ours to drop', async () => {
    render(<SiteFooter />);

    await userEvent.click(screen.getByRole('button', { name: 'Cookie preferences' }));

    expect(openPreferences).toHaveBeenCalledTimes(1);
  });

  it('reaches the legal pages by their full names, which is what a reader scans a footer for', () => {
    render(<SiteFooter />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });

  it('carries the platform default link cluster, which this app deliberately did not override', () => {
    render(<SiteFooter />);

    const pages = screen.getByRole('navigation', { name: 'Pages' });
    expect(pages).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
  });

  it('reads both clusters from the fork-owned seam rather than a list of its own', async () => {
    vi.resetModules();
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: null,
      footerNavItems: [{ href: '/pricing', label: 'Pricing' }],
      footerLegalItems: [{ href: '/imprint', label: 'Imprint' }],
    }));

    const { SiteFooter: Overridden } = await import('@/components/app/public/site-footer');
    render(React.createElement(Overridden));

    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/imprint');
    // Replacement, not append.
    expect(screen.queryByRole('link', { name: 'Privacy Policy' })).toBeNull();
    // …and the consent control survives an override that names no consent link.
    expect(screen.getByRole('button', { name: 'Cookie preferences' })).toBeInTheDocument();

    vi.doUnmock('@/lib/app/public-nav');
    vi.resetModules();
  });

  it('names the legal entity in the copyright, not the product', () => {
    render(<SiteFooter />);

    expect(
      screen.getByText(new RegExp(`${new Date().getFullYear()}\\s+${BRAND.legalName}`))
    ).toBeInTheDocument();
  });

  it('credits the studio alongside the copyright, since both say who stands behind this', () => {
    render(<SiteFooter />);

    const credit = screen.getByRole('link', { name: 'Built by HCE Studio' });

    expect(credit).toHaveAttribute('href', 'https://www.hce.studio/');
    // Same row as the copyright — the pairing is the point, not decoration.
    expect(credit.parentElement).toContainElement(
      screen.getByText(new RegExp(`${new Date().getFullYear()}\\s+${BRAND.legalName}`))
    );
  });
});
