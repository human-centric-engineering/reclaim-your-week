/**
 * Her draft, where it lands (F18 t-1). `buildContentPreview` itself is pure and already fully
 * covered (`tests/unit/lib/app/programme/admin/content-preview.test.ts`); this proves the *wiring*
 * into JSX — that the draft actually reaches the screen, that the phase card is genuinely the
 * leader's own `<Signpost>` rather than a lookalike, and that the coach-only fields are labelled as
 * such rather than presented as something a leader reads.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentPreview } from '@/components/app/admin/content/content-preview';
import type { ContentView } from '@/components/app/admin/actions';

function field(
  key: string,
  label: string,
  value: string,
  overrides: Partial<{ matchesSource: boolean; sourceKind: 'rashmir' | 'authored' }> = {}
) {
  return {
    key,
    label,
    value,
    matchesSource: overrides.matchesSource ?? true,
    sourceKind: overrides.sourceKind ?? 'rashmir',
  } as const;
}

const VIEW: ContentView = {
  buckets: [
    {
      bucketSlug: 'deep-work',
      title: field('buckets.0.title', 'Title', 'Deep work'),
      description: field('buckets.0.description', 'Description', 'Protected, focused time.'),
      benchmarkNote: field('buckets.0.benchmarkNote', 'Benchmark range', 'Recommended: 20-30%'),
    },
  ],
  bands: [
    {
      id: 'heavy',
      label: field('hourBands.0.label', 'Band: heavy', 'A heavy week.', { sourceKind: 'authored' }),
    },
  ],
  prose: [
    field('governingFrame', 'The governing frame', 'This is not a productivity exercise.'),
    field('deepWorkNote', 'The deep-work note', 'Deep work cuts across the others.'),
    field('footnote', 'The summary footnote', 'One quarter is a snapshot, not a verdict.'),
    field('consultationEmail', 'Consultation email', 'hello@example.com'),
  ],
  signposts: [
    {
      phaseKey: 'phase-0-setup',
      involves: field(
        'phaseSignposts.0.involves',
        'What this phase involves',
        'A little context about you.',
        {
          sourceKind: 'authored',
        }
      ),
      duration: field('phaseSignposts.0.duration', 'Roughly how long', 'a few minutes', {
        sourceKind: 'authored',
      }),
      opening: [
        field('phaseSignposts.0.opening.0', 'Opening', 'Welcome. This is a guided look.', {
          sourceKind: 'authored',
        }),
      ],
    },
  ],
  rules: [
    {
      ...field('abandonedAfterDays', 'Days before stalled', '21', { sourceKind: 'authored' }),
      min: 1,
      max: 365,
    },
  ],
  editedCount: 1,
  baseVersion: 7,
};

describe('ContentPreview', () => {
  it('renders the draft governing frame and footnote — the fields a leader actually reads', () => {
    render(<ContentPreview view={VIEW} drafts={{}} />);

    expect(screen.getByText('One quarter is a snapshot, not a verdict.')).toBeInTheDocument();
    expect(screen.getByText('This is not a productivity exercise.')).toBeInTheDocument();
  });

  it('shows an unsaved draft in place of the stored value, without saving anything', () => {
    render(<ContentPreview view={VIEW} drafts={{ 'buckets.0.title': 'Running the place' }} />);

    expect(screen.getByText('Running the place')).toBeInTheDocument();
    expect(screen.queryByText('Deep work')).not.toBeInTheDocument();
  });

  it('renders the phase card through the leader’s own Signpost, with its section label', () => {
    render(<ContentPreview view={VIEW} drafts={{}} />);

    // The signpost card renders `involves` and the opening beat verbatim — proving this is really
    // <Signpost>, not a lookalike that would silently drift from what a leader sees.
    expect(screen.getByText(/A little context about you\./)).toBeInTheDocument();
    expect(screen.getByText(/Welcome\. This is a guided look\./)).toBeInTheDocument();
  });

  it('labels the benchmark range as coach-only, never as something a leader reads', () => {
    render(<ContentPreview view={VIEW} drafts={{}} />);

    expect(screen.getByText(/Coach only: Recommended: 20-30%/)).toBeInTheDocument();
  });

  it('labels the briefing section and explains what "briefing" means, once', () => {
    render(<ContentPreview view={VIEW} drafts={{}} />);

    expect(screen.getByText('What the coach is told')).toBeInTheDocument();
    expect(screen.getByText(/reach the coach rather than the screen/)).toBeInTheDocument();
  });

  it('draws only the blocks the caller asks for, so the panel matches the fields beside it', () => {
    // The editor's `buckets` tab asks for `areas` alone. Everything else the draft contains is
    // being edited under a different tab, and drawing it here is what made the panel read as an
    // unrelated slab of text.
    render(<ContentPreview view={VIEW} drafts={{}} show={['areas']} />);

    expect(screen.getByText('Deep work')).toBeInTheDocument();
    expect(screen.queryByText('One quarter is a snapshot, not a verdict.')).not.toBeInTheDocument();
    expect(screen.queryByText('This is not a productivity exercise.')).not.toBeInTheDocument();
    expect(screen.queryByText(/A little context about you\./)).not.toBeInTheDocument();
  });

  it('draws nothing at all when asked for no blocks — the rules tab has no rendering to preview', () => {
    render(<ContentPreview view={VIEW} drafts={{}} show={[]} />);

    // The frame stays (a caller that renders it at all still gets a panel); the draft does not.
    expect(screen.getByText('How this appears')).toBeInTheDocument();
    expect(screen.queryByText('Deep work')).not.toBeInTheDocument();
    expect(screen.queryByText('What the coach is told')).not.toBeInTheDocument();
  });

  it('renders nothing for an empty field rather than a blank line that reads as broken', () => {
    const withEmptyFootnote: ContentView = {
      ...VIEW,
      prose: VIEW.prose.map((f) => (f.key === 'footnote' ? { ...f, value: '' } : f)),
    };
    render(<ContentPreview view={withEmptyFootnote} drafts={{}} />);

    expect(screen.getByText(/Empty\. A leader would read nothing here\./)).toBeInTheDocument();
  });
});
