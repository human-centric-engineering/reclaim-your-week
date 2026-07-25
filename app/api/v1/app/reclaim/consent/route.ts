/**
 * Consent (F8 t-4).
 *
 * GET  /api/v1/app/reclaim/consent  → what this leader must accept, and whether they have
 * POST /api/v1/app/reclaim/consent  → record acceptance of a policy version + the marketing choice
 *
 * The version comes from `Module.config`, never from the client: a caller cannot consent on behalf of
 * a policy that is not the current one, and bumping the version re-asks everyone by construction.
 * `marketingOptIn` is its own field with its own meaning — accepting terms never implies it
 * (reconciliation 7, and UK GDPR/PECR: an opt-in must be a separate, affirmative act).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { readConsent, recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';

const consentSchema = z.object({
  /** Must equal the current policy version — a stale form is refused rather than silently accepted. */
  policyVersion: z.string().min(1).max(64),
  /** Explicit, and defaulted false: an absent field is never read as agreement. */
  marketingOptIn: z.boolean().default(false),
  /** The affirmative act itself. `false` is not a way to record a refusal; it is simply invalid. */
  acceptTerms: z.literal(true),
});

export const GET = withAuth(async (_request, session) => {
  const config = await readReclaimAccessConfig();
  const state = await readConsent(session.user.id, config.policyVersion);
  return successResponse(state);
});

export const POST = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, consentSchema);
  const config = await readReclaimAccessConfig();

  if (body.policyVersion !== config.policyVersion) {
    // The leader was shown an older policy than the one now in force — re-show it rather than record
    // an acceptance of terms they did not read.
    throw new ValidationError('These terms have been updated', {
      policyVersion: ['Please review the current terms and accept them again.'],
    });
  }

  await recordConsent(session.user.id, config.policyVersion, body.marketingOptIn);

  log.info('Reclaim consent recorded', {
    userId: session.user.id,
    policyVersion: config.policyVersion,
    marketingOptIn: body.marketingOptIn,
  });

  return successResponse({ accepted: true, policyVersion: config.policyVersion });
});
