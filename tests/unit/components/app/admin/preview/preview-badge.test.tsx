/**
 * The "Test account" badge (F19).
 *
 * One component shared across Clients, the client record, and Shared results — the only thing that
 * has to be true is that it renders nothing for a real account (so a caller can drop it in
 * unconditionally without an `isPreview &&` guard everywhere) and shows the same label wherever it
 * appears (three copies of this pill would be three chances for the wording to drift).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewBadge } from '@/components/app/admin/preview/preview-badge';

describe('PreviewBadge', () => {
  it('renders nothing for a real account', () => {
    const { container } = render(<PreviewBadge isPreview={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the label for a test account', () => {
    render(<PreviewBadge isPreview />);

    expect(screen.getByText('Test account')).toBeInTheDocument();
  });
});
