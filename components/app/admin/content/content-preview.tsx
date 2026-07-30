'use client';

/**
 * Her draft, where it lands (F18 t-1).
 *
 * The panel beside the content editor. It renders the **unsaved** draft, so a sentence can be read in
 * place before it reaches anybody, and it is deliberately honest about the two different destinations
 * her writing has: some of it a leader reads word for word, and some of it is briefing the coach is
 * given and told not to quote. A preview that drew both as screens would be a more comfortable lie
 * than no preview.
 *
 * **The phase card is the leader's own `<Signpost>`**, not a copy of it, handed the draft signposts
 * through the prop it already takes for the stored config. Anything else drifts: a second renderer of
 * the same card is a second thing to keep true, and the first time they disagree the preview is worse
 * than nothing.
 *
 * `data-surface="consumer"` pins the leader's palette over this subtree
 * (`.context/ui/surface-theming.md` constraint 3), so the words are read in the colours they will be
 * read in rather than in the admin theme.
 *
 * **It shows only what is being edited.** For a version this rendered all four blocks at once beside
 * whichever tab the editor happened to be on, and the cost was that the panel stopped reading as a
 * preview of anything: bucket 01 in the fields, the summary footnote in the panel, nothing on screen
 * saying the two were the same page. `show` is the fix — the caller names the blocks that belong to
 * the fields it is currently rendering, and the panel draws those. What has no preview at all (the
 * numeric rules) is not this component's problem: the caller simply does not render it.
 *
 * **It scrolls inside itself.** A block can still outrun the viewport, and as a plain `sticky` column
 * that meant the top stayed pinned while the bottom could not be reached at all. Given a bound by its
 * caller it becomes a fixed header over its own scroll region: the title stays put, the draft moves
 * under it, and the fields alongside stay where they were. A bound rather than a fixed height, so a
 * short block is a short panel rather than a tall box with a hole in it.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Signpost } from '@/components/app/reclaim/signpost';
import type { ContentView } from '@/components/app/admin/actions';
import { buildContentPreview, type PreviewLine } from '@/lib/app/programme/admin/content-preview';

/** The three-line explanation of what "briefing" means, said once rather than per field. */
function BriefingNote() {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      These reach the coach rather than the screen. It is given them at the start of a phase to
      recognise what a leader describes, and it is told not to quote them, so a leader meets this
      wording only in what the coach makes of it.
    </p>
  );
}

function Line({ line }: { line: PreviewLine }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.14em] uppercase">
        {line.label}
      </p>
      {line.text.trim() === '' ? (
        <p className="text-muted-foreground text-sm italic">
          Empty. A leader would read nothing here.
        </p>
      ) : (
        <p className="text-foreground text-[0.95rem] leading-relaxed">{line.text}</p>
      )}
    </div>
  );
}

/**
 * The four blocks the panel can draw, named so a caller can ask for the ones its fields feed.
 *
 * These are destinations, not editor tabs. The editor's tabs happen to map onto them cleanly today,
 * and if they ever stop doing so it is the editor's map that changes rather than this vocabulary.
 */
export type PreviewSection = 'phases' | 'areas' | 'summary' | 'briefing';

const ALL_SECTIONS: readonly PreviewSection[] = ['phases', 'areas', 'summary', 'briefing'];

export function ContentPreview({
  view,
  drafts,
  show = ALL_SECTIONS,
  className,
}: {
  view: ContentView;
  drafts: Record<string, string>;
  /** Which blocks to draw. Defaults to all of them — the whole draft, where nothing narrows it. */
  show?: readonly PreviewSection[];
  /** Sizing from the caller — a bound here is what turns the body into its own scroll region. */
  className?: string;
}) {
  const preview = buildContentPreview(view, drafts);
  const [phaseKey, setPhaseKey] = useState<string | null>(null);
  const phase = preview.phases.find((p) => p.phaseKey === phaseKey) ?? preview.phases[0] ?? null;
  const showing = (section: PreviewSection) => show.includes(section);

  return (
    <div
      data-surface="consumer"
      className={cn('bg-background flex flex-col overflow-hidden rounded-xl border', className)}
    >
      <div className="border-border/60 space-y-1 border-b px-5 py-4">
        <h2 className="text-foreground text-base font-medium">How this appears</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Your draft, in place, before anything is saved. Nothing here has reached anyone yet.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-5">
        {showing('phases') && phase !== null && (
          <section className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {preview.phases.map((p) => (
                <button
                  key={p.phaseKey}
                  type="button"
                  onClick={() => setPhaseKey(p.phaseKey)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    p.phaseKey === phase.phaseKey
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Signpost
              phaseKey={phase.phaseKey}
              index={phase.index}
              label={phase.label}
              signposts={preview.phases.map((p) => p.signpost)}
            />
          </section>
        )}

        {showing('areas') && preview.areas.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-foreground text-sm font-medium">
              The areas, as the list shows them
            </h3>
            <ul className="space-y-4">
              {preview.areas.map((area) => (
                <li
                  key={area.slug}
                  className="border-border/60 space-y-2 border-b pb-4 last:border-b-0"
                >
                  <p className="text-foreground text-sm font-medium">{area.title.text}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {area.description.text}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Coach only: {area.benchmarkNote.text}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs leading-relaxed">
              An area&rsquo;s name is read on the chart and in the summary. Its description is given
              to the coach, and a leader reads it on the written form of phase 1.
            </p>
          </section>
        )}

        {showing('summary') && preview.summary.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-foreground text-sm font-medium">Under the summary</h3>
            {preview.summary.map((line) => (
              <Line key={line.key} line={line} />
            ))}
          </section>
        )}

        {showing('briefing') && preview.briefing.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-foreground text-sm font-medium">What the coach is told</h3>
            <BriefingNote />
            <div className="space-y-4">
              {preview.briefing.map((line) => (
                <Line key={line.key} line={line} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
