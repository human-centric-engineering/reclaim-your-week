'use client';

/**
 * The optional calendar branch (F5 t-3), start to finish: upload → review → confirmed. A calm,
 * self-contained flow that F6 will host inside Phase 1; standalone here so the branch is usable and
 * testable before Phase 1's content lands. Shell only — no verbatim coaching voice (I11).
 */

import { useState } from 'react';
import { CalendarUpload } from '@/components/app/reclaim/calendar/calendar-upload';
import { CalendarReviewPanel } from '@/components/app/reclaim/calendar/calendar-review';
import type { CalendarReview } from '@/components/app/reclaim/calendar/types';

type Stage = { name: 'upload' } | { name: 'review'; review: CalendarReview } | { name: 'done' };

export function CalendarBranch({ runId }: { runId: string }) {
  const [stage, setStage] = useState<Stage>({ name: 'upload' });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-10">
        <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
          Reclaim your week
        </p>
        <h1 className="text-foreground mt-4 text-3xl leading-tight font-light sm:text-4xl">
          A look at your calendar
        </h1>
        <p className="text-muted-foreground mt-4 text-[1.02rem] leading-relaxed">
          An optional reality-check: compare what you estimated against what your calendar actually
          shows. You can skip this and it changes nothing else.
        </p>
      </header>

      {stage.name === 'upload' && (
        <CalendarUpload
          runId={runId}
          onReviewed={(review) => setStage({ name: 'review', review })}
        />
      )}

      {stage.name === 'review' && (
        <CalendarReviewPanel
          runId={runId}
          review={stage.review}
          onConfirmed={() => setStage({ name: 'done' })}
        />
      )}

      {stage.name === 'done' && (
        <div className="py-10 text-center">
          <p className="text-foreground text-xl font-light">
            Saved. Your composite picture is ready for Phase 1.
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            This blends what your calendar showed with the work that happens off it.
          </p>
        </div>
      )}
    </div>
  );
}
