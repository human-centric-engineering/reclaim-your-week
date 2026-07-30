/**
 * Smoke: the summary PDF renders from a real run, against real Postgres (F15).
 *
 * The unit test renders the document from a hand-built `AuditSummary`, which proves react-pdf can
 * lay it out. This proves the other half: that a **real run**, read through `buildSummary` out of the
 * database, produces a summary the document can render. Those are different failures. A column that
 * comes back as a string where the document expects a number, a JSON reading that survives the round
 * trip in a shape the parser drops, a chart with no buckets because the answers were run-scoped away
 * — none of them is reachable from a fixture.
 *
 * **It never calls the analyst.** The reading is written straight to the column, so this needs no
 * provider key and gates in CI from the day it lands. The expensive proof that a real model can get
 * a reading past the guards is `smoke:reclaim-analyst`, and the two deliberately do not share a
 * script: one of them would have to become manual, and it would be this one.
 *
 * Throwaway user, erased at the end.
 *
 * Run:  npm run smoke:reclaim-report
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { buildSummary } from '@/lib/app/programme/summary';
import { renderSummaryPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-summary-pdf';
import { completeRun, createRun, saveRunAnswer } from '@/app/api/v1/app/reclaim/runs/service';

const PREFIX = 'smoke-reclaim-report';

function fail(message: string): never {
  throw new Error(message);
}

/** A reading in the shape the analyst produces, written directly so no model is involved. */
const READING = {
  gaps: [
    { token: 'deep_work', observation: 'Deep work sits at four hours against the ten you wanted.' },
    { token: 'delivery_operations', observation: 'Delivery holds twenty two hours of the week.' },
  ],
  pathway: [
    { horizon: 'now', step: 'Two protected mornings a week', difference: 'Room to think.' },
    { horizon: 'next', step: 'Handing over one recurring meeting', difference: 'Two hours back.' },
    { horizon: 'later', step: 'A standing review', difference: 'Less pulled into the detail.' },
  ],
};

async function main(): Promise<void> {
  const email = `${PREFIX}-${process.pid}@example.com`;
  const user = await prisma.user.create({
    data: { name: `${PREFIX} subject`, email, role: 'USER' },
  });
  const uid = user.id;
  console.log(`[1] throwaway subject ${uid}`);

  try {
    await prisma.reclaimGrant.create({
      data: { id: `standard_${uid}`, userId: uid, tier: 'standard', auditsGranted: 1 },
    });
    const { policyVersion } = await readReclaimAccessConfig();
    await recordConsent(uid, policyVersion, false);
    const run = await createRun(uid, '2026 Q3');

    const write = (slotSlug: string, value: string, valueJson?: unknown) =>
      saveRunAnswer(uid, run.id, {
        slotSlug,
        value,
        ...(valueJson === undefined ? {} : { valueJson }),
      });

    await write('reclaim_profile_first_name', 'Sam');
    await write('reclaim_profile_role', 'Chief Executive');
    await write('reclaim_setup_audit_period', 'last quarter');
    await write('reclaim_setup_priorities', 'Get the new programme funded');
    for (const bucket of RECLAIM_BUCKETS.filter((b) => !b.conditional)) {
      const token = bucketToken(bucket.slug);
      const now = token === 'delivery_operations' ? 22 : 4;
      await write(`reclaim_current_hours__${token}`, String(now), now);
      await write(`reclaim_ideal_hours__${token}`, '8', 8);
    }
    await write('reclaim_action_chosen', 'Two protected mornings a week');
    console.log('[2] a run written through the real write path');

    // ── 3. Renders with no analyst reading, which is the common case ──
    const plain = await buildSummary(uid, run.id);
    if (plain.analyst !== null) fail('a fresh run already carries an analyst reading');
    if (plain.current.buckets.length === 0) fail('the summary carries no areas');
    const withoutReading = await renderSummaryPdf(plain);
    if (withoutReading.subarray(0, 4).toString('latin1') !== '%PDF') {
      fail('what came back is not a PDF');
    }
    console.log(`[3] renders without a reading: ${withoutReading.length} bytes`);

    // ── 4. The reading survives the JSONB round trip and reaches the document ──
    await prisma.reclaimAuditRun.update({
      where: { id: run.id },
      data: { analystReading: READING },
    });
    const enriched = await buildSummary(uid, run.id);
    if (enriched.analyst === null) {
      fail(
        'the stored reading did not survive the round trip into buildSummary. Either JSONB came ' +
          'back in a shape parseAnalystReading refuses, or the run-scoped token set does not ' +
          'contain the areas the reading names.'
      );
    }
    if (enriched.analyst.gaps.length !== READING.gaps.length) {
      fail('the reading lost a gap between the database and the summary');
    }
    const withReading = await renderSummaryPdf(enriched);
    if (withReading.length <= withoutReading.length) {
      fail('the two sections rendered no larger a document, so they were silently dropped');
    }
    console.log(`[4] renders with the reading: ${withReading.length} bytes`);

    // ── 5. Completing a run sends exactly one message, and cannot be broken by it ──
    //
    // `sendEmail` returns `{status:'disabled'}` outside production when no provider is configured,
    // which is the shape CI runs in. What is being proved here is not that mail left the building:
    // it is that `completeRun` survives the whole email path, and that a leader who finishes an
    // audit is not handed an error by a best-effort side effect. The analyst is skipped for the
    // same reason it is everywhere in this script.
    const completed = await completeRun(uid, run.id);
    if (completed.status !== 'complete') fail('completeRun did not complete the run');
    if (completed.completedAt === null) fail('a completed run carries no completion time');
    console.log('[5] completeRun survives the analyst attempt and the completion email');

    console.log('✓ smoke:reclaim-report passed — a real run renders, and completes cleanly');
  } finally {
    await eraseUser({ userId: uid, userEmail: email, actorUserId: uid, reason: 'self_service' });
  }
}

main().catch((error: unknown) => {
  console.error(`\n✗ smoke:reclaim-report failed: ${String(error)}`);
  process.exit(1);
});
