/**
 * Reclaim group invite links — the QR code (F11). Admin only.
 *
 * GET /api/v1/app/reclaim/invite-links/:id/qr           → image/svg+xml (default; prints cleanly)
 * GET /api/v1/app/reclaim/invite-links/:id/qr?format=png → image/png (for slides)
 *
 * **Generated here rather than by a QR image service.** Every hosted QR API works by receiving the
 * payload as a query string, which would post a live bearer token to a third party on every render of
 * the admin page. The token is the capability; it does not leave this app.
 *
 * SVG is the default because the realistic use is a printed handout or a projected slide, and a
 * vector scales to either without the moiré a resized PNG gets. `errorCorrectionLevel: 'M'` is the
 * library default and the right one here: a higher level buys tolerance for a damaged code at the
 * cost of density, and a code that is about to be printed once is not the damaged case.
 *
 * Admin-guarded even though the token it encodes is meant to be shared — until Rashmir shows it, who
 * has been invited is hers to know, and an unauthenticated QR endpoint keyed on a guessable row id
 * would enumerate live links.
 */

import QRCode from 'qrcode';
import { withAdminAuth } from '@/lib/auth/guards';
import { errorResponse } from '@/lib/api/responses';
import { ErrorCodes, ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { prisma } from '@/lib/db/client';
import { buildJoinUrl } from '@/lib/app/programme/access/invite-links';

/** How wide the PNG is, in pixels. Large enough to project or print without resampling artefacts. */
const PNG_WIDTH = 1024;

export const GET = withAdminAuth<{ id: string }>(async (request, _session, { params }) => {
  const { id: rawId } = await params;
  const parsed = cuidSchema.safeParse(rawId);
  if (!parsed.success) throw new ValidationError('Invalid link id', { id: ['Must be a valid id'] });

  const link = await prisma.reclaimInviteLink.findUnique({
    where: { id: parsed.data },
    select: { token: true },
  });
  if (link === null) {
    return errorResponse('That link could not be found', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  const url = buildJoinUrl(link.token);
  const wantsPng = new URL(request.url).searchParams.get('format') === 'png';

  // `no-store`: a revoked link's code should stop being served the moment it is revoked, and this
  // response is cheap to regenerate.
  const headers = { 'Cache-Control': 'no-store' };

  if (wantsPng) {
    const png = await QRCode.toBuffer(url, { type: 'png', width: PNG_WIDTH, margin: 2 });
    return new Response(new Uint8Array(png), {
      headers: { ...headers, 'Content-Type': 'image/png' },
    });
  }

  const svg = await QRCode.toString(url, { type: 'svg', margin: 2 });
  return new Response(svg, {
    headers: { ...headers, 'Content-Type': 'image/svg+xml' },
  });
});
