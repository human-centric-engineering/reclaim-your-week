/**
 * The seven-phase spine, in both of its shapes.
 *
 * The `compact` variant exists because the frame that now holds the audit gives the spine its own
 * column only on a wide screen; below that the conversation needs the width, so the same seven phases
 * become one line. What matters is that "one line" does not quietly become "less information": the
 * leader still has to be able to tell where they are, and every phase still has to be represented, or
 * the strip is decoration.
 *
 * All seven always render — including Phase 0. Hiding it makes "you are here" wrong on resume, which
 * is the bug the vertical rail was written to avoid, and the compact form must not reintroduce it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhaseRail } from '@/components/app/reclaim/phase-rail';
import type { PhaseView } from '@/components/app/reclaim/types';

const phases: PhaseView[] = [
  { key: 'phase-0-setup', label: 'Setup', status: 'completed' },
  { key: 'phase-1-current', label: 'Current reality', status: 'completed' },
  { key: 'phase-2-energy', label: 'Energy', status: 'active' },
  { key: 'phase-3-ideal', label: 'Ideal week', status: 'upcoming' },
  { key: 'phase-4-gap', label: 'Gap analysis', status: 'upcoming' },
  { key: 'phase-5-action', label: 'Action plan', status: 'upcoming' },
  { key: 'phase-6-summary', label: 'Summary', status: 'upcoming' },
];

describe('PhaseRail — the spine', () => {
  it('shows all seven phases, Phase 0 included, and marks where the leader is', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-2-energy" />);

    for (const phase of phases) {
      expect(screen.getByText(phase.label)).toBeInTheDocument();
    }
    expect(screen.getByText('here')).toBeInTheDocument();
  });

  it('names itself for a screen reader, since it is the only orientation on the page', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-2-energy" />);

    expect(
      screen.getByRole('navigation', { name: 'Your progress through the audit' })
    ).toBeInTheDocument();
  });
});

describe('PhaseRail — the compact strip', () => {
  it('still represents every phase, so the strip is not decoration', () => {
    const { container } = render(
      <PhaseRail phases={phases} currentPhaseKey="phase-2-energy" variant="compact" />
    );

    expect(container.querySelectorAll('li')).toHaveLength(phases.length);
  });

  it('says which phase the leader is on, in words and by position', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-2-energy" variant="compact" />);

    expect(screen.getByText('2 · Energy')).toBeInTheDocument();
    expect(screen.getByText(/phase 2 of 6/)).toBeInTheDocument();
  });

  it('keeps the same landmark as the spine it replaces', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-0-setup" variant="compact" />);

    expect(
      screen.getByRole('navigation', { name: 'Your progress through the audit' })
    ).toBeInTheDocument();
    expect(screen.getByText('0 · Setup')).toBeInTheDocument();
  });
});
