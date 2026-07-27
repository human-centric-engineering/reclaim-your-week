/**
 * The programme's own frame — its own route group, deliberately.
 *
 * **Why this left `(protected)`.** Core's `app/(protected)/layout.tsx` wraps every child in
 * `container mx-auto px-4 py-8` inside a `min-h-screen` column, between the platform header and
 * footer. That is right for a dashboard and wrong for a conversation: it caps the width, it adds page
 * padding the transcript has to fight, and — the part that actually broke — it leaves the page with
 * no bounded height, so nothing inside it can be a scroll region. The chat's `overflow-y-auto` never
 * engaged, its autoscroll was a no-op, and the composer drifted further down the page with every turn
 * until a leader had to scroll past their own conversation to type. That is a layout problem, not a
 * CSS one, and the layout causing it is Sunrise-owned (do not edit it).
 *
 * A route group is the seam that solves it without touching either tier. `(programme)` does not
 * appear in the URL, so `/programme` and `/programme/calendar` are unchanged — and so is everything
 * that depends on the path: the signed-out redirect comes from `appProtectedRoutes` in
 * `lib/app/protected-routes.ts` (the edge gate, prefix-matched on `/programme`), the per-route
 * authorisation from `withAuth` on every `/api/v1/app/reclaim/**` route, and the teal/cream palette
 * from `classifySurface()`, which returns `consumer` for everything outside `/admin`. All three key on
 * the URL. None of them keys on which folder the file sits in.
 *
 * What is given up is the platform header and footer, which a full-screen surface should not carry
 * anyway. The way back out lives in the programme's own bar (`ProgrammeChrome`).
 *
 * The type is unchanged: **Raleway** (Brief §7), self-hosted via `next/font` so there is no external
 * request and no CSP trouble, scoped to this subtree so the rest of the app keeps the platform font.
 */

import { Raleway } from 'next/font/google';
import { MaintenanceWrapperWithAdminNotice } from '@/components/maintenance-wrapper';

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-raleway',
  display: 'swap',
});

export default function ProgrammeLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Maintenance mode is applied here because it is applied per route group and nowhere else —
     * `(protected)` and `(public)` each wrap their own subtree, and there is no proxy-level gate. So
     * a new top-level group silently opts out of it, which is what happened when the audit moved and
     * is the one thing this move could have quietly taken away: a maintenance window that closed the
     * whole product except the forty-minute conversation.
     */
    <MaintenanceWrapperWithAdminNotice>
      <div
        className={`${raleway.variable} bg-background text-foreground flex h-[100dvh] flex-col overflow-hidden [font-family:var(--font-raleway)]`}
      >
        {children}
      </div>
    </MaintenanceWrapperWithAdminNotice>
  );
}
