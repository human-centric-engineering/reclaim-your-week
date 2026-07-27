/**
 * Smoke: the conversational surface's server contract, against real Postgres.
 *
 * Everything the conversational stages built is unit-tested against mocks. This is the part mocks
 * cannot reach: the moment ledger is a Postgres scalar list updated conditionally, the transition
 * gate reads it back, and the coach's phase context is assembled from four real reads. A conditional
 * `updateMany` that silently matches nothing looks exactly like one that worked, right up until two
 * tabs both open the same beat.
 *
 * **No provider key needed.** Nothing here calls a model: the opening turn's *claim* is asserted
 * rather than its generation, which is the half that has to be exactly once. So unlike
 * `smoke:reclaim-calendar` this can run in CI, and it is in `leaf:checks`.
 *
 * A throwaway user, erased at the end.
 *
 * Run:  npm run smoke:reclaim-coach
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig, readReclaimSignposts } from '@/lib/app/programme/config';
import { buildCoachPhaseContext } from '@/lib/app/programme/coach/phase-context';
import { CHART_REVEAL_MOMENT } from '@/lib/app/programme/chart/reveal';
import { chartRevealed } from '@/lib/app/programme/chart/reveal';
import { RECLAIM_PROCESS_OUTLINE, RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import {
  createRun,
  transitionRun,
  saveRunAnswer,
  claimCoachOpening,
  readCoachOpenings,
  loadCurrentRunState,
} from '@/app/api/v1/app/reclaim/runs/service';

const PREFIX = 'smoke-reclaim-coach';

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  const user = await prisma.user.create({
    data: {
      name: `${PREFIX} subject`,
      email: `${PREFIX}-${process.pid}@example.com`,
      role: 'USER',
    },
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
    console.log(`[2] run ${run.id} created`);

    // ── 3. The signpost card comes from Module.config, not from a constant ──
    const signposts = await readReclaimSignposts();
    const setup = signposts.find((s) => s.phaseKey === 'phase-0-setup');
    if (setup === undefined) fail('no signpost for phase 0 in the stored config');
    if (!setup.opening.includes(RECLAIM_PROCESS_OUTLINE)) {
      fail("phase 0's opening no longer carries the process outline as its own beat (I11 hop 2)");
    }
    console.log('[3] the phase opens from stored config, with the outline intact');

    // ── 4. A new run has fired no moments ──
    if ((await readCoachOpenings(uid, run.id)).length !== 0) {
      fail('a new run already has coach openings');
    }

    // ── 5. A moment is claimed exactly once, however many callers race for it ──
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimCoachOpening(uid, run.id, 'phase-5-action'))
    );
    const won = claims.filter(Boolean).length;
    if (won !== 1) fail(`five concurrent claims produced ${won} winners, expected exactly 1`);
    const ledger = await readCoachOpenings(uid, run.id);
    if (ledger.filter((m) => m === 'phase-5-action').length !== 1) {
      fail(`the moment is in the ledger ${ledger.length} times, expected once`);
    }
    console.log('[5] five racing claims produced one turn, and one ledger entry');

    // ── 6. Another leader cannot claim a moment on this run ──
    const other = await prisma.user.create({
      data: {
        name: `${PREFIX} other`,
        email: `${PREFIX}-other-${process.pid}@example.com`,
        role: 'USER',
      },
    });
    if (await claimCoachOpening(other.id, run.id, 'phase-4-gap')) {
      fail("another leader claimed a moment on someone else's run");
    }
    await prisma.user.delete({ where: { id: other.id } });
    console.log('[6] a moment cannot be claimed on a run that is not yours');

    // ── 7. The ledger reaches the client through the run state ──
    const state = await loadCurrentRunState(uid);
    if (!state.run?.coachOpenings.includes('phase-5-action')) {
      fail('the run state does not carry the ledger, so the surface would replay the beat');
    }
    console.log('[7] the ledger reaches the surface, so a reload replays nothing');

    // ── 8. I12: phase 1 cannot be left until the picture has been shown ──
    await transitionRun(uid, run.id, 'phase-0-setup');
    for (const bucket of RECLAIM_BUCKETS.filter((b) => !b.conditional)) {
      await saveRunAnswer(uid, run.id, {
        slotSlug: `reclaim_current_hours__${bucketToken(bucket.slug)}`,
        value: '4',
        valueJson: 4,
      });
    }
    await saveRunAnswer(uid, run.id, { slotSlug: 'reclaim_reflection_p1', value: 'A lot of it.' });
    if (chartRevealed(await readCoachOpenings(uid, run.id))) {
      fail('the reveal is recorded before the leader has seen anything');
    }
    // The route refuses here; the smoke asserts the fact the route reads, which is what has to be
    // true in the database rather than in a mock.
    await claimCoachOpening(uid, run.id, CHART_REVEAL_MOMENT);
    if (!chartRevealed(await readCoachOpenings(uid, run.id))) {
      fail('the reveal was not recorded, so the transition gate would never open');
    }
    console.log('[8] the reveal is a recorded fact, and the gate reads it');

    // ── 9. The coach's phase context is assembled from real reads ──
    const block = await buildCoachPhaseContext(uid);
    if (!block.includes('phase 1 of 6')) fail('the coach is not told which phase it is in');
    if (!block.includes('Do not restate'))
      fail('the coach is not told the card has already spoken');
    if (!block.includes('what stands out to you here')) {
      fail('the reveal instruction is missing, so the coach would interpret in the same beat');
    }
    console.log(
      '[9] the coach is told where it is, what the card said, and how to hold the reveal'
    );
  } finally {
    await eraseUser({
      userId: uid,
      userEmail: user.email,
      actorUserId: uid,
      reason: 'self_service',
    }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(
    '\n✓ smoke:reclaim-coach passed — signpost from config, moments claimed once, the I12 gate, the phase context'
  );
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-coach failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
