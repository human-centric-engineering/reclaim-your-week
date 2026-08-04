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

import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText(/section 2 of 6/)).toBeInTheDocument();
  });

  it('keeps the same landmark as the spine it replaces', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-0-setup" variant="compact" />);

    expect(
      screen.getByRole('navigation', { name: 'Your progress through the audit' })
    ).toBeInTheDocument();
    expect(screen.getByText('0 · Setup')).toBeInTheDocument();
  });
});

/**
 * Going back to a phase already finished.
 *
 * The spine listed six phases behind the leader and opened none of them, which made it a table of
 * contents for a book that could not be turned back through. What it must not become is a way to skip
 * ahead: the audit is sequential and the server enforces it (I9), so an upcoming phase offers a door
 * that would only ever refuse.
 */
describe('PhaseRail — going back', () => {
  it('opens a phase already finished, and the one the leader is on', async () => {
    const onSelect = vi.fn();
    render(<PhaseRail phases={phases} currentPhaseKey="phase-2-energy" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /Current reality/ }));
    expect(onSelect).toHaveBeenCalledWith('phase-1-current');

    // The current phase is reachable too: it is the way back from a visit.
    await userEvent.click(screen.getByRole('button', { name: /Energy/ }));
    expect(onSelect).toHaveBeenCalledWith('phase-2-energy');
  });

  it('offers no way to skip ahead to a phase not reached yet', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-2-energy" onSelect={vi.fn()} />);

    for (const label of ['Ideal week', 'Gap analysis', 'Action plan', 'Summary']) {
      expect(screen.queryByRole('button', { name: new RegExp(label) })).not.toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  /**
   * The register. A read of the run can be behind the leader; a phase they have stood in must not
   * close behind them because of it.
   */
  it('opens a phase the caller has seen the leader reach, whatever this read says', async () => {
    const onSelect = vi.fn();
    // The run as a stale read describes it: back on phase 1, with phase 2 not yet entered.
    const behind: PhaseView[] = phases.map((phase) =>
      phase.key === 'phase-1-current'
        ? { ...phase, status: 'active' }
        : phase.key === 'phase-2-energy'
          ? { ...phase, status: 'upcoming' }
          : phase
    );
    render(
      <PhaseRail
        phases={behind}
        currentPhaseKey="phase-1-current"
        furthestPhaseKey="phase-2-energy"
        onSelect={onSelect}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Energy/ }));
    expect(onSelect).toHaveBeenCalledWith('phase-2-energy');
    // And it opens no further than the register goes.
    expect(screen.queryByRole('button', { name: /Ideal week/ })).not.toBeInTheDocument();
  });

  it('stays a display of progress when no one is listening', () => {
    render(<PhaseRail phases={phases} currentPhaseKey="phase-2-energy" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps "here" on the run’s own position while an earlier phase is being read', () => {
    render(
      <PhaseRail
        phases={phases}
        currentPhaseKey="phase-2-energy"
        viewingPhaseKey="phase-1-current"
        onSelect={vi.fn()}
      />
    );

    // "here" is where the audit has got to, and reading phase 1 has not moved it.
    const here = screen.getByText('here').closest('button');
    expect(here).toHaveTextContent('Energy');
    expect(screen.getByRole('button', { name: /Current reality/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('gives the compact dots a name and a target worth tapping', async () => {
    const onSelect = vi.fn();
    render(
      <PhaseRail
        phases={phases}
        currentPhaseKey="phase-2-energy"
        onSelect={onSelect}
        variant="compact"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go to section 1, Current reality' }));
    expect(onSelect).toHaveBeenCalledWith('phase-1-current');
    expect(screen.queryByRole('button', { name: /Go to section 4/ })).not.toBeInTheDocument();
  });
});
