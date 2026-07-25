/**
 * Reclaim — user bucket labels (F6 t-4).
 *
 * GET  /api/v1/app/reclaim/labels                → { labels: { token: label } }
 * POST /api/v1/app/reclaim/labels  { bucketSlug, label }  → set/clear one label
 *
 * A leader's own display labels for the nine areas. The canonical `bucketSlug` is never changed (I7);
 * an empty `label` resets to the default. Per-user (labels carry across audits), so no run id.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  readBucketLabels,
  setBucketLabel,
  LABEL_MAX_LENGTH,
} from '@/lib/app/programme/buckets/labels';

const labelSchema = z.object({
  bucketSlug: z.string().trim().min(1).max(60),
  label: z.string().max(LABEL_MAX_LENGTH * 2), // server re-checks the real cap; allow trim slack
});

export const GET = withAuth(async (_request, session) => {
  const labels = await readBucketLabels(session.user.id);
  return successResponse({ labels });
});

export const POST = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, labelSchema);
  await setBucketLabel(session.user.id, body.bucketSlug, body.label);
  log.info('Reclaim bucket label set', { bucketSlug: body.bucketSlug });
  return successResponse({ saved: true });
});
