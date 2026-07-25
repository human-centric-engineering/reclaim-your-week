/**
 * Grants — give an existing account another audit (F8 t-2). Admin only.
 *
 * POST /api/v1/app/reclaim/grants  { email, tier }
 *
 * The invite flow deliberately cannot do this: core's `/accept-invite` creates the user, so it refuses
 * an address that already has an account, and redemption refuses an account that predates its invite
 * (the email-hijack guard). Without this route an exhausted leader has no way back — and the refusal
 * they are shown promises exactly this ("Rashmir can open that up for you").
 *
 * Distinct from issuing an invite, and deliberately so: no email is sent, no token is minted, nothing
 * is claimed. It writes one row in the ledger the gate already reads.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { grantAnotherAudit } from '@/lib/app/programme/access/grants';
import { RECLAIM_INVITE_TIERS } from '@/lib/app/programme/access/tiers';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';

const grantSchema = z.object({
  email: z.string().email().max(320),
  tier: z.enum(RECLAIM_INVITE_TIERS),
});

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, grantSchema);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user === null) {
    // No account yet — an invitation is the right instrument, not a grant.
    return errorResponse('No account exists for this email — send them an invitation instead', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  const config = await readReclaimAccessConfig();
  const today = new Date().toISOString().slice(0, 10);
  const minted = await grantAnotherAudit(user.id, body.tier, today, config);

  log.info('Reclaim: audit re-granted to an existing account', {
    userId: user.id,
    tier: body.tier,
    minted,
    adminId: session.user.id,
  });

  return successResponse({
    granted: minted,
    message: minted
      ? 'They can start another audit now.'
      : 'They were already given another audit today.',
  });
});
