/**
 * Smoke: preview accounts, against real Postgres and the real facilitation engine (F19).
 *
 * Six claims here cannot be reached from a mocked test, and one of them is the claim the whole
 * feature rests on:
 *
 *   1. **A provisioned account can actually sign in.** `provisionPreviewAccount` follows
 *      `accept-invite`'s ordering — sign up, then force `emailVerified` — and that ordering only
 *      fails against a real better-auth. A mocked test would happily accept an account nobody can
 *      log in to, and hand the operator a password that does not work.
 *   2. **Six real transitions reach the last phase, and stop there.** This is the assertion
 *      `smoke:reclaim-report-agent` gave up when it wrote `.catch(() => undefined)` around its
 *      transitions. Stopping is now half the claim: the fabricator leaves the run in progress on the
 *      summary — where the report and the sharing choices are — and finishing is the operator's own
 *      press. So this script presses it, through `completeRun`, exactly as the phase-6 panel does.
 *   3. **Neither the fabrication nor the completion calls a model.** Asserted by counting
 *      `ai_cost_log` rows across the window rather than by trusting the ordering in the source.
 *   4. **The canned reading survives the JSONB round trip** and the run's own token check, so the
 *      summary has a report agent section rather than two empty panels.
 *   5. **The published figures do not move.** `readAggregate` and `readMeasures` are read before and
 *      after fabricating a completed audit and must come back byte-identical. No mocked test can
 *      make this claim, because the thing being tested is what real SQL returns.
 *   6. **Erasure takes the registry row with it**, so the exclusion list can never name a ghost.
 *
 * Key-less by construction, like `smoke:reclaim-report`: the reading is written rather than
 * generated, so this gates in CI from the day it lands.
 *
 * Throwaway accounts, erased in a `finally`.
 *
 * Run:  npm run smoke:reclaim-preview
 */

import { prisma } from '@/lib/db/client';
import { auth } from '@/lib/auth/config';
import { eraseUser } from '@/lib/privacy/erase-user';
import { buildSummary } from '@/lib/app/programme/summary';
import { readAggregate } from '@/lib/app/programme/admin/aggregate';
import { readMeasures } from '@/lib/app/programme/admin/measures';
import { listPreviewAccounts } from '@/lib/app/programme/admin/preview-list';
import { isPreviewAccount } from '@/lib/app/programme/preview/accounts';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';
import { completeRun } from '@/app/api/v1/app/reclaim/runs/service';
import {
  provisionPreviewAccount,
  fastForwardPreviewAccount,
} from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';

