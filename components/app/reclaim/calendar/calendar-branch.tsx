'use client';

/**
 * The optional calendar branch (F5 t-3), start to finish: upload → review → confirmed. A calm,
 * self-contained flow that F6 will host inside Phase 1; standalone here so the branch is usable and
 * testable before Phase 1's content lands. Shell only — no verbatim coaching voice (I11).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarUpload } from '@/components/app/reclaim/calendar/calendar-upload';
import { CalendarReviewPanel } from '@/components/app/reclaim/calendar/calendar-review';
import {
  calendarExportsSchema,
  type CalendarExportView,
  type CalendarReview,
} from '@/components/app/reclaim/calendar/types';

type Stage = { name: 'upload' } | { name: 'review'; review: CalendarReview } | { name: 'done' };

export function CalendarBranch({ runId }: { runId: string }) {
  const [stage, setStage] = useState<Stage>({ name: 'upload' });
  const [exports, setExports] = useState<CalendarExportView[]>([]);

  // The export walkthroughs, as the operator has them. A failure leaves the help section out rather
  // than showing stale steps: instructions for somebody else's menus are worse than none when wrong.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/app/reclaim/config');
        const json: unknown = await res.json();
        const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
        const parsed = calendarExportsSchema.safeParse(data);
        if (parsed.success) setExports(parsed.data.calendarExportSteps);
      } catch {
        // No help section.
      }
    })();
  }, []);

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
          exports={exports}
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
            Saved. Your composite picture is ready for Section 1.
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            This blends what your calendar showed with the work that happens off it.
          </p>
          {/*
            The way back. Its absence was half of why this whole flow was unreachable: nothing linked
            in, and nothing led out, so even a leader who found it by typing the URL ended here.
          */}
          <Link
            href="/programme"
            className="bg-primary text-primary-foreground mt-8 inline-block rounded-full px-8 py-3 text-[0.95rem] font-medium"
          >
            Back to your audit
          </Link>
        </div>
      )}

      {stage.name !== 'done' && (
        <p className="mt-10 text-center">
          <Link
            href="/programme"
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            Skip this and go back to your audit
          </Link>
        </p>
      )}
    </div>
  );
}
