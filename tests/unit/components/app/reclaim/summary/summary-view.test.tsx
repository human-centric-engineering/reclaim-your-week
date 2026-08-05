/**
 * The Phase 6 summary artifact — a print-friendly render of a finished audit's slots.
 *
 * Purely presentational (no fetching, no client state): `{ summary: AuditSummary }` in, JSX out.
 * The load-bearing case is `report: null` — per `types.ts`'s own docstring, the analyst reading
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
    auditedOn: '2026-07-29T10:00:00.000Z',
    contactEmail: 'rashmir@rashmir.net',
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
    report: null,
    footnote: 'A tool designed by Rashmir Balasubramaniam.',
    ...overrides,
  };
}

const REPORT = {
  chapters: [
    {
      section: 'why_now' as const,
      paragraphs: [
        'You said the bid was the thing keeping you up, and your week shows it nowhere.',
      ],
    },
    {
      section: 'the_week' as const,
      paragraphs: ['Twenty hours of it is other people\u2019s meetings.'],
    },
    {
      section: 'what_you_chose' as const,
      paragraphs: ['Two mornings, from Monday, and the Thursday stand-up handed over.'],
    },
  ],
  gaps: [{ token: 'deep_work', observation: 'Deep work keeps slipping to the evenings.' }],
  pathway: [
    {
      horizon: 'now' as const,
      step: 'Block Tuesday mornings',
      difference: 'One protected block a week, visible on the calendar.',
    },
  ],
  closing: 'You have looked at this honestly, and that is the part nobody can do for you.',
};

/**
 * A reading from before the analyst could see the audit.
 *
 * Stored JSON outlives the shape that wrote it: every audit finished before the brief widened has a
 * reading with gaps and a pathway and no narrative at all. The report must render as the shorter
 * document it is, rather than refusing to draw or drawing empty headings.
 */
const REPORT_WITHOUT_NARRATIVE = {
  chapters: [],
  gaps: REPORT.gaps,
  pathway: REPORT.pathway,
  closing: null,
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

    expect(
      screen.getByRole('heading', { name: 'Now, and the week you wanted' })
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Wanted' })).toBeInTheDocument();
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

    expect(screen.queryByRole('heading', { name: 'Now, and the week you wanted' })).toBeNull();
  });

  it('renders nothing for the table when there are no rows at all', () => {
    render(<SummaryView summary={buildSummary({ rows: [] })} />);
    expect(screen.queryByRole('heading', { name: 'Now, and the week you wanted' })).toBeNull();
  });
});

describe('SummaryView — the analyst sections', () => {
  it('renders nothing for gaps or pathway when analyst is null', () => {
    render(<SummaryView summary={buildSummary({ report: null })} />);

    expect(screen.queryByRole('heading', { name: 'What stands out' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'One way this could go' })).toBeNull();
    // Not a placeholder, not an apology — genuinely nothing about the analyst on the page.
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it('renders the gaps and pathway sections when analyst is present', () => {
    render(<SummaryView summary={buildSummary({ report: REPORT })} />);

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
      <SummaryView summary={buildSummary({ report: { ...REPORT_WITHOUT_NARRATIVE, gaps: [] } })} />
    );
    expect(screen.queryByRole('heading', { name: 'What stands out' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'One way this could go' })).toBeInTheDocument();
  });

  it('does not render the pathway section when analyst has no pathway, even if gaps exist', () => {
    render(
      <SummaryView
        summary={buildSummary({ report: { ...REPORT_WITHOUT_NARRATIVE, pathway: [] } })}
      />
    );
    expect(screen.getByRole('heading', { name: 'What stands out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'One way this could go' })).toBeNull();
  });
});

describe('SummaryView — the narrative the audit paid for', () => {
  it('renders the arc, in the product\u2019s order, and the closing line', () => {
    render(<SummaryView summary={buildSummary({ report: REPORT })} />);

    expect(screen.getByRole('heading', { name: 'Where you began' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'You said the bid was the thing keeping you up, and your week shows it nowhere.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Twenty hours of it is other people\u2019s meetings.')
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What you have chosen' })).toBeInTheDocument();
    expect(
      screen.getByText('Two mornings, from Monday, and the Thursday stand-up handed over.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have looked at this honestly, and that is the part nobody can do for you.'
      )
    ).toBeInTheDocument();
  });

  it('draws the shorter report for a reading stored before the narrative existed', () => {
    render(<SummaryView summary={buildSummary({ report: REPORT_WITHOUT_NARRATIVE })} />);

    // What it has, it draws.
    expect(screen.getByRole('heading', { name: 'What stands out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One way this could go' })).toBeInTheDocument();
    // What it does not have leaves no heading, no placeholder and no apology behind it.
    expect(screen.queryByRole('heading', { name: 'Where you began' })).toBeNull();
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it('renders no narrative headings at all when the analyst is null', () => {
    render(<SummaryView summary={buildSummary({ report: null })} />);
    expect(screen.queryByRole('heading', { name: 'Where you began' })).toBeNull();
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

/**
 * The two things a document needs that a screen does not: a date, and a way back to a person.
 *
 * A report is kept, printed and re-read. "Twelve hours in delivery" is a fact about one particular
 * week, and an undated document goes on quietly claiming to be about now. The contact is the same
 * argument: a printed page has no buttons on it, and somebody who decides six months later that they
 * want to talk to someone should not have to find the app again to learn who.
 */
describe('SummaryView — it is a document, so it is dated and it is addressed', () => {
  it('carries the date of the audit, spelled out', () => {
    render(<SummaryView summary={buildSummary({ auditedOn: '2026-07-29T10:00:00.000Z' })} />);
    expect(screen.getByText('29 July 2026')).toBeInTheDocument();
  });

  it('renders nothing rather than "Invalid Date" for a date it cannot read', () => {
    render(<SummaryView summary={buildSummary({ auditedOn: 'not-a-date' })} />);
    expect(screen.queryByText(/invalid date/i)).toBeNull();
  });

  it('carries the contact address, as a mail link', () => {
    render(<SummaryView summary={buildSummary({ contactEmail: 'rashmir@example.org' })} />);
    const link = screen.getByRole('link', { name: 'rashmir@example.org' });
    expect(link).toHaveAttribute('href', 'mailto:rashmir@example.org');
  });

  it('uses the operator-set address rather than a hard-coded one', () => {
    // Read off the summary so an operator changing it on the config form changes what a leader's
    // downloaded report tells them, with no deploy.
    render(<SummaryView summary={buildSummary({ contactEmail: 'someone.else@example.org' })} />);
    expect(screen.queryByText(/rashmir@rashmir\.net/)).toBeNull();
    expect(screen.getByText('someone.else@example.org')).toBeInTheDocument();
  });
});
