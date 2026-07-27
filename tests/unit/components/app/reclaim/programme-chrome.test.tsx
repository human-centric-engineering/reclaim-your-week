/**
 * The bar the full-screen frame carries.
 *
 * Two lines of markup, and one of them is load-bearing: moving the audit into its own route group
 * took away the platform header, and with it every link out of a surface a leader sits in for forty
 * minutes. The way out has to be there, and it has to point somewhere real.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';

describe('ProgrammeChrome', () => {
  it('always offers the way out, since the platform header is gone', () => {
    render(<ProgrammeChrome />);

    const link = screen.getByRole('link', { name: 'Leave the audit' });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('says where the leader is when there is a phase to name', () => {
    render(<ProgrammeChrome here="Phase 1 · Current reality" />);

    expect(screen.getByText('Phase 1 · Current reality')).toBeInTheDocument();
  });

  it('says nothing about a phase before a run has been read', () => {
    render(<ProgrammeChrome />);

    expect(screen.queryByText(/Phase/)).not.toBeInTheDocument();
    // The product still names itself: this is the leader's only frame of reference on the page.
    expect(screen.getByText('Reclaim your week')).toBeInTheDocument();
  });
});
