/**
 * The Phase 6 summary artifact — a print-friendly render of a finished audit's slots.
 *
 * Purely presentational (no fetching, no client state): `{ summary: AuditSummary }` in, JSX out.
 * The load-bearing case is `analyst: null` — per `types.ts`'s own docstring, the analyst reading
 * may never have run, may have been refused, or may have failed, and the artifact was complete
 * without those two sections for the whole of v1. A view that renders a placeholder or an error
 * for `null` is the confusing failure; this file pins "renders nothing" instead.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryView } from '@/components/app/reclaim/summary/summary-view';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';

/** A complete, schema-valid summary. Individual tests override only the field under test. */
function buildSummary(overrides: Partial<AuditSummary> = {}): AuditSummary {
  return {
    firstName: 'Ada',
    role: 'Chief executive',
    orgType: 'Charity',
    period: 'last quarter',
    priorities: 'Grow the impact team without burning out.',
    current: {
      source: 'current',
      buckets: [
        {
          token: 'deep_work',
          slug: 'deep-work',
          title: 'Deep work',
          hours: 5,
          percent: 12,
          lowPercent: 10,
          highPercent: 20,
          status: 'in',
        },
      ],
      totalHours: 42,
      unallocated: [],
    },
    // Deliberately different from the chart bucket's `hours: 5` above, so a test asserting one
    // does not accidentally collide with the other rendering the same text elsewhere on the page.
    rows: [{ token: 'deep_work', title: 'Deep work', current: 6, ideal: 9 }],
    action: {
      chosen: 'Protect Tuesday mornings',
      when: 'Next week',
      howKnown: 'Fewer late nights',
    },
    analyst: null,
    footnote: 'A tool designed by Rashmir Balasubramaniam.',
    ...overrides,
  };
}

const ANALYST = {
  gaps: [{ token: 'deep_work', observation: 'Deep work keeps slipping to the evenings.' }],
  pathway: [
    {
      horizon: 'now' as const,
      step: 'Block Tuesday mornings',
      difference: 'One protected block a week, visible on the calendar.',
    },
  ],
};

describe('SummaryView — heading', () => {
  it('greets by first name when one is present', () => {
    render(<SummaryView summary={buildSummary({ firstName: 'Ada' })} />);
    expect(screen.getByRole('heading', { name: "Ada's time audit" })).toBeInTheDocument();
  });

  it('falls back to a generic heading when firstName is null', () => {
    render(<SummaryView summary={buildSummary({ firstName: null })} />);
    expect(screen.getByRole('heading', { name: 'Your time audit' })).toBeInTheDocument();
    expect(screen.queryByText(/'s time audit/)).toBeNull();
  });
});

describe('SummaryView — priorities', () => {
  it('renders the priorities section when present', () => {
    render(
      <SummaryView
        summary={buildSummary({ priorities: 'Grow the impact team without burning out.' })}
      />
    );
    expect(screen.getByText('Priorities this year')).toBeInTheDocument();
    expect(screen.getByText('Grow the impact team without burning out.')).toBeInTheDocument();
  });

  it('renders nothing for the priorities section when null', () => {
    render(<SummaryView summary={buildSummary({ priorities: null })} />);
    expect(screen.queryByText('Priorities this year')).toBeNull();
  });
});

describe('SummaryView — now-vs-ideal table', () => {
  it('renders the table when at least one row has a non-null ideal', () => {
    render(
      <SummaryView
        summary={buildSummary({
          rows: [
            { token: 'deep_work', title: 'Deep work', current: 6, ideal: 9 },
            { token: 'admin', title: 'Admin', current: 10, ideal: null },
          ],
        })}
      />
    );

    expect(screen.getByRole('heading', { name: 'Now, and your ideal' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ideal' })).toBeInTheDocument();
    // Deep work's row: current 6h, ideal 9h.
    expect(screen.getByText('6h')).toBeInTheDocument();
    expect(screen.getByText('9h')).toBeInTheDocument();
  });

  it('renders nothing for the table when every row has a null ideal', () => {
    render(
      <SummaryView
        summary={buildSummary({
          rows: [{ token: 'deep_work', title: 'Deep work', current: 5, ideal: null }],
        })}
      />
    );

    expect(screen.queryByRole('heading', { name: 'Now, and your ideal' })).toBeNull();
  });

  it('renders nothing for the table when there are no rows at all', () => {
    render(<SummaryView summary={buildSummary({ rows: [] })} />);
    expect(screen.queryByRole('heading', { name: 'Now, and your ideal' })).toBeNull();
  });
});

describe('SummaryView — the analyst sections', () => {
  it('renders nothing for gaps or pathway when analyst is null', () => {
    render(<SummaryView summary={buildSummary({ analyst: null })} />);

    expect(screen.queryByRole('heading', { name: 'What stands out' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'One way this could go' })).toBeNull();
    // Not a placeholder, not an apology — genuinely nothing about the analyst on the page.
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it('renders the gaps and pathway sections when analyst is present', () => {
    render(<SummaryView summary={buildSummary({ analyst: ANALYST })} />);

    expect(screen.getByRole('heading', { name: 'What stands out' })).toBeInTheDocument();
    expect(screen.getByText('Deep work keeps slipping to the evenings.')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'One way this could go' })).toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText('Block Tuesday mornings')).toBeInTheDocument();
    expect(
      screen.getByText('One protected block a week, visible on the calendar.')
    ).toBeInTheDocument();
  });

  it('does not render the gaps section when analyst has no gaps, even if pathway exists', () => {
    render(
      <SummaryView summary={buildSummary({ analyst: { gaps: [], pathway: ANALYST.pathway } })} />
    );
    expect(screen.queryByRole('heading', { name: 'What stands out' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'One way this could go' })).toBeInTheDocument();
  });

  it('does not render the pathway section when analyst has no pathway, even if gaps exist', () => {
    render(
      <SummaryView summary={buildSummary({ analyst: { gaps: ANALYST.gaps, pathway: [] } })} />
    );
    expect(screen.getByRole('heading', { name: 'What stands out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'One way this could go' })).toBeNull();
  });
});

describe('SummaryView — footnote', () => {
  it('renders the footnote text', () => {
    render(
      <SummaryView
        summary={buildSummary({ footnote: 'A tool designed by Rashmir Balasubramaniam.' })}
      />
    );
    expect(screen.getByText('A tool designed by Rashmir Balasubramaniam.')).toBeInTheDocument();
  });
});

describe('SummaryView — hours, never percentages (I8)', () => {
  it('shows the chart figure in hours, and does not surface the raw percentage as a primary reading', () => {
    render(
      <SummaryView
        summary={buildSummary({
          current: {
            source: 'current',
            buckets: [
              {
                token: 'deep_work',
                slug: 'deep-work',
                title: 'Deep work',
                hours: 5,
                percent: 12,
                lowPercent: 10,
                highPercent: 20,
                status: 'in',
              },
            ],
            totalHours: 42,
            unallocated: [],
          },
        })}
      />
    );

    // The chart's default view (no "show as table" toggle pressed) draws the bar label in hours.
    expect(screen.getByText('5h')).toBeInTheDocument();
    // The bucket's percent (12%) is not drawn anywhere by default — it only exists behind an
    // explicit "Show as table" toggle the leader has not pressed, so it is not part of the
    // artifact's primary reading.
    expect(screen.queryByText('12%')).toBeNull();
  });
});