const PREFIX = 'smoke-reclaim-preview';

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  // The operator doing this. A real row, because `createdByUserId` is a foreign key.
  const adminEmail = `${PREFIX}-admin-${process.pid}@example.com`;
  const admin = await prisma.user.create({
    data: { name: `${PREFIX} admin`, email: adminEmail, role: 'ADMIN' },
  });
  console.log(`[1] throwaway operator ${admin.id}`);

  let previewId: string | null = null;
  let previewEmail: string | null = null;
  // Set in the `finally` and acted on after it. Throwing from a `finally` would swallow whatever
  // failure sent us there, which is always the more interesting one.
  let registrySurvivedErasure = false;

  try {
    // ── 2. The figures, before anything exists ──
    //
    // Read first so the comparison at the end is against this install's actual state rather than
    // against an assumption that it is empty. On a developer's machine it rarely is.
    const aggregateBefore = JSON.stringify(await readAggregate());
    const measuresBefore = JSON.stringify(await readMeasures());
    console.log('[2] the published figures, before');

    // ── 3. Provision, and prove the account can sign in ──
    const provisioned = await provisionPreviewAccount({
      label: `${PREFIX} walkthrough`,
      email: `${PREFIX}-${process.pid}@example.com`,
      name: `${PREFIX} subject`,
      actorUserId: admin.id,
    });
    previewId = provisioned.userId;
    previewEmail = provisioned.email;

    if (!(await isPreviewAccount(previewId))) {
      fail('the provisioned account is not in the registry, so nothing would exclude it');
    }

    // The assertion no mocked test can make: better-auth itself accepts these credentials.
    const signIn = await auth.api.signInEmail({
      body: { email: provisioned.email, password: provisioned.password },
      asResponse: true,
    });
    if (!signIn.ok) {
      fail(
        `the provisioned account cannot sign in (${signIn.status}). The most likely cause is the ` +
          'emailVerified write landing after sign-up in a way better-auth does not see, which is ' +
          'exactly the ordering this script exists to pin.'
      );
    }
    console.log(`[3] provisioned ${previewId}, and it can sign in`);

    // ── 4. Six real transitions, a run left at the summary, and a completion that calls no model ──
    const costBefore = await prisma.aiCostLog.count();

    const result = await fastForwardPreviewAccount(previewId, 'summary');
    if (!result.atSummary) fail('the fast-forward did not report a run waiting at the summary');

    const finalPhase = RECLAIM_PHASE_KEYS[RECLAIM_PHASE_KEYS.length - 1];
    if (result.reachedPhaseKey !== finalPhase) {
      fail(`the walk stopped at ${result.reachedPhaseKey} rather than ${String(finalPhase)}`);
    }

    // The point of the whole state: it is still in progress, so `loadCurrentRunState` finds it and
    // signing in as the account opens on the summary rather than on the invitation to begin.
    const waiting = await prisma.reclaimAuditRun.findUniqueOrThrow({ where: { id: result.runId } });
    if (waiting.status !== 'in_progress') {
      fail(
        `the fabricated run is ${waiting.status}. Anything but in_progress and the account opens on ` +
          'the entry screen, which is the bug this state exists to fix.'
      );
    }

    // Now the button the leader presses. Through the service the phase-6 panel calls, so the smoke
    // covers the completion path rather than a fabricator's private shortcut through it.
    await completeRun(previewId, result.runId);

    const run = await prisma.reclaimAuditRun.findUniqueOrThrow({ where: { id: result.runId } });
    if (run.status !== 'complete') fail(`the run is ${run.status}, not complete`);
    if (run.completedAt === null) fail('a completed run carries no completion time');

    const costAfter = await prisma.aiCostLog.count();
    if (costAfter !== costBefore) {
      fail(
        `${costAfter - costBefore} provider call(s) were billed. The canned reading must be written ` +
          'by the fabricator, or ensureReportReading finds an empty column and calls the report agent.'
      );
    }
    console.log(
      `[4] walked to ${finalPhase}, waited there, completed, ${costAfter - costBefore} provider calls`
    );

    // ── 5. The reading survives the round trip into the summary ──
    const summary = await buildSummary(previewId, result.runId);
    if (summary.report === null) {
      fail(
        'the canned reading did not survive into buildSummary. Either JSONB came back in a shape ' +
          'parseReportReading refuses, or the reading names an area this run does not have — ' +
          'which is the failure the derived fixture exists to prevent.'
      );
    }
    if (summary.report.gaps.length < 2) fail('the reading lost a gap on the way through');
    console.log(`[5] the summary carries ${summary.report.gaps.length} gaps and a pathway`);

    // ── 6. The operator can see it ──
    const listed = await listPreviewAccounts(admin.id);
    const row = listed.find((a) => a.userId === previewId);
    if (row === undefined) fail('the test account is missing from the preview list');
    if (row.state !== 'complete') fail(`the list reports ${row.state}, not complete`);
    console.log('[6] it appears on the preview screen, with the right state');

    // ── 7. The figures have not moved. The claim the whole feature rests on ──
    const aggregateAfter = JSON.stringify(await readAggregate());
    const measuresAfter = JSON.stringify(await readMeasures());

    if (aggregateAfter !== aggregateBefore) {
      fail(
        'the anonymised aggregate changed. A test account reached the k-anonymity cohort, which is ' +
          'the most damaging thing this feature could do: one fabricated audit can tip a cohort ' +
          'over the suppression threshold and publish invented hours as evidence.'
      );
    }
    if (measuresAfter !== measuresBefore) {
      fail('the published measures changed, so a test account is being counted as a client');
    }
    console.log('[7] the aggregate and the measures are unchanged');
  } finally {
    // ── 8. Erasure takes the registry row with it ──
    if (previewId !== null && previewEmail !== null) {
      await eraseUser({
        userId: previewId,
        userEmail: previewEmail,
        actorUserId: admin.id,
        reason: 'admin_action',
      });

      const registryRow = await prisma.reclaimPreviewAccount.findUnique({
        where: { userId: previewId },
      });
      // Recorded rather than thrown here — see the declaration. Not cosmetic either way: the
      // exclusion queries read this table for user ids, so a row surviving its user would put a dead
      // id into every cohort filter, and a recycled id would inherit somebody else's preview flag.
      registrySurvivedErasure = registryRow !== null;
      if (!registrySurvivedErasure)
        console.log('[8] erased, and the registry row cascaded with it');
    }

    await eraseUser({
      userId: admin.id,
      userEmail: adminEmail,
      actorUserId: admin.id,
      reason: 'self_service',
    });
  }

  if (registrySurvivedErasure) {
    fail('the registry row survived erasure, so the CASCADE on `userId` is not in place');
  }

  console.log(
    '✓ smoke:reclaim-preview passed — a test account walks the real engine and moves nothing'
  );
}

main().catch((error: unknown) => {
  console.error(`\n✗ smoke:reclaim-preview failed: ${String(error)}`);
  process.exit(1);
});
