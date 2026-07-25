/**
 * App email template overrides.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty (= every email uses the
 * platform default) and does NOT change it after release, so your edits here
 * merge cleanly on upgrade (the stable contract is this file's export, not its
 * value). Treat it like the landing page: a starting point you're expected to
 * modify.
 *
 * To override an auth email, copy the platform default from `emails/<kind>.tsx`
 * into `components/app/emails/<kind>.tsx`, adapt the copy, and register it here
 * keyed by its {@link EmailKind}. The component must accept that kind's props
 * (see `EmailPropsMap` in `lib/email/registry.ts`). Unset kinds keep the
 * platform default. Example:
 *
 * ```ts
 * import MyWelcome from '@/components/app/emails/welcome';
 *
 * export const emailOverrides: EmailOverrides = {
 *   welcome: MyWelcome,
 * };
 * ```
 *
 * Boundary-clean: type-only import, so this stays within the `lib/app/**`
 * framework-agnostic boundary.
 *
 * Full guide: CUSTOMIZATION.md §4 · lib/email/registry.ts
 */
import type { EmailOverrides } from '@/lib/email/registry';
import ReclaimInvitationEmail from '@/components/app/emails/invitation';

export const emailOverrides: EmailOverrides = {
  /**
   * F8 t-1. The platform default is written for a SaaS team invite ("excited to have you on board",
   * "start collaborating with your team"); this is the first thing an invited leader reads from
   * Reclaim Your Week, and it needs Brief §7's reassurance register instead. Third-person attribution
   * to Rashmir (I1). Overriding the kind here is exactly the seam's purpose — `emails/invitation.tsx`
   * stays untouched as the platform reference (I10).
   */
  invitation: ReclaimInvitationEmail,
};
