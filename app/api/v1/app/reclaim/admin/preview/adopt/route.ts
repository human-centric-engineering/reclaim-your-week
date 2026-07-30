/**
 * Adopt an existing account as a test account (F19). Admin only.
 *
 * POST /api/v1/app/reclaim/admin/preview/adopt  → `{ email, label }`
 *
 * ## Why this exists, and why it is not an afterthought
 *
 * Account creation belongs entirely to Sunrise (`app/api/auth/accept-invite/route.ts`, unforkable
 * under I10) and there is no leaf hook at the moment an account appears (sunrise#464). So when an
 * operator does the most faithful test available — invite herself at a plus-address on the Access
 * screen, copy the link, and walk the real front door with a password and the consent gate — the
 * account that comes out the other side is, as far as this app can tell, a client. It counts in the
 * measures. It joins the aggregate cohort. It gets a quarterly nudge.
 *
 * This route closes that loop in one click. It is the reason `POST /preview` does not bother issuing
 * an invitation: there is nowhere to write the registry row at the moment the account is created, and
 * every way around that either pushes a preview concept into I14's one door or leaves a window where
 * the account is invisible to the exclusion. So the two are split by what they are good at — the
 * Access screen's link previews the **door**, this page previews the **states behind it**, and adopt
 * is what makes the first of those safe.
 *
 * Idempotent, because an operator who cannot remember whether she already adopted an account will
 * press it again, and being told off for that would teach her to avoid the button.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { registerPreviewAccount } from '@/lib/app/programme/preview/accounts';

const adoptSchema = z.object({
  email: z.string().email().max(320),
  label: z.string().trim().min(1).max(120),
});

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, adoptSchema);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (user === null) {
    return errorResponse('No account exists for that email', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  // An admin account marked as a test account would be quietly dropped from the figures while still
  // being somebody's real login. The mistake is easy to make (her own address is the obvious thing to
  // type) and hard to notice afterwards, which is exactly when a refusal earns its place.
  if (user.role === 'ADMIN') {
    return errorResponse('An admin account cannot be marked as a test account', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  }

  await registerPreviewAccount({
    userId: user.id,
    label: body.label,
    createdByUserId: session.user.id,
  });

  log.info('Reclaim preview account adopted', { userId: user.id, adminId: session.user.id });

  return successResponse({
    userId: user.id,
    message:
      'Marked as a test account. It is now left out of the published figures and the quarterly reminder, and is badged wherever it appears.',
  });
});
