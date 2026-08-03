/**
 * Preview accounts — list and create (F19). Admin only.
 *
 * GET  /api/v1/app/reclaim/admin/preview  → every test account, enriched (one read, no per-row fetches)
 * POST /api/v1/app/reclaim/admin/preview  → provision one, optionally fast-forwarded into a state
 *
 * ## The email default, which is the interesting decision here
 *
 * When the operator gives no address, the account is created at a **plus-subaddress of her own**:
 * `ada@example.org` becomes `ada+rywpreview-a7f2c9@example.org`. Every email the product would send a
 * leader — the welcome, the completion, anything added later — then lands in her own inbox, which is
 * the closest a test account can get to the real experience, and nothing bounces.
 *
 * The alternative, a made-up domain like `@reclaim.test`, is worse in both directions: it delivers
 * nowhere, so the emails cannot be checked, and in production every send is a hard bounce against the
 * sending domain's reputation. An address that cannot receive is not a cheaper test, it is a test with
 * a hole in it.
 *
 * An operator may type any address instead, and the help text says plainly that real product email
 * goes to it. That is the same exposure the Access screen already has: an admin can invite a stranger
 * there too.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { appUrl } from '@/lib/app/programme/urls';
import { listPreviewAccounts } from '@/lib/app/programme/admin/preview-list';
import {
  provisionPreviewAccount,
  fastForwardPreviewAccount,
} from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  /** Omitted means "a plus-subaddress of mine". */
  email: z.string().email().max(320).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  state: z.enum(['fresh', 'mid-audit', 'summary']).default('fresh'),
});

/**
 * `ada@example.org` → `ada+rywpreview-a7f2c9@example.org`.
 *
 * Falls back to a bare local part if the admin's own address is somehow unparseable, so a malformed
 * row in `user` degrades to a refusable address rather than throwing on a screen that was working.
 */
function defaultPreviewEmail(adminEmail: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const at = adminEmail.lastIndexOf('@');
  if (at <= 0) return `rywpreview-${suffix}@example.invalid`;
  return `${adminEmail.slice(0, at)}+rywpreview-${suffix}${adminEmail.slice(at)}`;
}

export const GET = withAdminAuth(async () => {
  return successResponse({ accounts: await listPreviewAccounts() });
});

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, createSchema);

  const email = (body.email ?? defaultPreviewEmail(session.user.email)).trim().toLowerCase();

  // Same refusal the invites route gives, for the same reason: an account already exists, so this
  // would create nothing and the operator should be told rather than shown a confusing failure.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    return errorResponse('An account already exists for this email', {
      code: ErrorCodes.EMAIL_TAKEN,
      status: 409,
    });
  }

  const account = await provisionPreviewAccount({
    label: body.label,
    email,
    name: body.name ?? 'Test participant',
    actorUserId: session.user.id,
  });

  const fabricated =
    body.state === 'fresh' ? null : await fastForwardPreviewAccount(account.userId, body.state);

  // No password, here or anywhere. It exists in the response body once and is never stored.
  log.info('Reclaim preview account created', {
    userId: account.userId,
    state: body.state,
    adminId: session.user.id,
  });

  return successResponse(
    {
      account: { userId: account.userId, email: account.email, label: body.label },
      password: account.password,
      signInUrl: `${appUrl()}/login`,
      run: fabricated,
      message:
        body.state === 'fresh'
          ? 'Test account created. Sign in with the password below to walk it from the consent gate.'
          : body.state === 'summary'
            ? 'Test account created, with an audit filled in and waiting at the summary. Sign in and it opens there, with the report and the sharing choices — finishing it is yours to press.'
            : 'Test account created and driven to mid-audit.',
    },
    undefined,
    { status: 201 }
  );
});
