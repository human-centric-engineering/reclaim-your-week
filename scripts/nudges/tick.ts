/**
 * The quarterly-nudge tick, as a command (post-v1 P5).
 *
 * ## Why a script and not just the HTTP route
 *
 * F9 t-3 shipped `POST /api/v1/app/reclaim/nudges/tick`, admin-guarded, "designed to be called by an
 * external cron" — which is the platform's own pattern for its scheduler. What it never got was a
 * cron, so the entire mechanism the feature exists for has never fired.
 *
 * Wiring one turned out to be a choice rather than a chore, and this is the reasoning:
 *
 * - **The HTTP route needs credentials a scheduler does not naturally have.** `withAdminAuth` wants a
 *   session or an admin-scoped API key. Vercel Cron issues **GET** requests, so using it would mean
 *   adding a GET handler that sends email — a mutating GET on a mail path, which is a much worse
 *   trade than the one the unsubscribe page makes (that one is subtractive and idempotent; this one
 *   is neither).
 * - **A second auth scheme for one route is what F9 explicitly declined.** The route's own comment
 *   argues that inventing a `CRON_SECRET` beside the platform's audited guard is the worse trade.
 *   Nothing has changed about that.
 * - **A command needs no auth surface at all.** It runs where the deployment already trusts itself,
 *   talks to the database directly the way the seeds and smokes do, and adds no publicly reachable
 *   endpoint. On any host with a scheduler that can run a process — a container, a system crontab, a
 *   Railway/Fly scheduled job, a GitHub Actions `schedule` — this is simply the thing to run.
 *
 * The HTTP route stays exactly as it is, for an operator who wants to trigger a run by hand and for
 * serverless hosts that can only hit URLs. The two share `runNudgeTick`, so they cannot drift.
 *
 * ## Cadence
 *
 * **Daily** is right, not hourly. A nudge falls due ninety days after a completed audit, so the
 * resolution that matters is a day, and `runNudgeTick` claims each send against the audit it is about
 * — running it twice in a day sends nothing the second time. Pick a civil hour; the leaders receiving
 * these are not waiting for them.
 *
 *     # every day at 09:15 UTC
 *     15 9 * * *  cd /srv/reclaim && npm run nudges:tick >> /var/log/reclaim-nudges.log 2>&1
 *
 * Run: `npm run nudges:tick`
 */

import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db/client';
import { runNudgeTick } from '@/lib/app/programme/nudges/tick';

async function main(): Promise<void> {
  const started = Date.now();
  const result = await runNudgeTick();

  // One structured line is the whole point of running this on a schedule: an operator wants to know
  // it ran, what it decided, and whether anything failed — without reading a mail provider's console.
  logger.info('Reclaim: quarterly nudge tick finished', {
    ...result,
    durationMs: Date.now() - started,
  });

  // `failed` counts leaders whose claim could not be written. A non-zero exit lets a scheduler
  // surface that as a failed job rather than a silent partial run, which is the failure mode the
  // per-candidate isolation in `runNudgeTick` was added to make visible rather than to hide.
  if (result.failed > 0) {
    throw new Error(`${result.failed} of ${result.considered} candidates could not be claimed`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    logger.error('Reclaim: quarterly nudge tick failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.$disconnect();
    process.exit(1);
  });
