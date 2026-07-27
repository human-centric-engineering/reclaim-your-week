/**
 * The calendar branch page (F5 t-3). A thin Server Component; the interactive branch is a client
 * island that loads the current run and runs the upload → review → confirmed flow. Reached from
 * Phase 1, on both surfaces.
 *
 * It sits inside the programme frame, which is a fixed-height column with the page scroll turned off,
 * so this page carries its own scroll region. Without one the frame would clip the review table
 * rather than scrolling it.
 */

import type { Metadata } from 'next';
import { CalendarEntry } from '@/components/app/reclaim/calendar/calendar-entry';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';

export const metadata: Metadata = {
  title: 'Your calendar',
  description: 'An optional look at where your calendar says your time goes.',
};

export default function CalendarPage() {
  return (
    <>
      <ProgrammeChrome here="Your calendar" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
          <CalendarEntry />
        </div>
      </div>
    </>
  );
}
