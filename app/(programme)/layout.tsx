/**
 * The frame the whole leader-facing product wears — its own route group, deliberately.
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
 * **Why this file sits at the group root rather than on `programme/`.** It began one segment deeper,
 * because the audit was the only thing that needed it. Then the bar grew a menu, and the menu offered
 * a leader their profile and their account settings, and both of those still lived in the platform's
 * frame: a different header, a different footer, a different typeface, reached from a corner of this
 * one. Two products in two clicks. Since a route group does not appear in the URL, the fix is to move
 * the frame up and bring `/profile` and `/settings` into the group beside `/programme` — same URLs,
 * same bookmarks, same edge gate, one frame. The pages themselves are this app's now
 * (`app/(programme)/profile`, `app/(programme)/settings`); Sunrise's copies were removed, since two
 * files cannot answer one path. `/dashboard` deliberately stayed behind: it is where email
 * verification and the profile-completion prompt live, it is Sunrise's to keep improving, and nothing
 * in the programme's own navigation points at it.
 *
 * The type is unchanged: **Raleway** (Brief §7), self-hosted via `next/font` so there is no external
 * request and no CSP trouble, scoped to this subtree so the rest of the app keeps the platform font.
 * The declaration itself now lives in `app/fonts.ts`, since the public pages wear the same type and
 * two `Raleway({...})` calls would be two font instances.
 */

import type { Metadata } from 'next';
import { MaintenanceWrapperWithAdminNotice } from '@/components/maintenance-wrapper';
import { raleway } from '@/app/fonts';
import { ProgrammeFooter } from '@/components/app/reclaim/programme-footer';
import { BRAND } from '@/lib/brand';

/**
 * The tab title, which the platform layout used to supply and this group now has to.
 *
 * Same shape as `(public)` and `(protected)` — the brand once, as a suffix, so a page exporting
 * `title: 'Your profile'` reads "Your profile - Reclaim Your Week" rather than either half alone.
 * Before the group root existed, the programme's own pages inherited the root layout's flat title and
 * quietly lost the suffix; they gain it here too.
 */
export const metadata: Metadata = {
  title: {
    template: `%s - ${BRAND.name}`,
    default: BRAND.name,
  },
};

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
        {/*
         * Header, body, footer, in that order, and only the body scrolls. Each page renders its own
         * `ProgrammeChrome` because the bar names where you are and only the page knows that; the
         * footer is the same three links everywhere, so it belongs here rather than in three
         * components that would have to remember it.
         */}
        {children}
        <ProgrammeFooter />
      </div>
    </MaintenanceWrapperWithAdminNotice>
  );
}
