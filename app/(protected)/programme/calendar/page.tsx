/**
 * The calendar branch page (F5 t-3). A thin Server Component; the interactive branch is a client
 * island that loads the current run and runs the upload → review → confirmed flow. Optional step —
 * F6 will link here from Phase 1; standalone until then.
 */

import type { Metadata } from 'next';
import { CalendarEntry } from '@/components/app/reclaim/calendar/calendar-entry';

export const metadata: Metadata = {
  title: 'Your calendar',
  description: 'An optional look at where your calendar says your time goes.',
};

export default function CalendarPage() {
  return <CalendarEntry />;
}
