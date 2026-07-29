/**
 * The studio credit that closes every footer.
 *
 * The credit exists to be read, and the three ways it stops being readable are all silent. Its name is
 * assembled from two spans, so a change that drops one leaves a link that says "Built by" and nothing
 * else. Its mark is two files because neither is a tint of the other — show both, or the wrong one,
 * and the gear is white artwork on white paper. And the mark is square on purpose: the supplied
 * wordmark is 4.87:1 and unreadable at footer sizes, which is the whole reason the lockup was split,
 * so a regression back to a wide asset would quietly undo the fix.
 *
 * @see /components/app/brand/built-by-hce.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BuiltByHce } from '@/components/app/brand/built-by-hce';

describe('BuiltByHce', () => {
  it('names the studio in full, assembled from text rather than from artwork', () => {
    render(<BuiltByHce />);

    expect(screen.getByRole('link', { name: 'Built by HCE Studio' })).toHaveAttribute(
      'href',
      'https://www.hce.studio/'
    );
  });

  it('opens the studio in its own tab without handing it the opener', () => {
    render(<BuiltByHce />);

    const link = screen.getByRole('link', { name: 'Built by HCE Studio' });

    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('keeps the gear silent, so the studio is not announced twice', () => {
    const { container } = render(<BuiltByHce />);

    const marks = container.querySelectorAll('img');

    expect(marks).toHaveLength(2);
    marks.forEach((mark) => {
      expect(mark).toHaveAttribute('alt', '');
      expect(mark).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('carries both marks and shows exactly one per theme', () => {
    const { container } = render(<BuiltByHce />);

    const ink = container.querySelector('img[src*="hce-mark-ink"]');
    const paper = container.querySelector('img[src*="hce-mark-paper"]');

    expect(ink).not.toBeNull();
    expect(paper).not.toBeNull();
    // `.dark` lives on <html>, so the swap is CSS: ink hides in dark, paper hides everywhere else.
    expect(ink?.className).toContain('dark:hidden');
    expect(paper?.className).toContain('hidden');
    expect(paper?.className).toContain('dark:block');
  });

  it('uses the square mark, not the wordmark that could not be read at this size', () => {
    const { container } = render(<BuiltByHce size="sm" />);

    const ink = container.querySelector('img[src*="hce-mark-ink"]');

    expect(ink?.getAttribute('src')).not.toContain('wordmark');
    expect(ink?.getAttribute('width')).toBe(ink?.getAttribute('height'));
  });

  it('gives the programme colophon a smaller mark than the public footer', () => {
    const { container: small } = render(<BuiltByHce size="sm" />);
    const { container: medium } = render(<BuiltByHce />);

    const sizeOf = (c: HTMLElement) =>
      Number(c.querySelector('img[src*="hce-mark-ink"]')?.getAttribute('width'));

    expect(sizeOf(small)).toBeLessThan(sizeOf(medium));
    // Still large enough that the figure inside the gear resolves.
    expect(sizeOf(small)).toBeGreaterThanOrEqual(18);
  });

  it('sets the studio name apart from the words that introduce it', () => {
    render(<BuiltByHce />);

    // "Built by" is muted and "HCE Studio" is not — that contrast is what makes the name the part
    // that reads at footer size, so it is the design, not a styling detail.
    expect(screen.getByText('HCE Studio').className).toContain('text-foreground');
  });
});
