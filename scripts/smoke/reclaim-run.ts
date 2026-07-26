/**
 * Smoke: the audit run lifecycle end to end against real Postgres (F4 t-3).
 *
 * Drives the run service (create → answer → transition → complete → resume) — the parts unit tests
 * can't reach without a DB — and asserts the load-bearing invariants: run-stamped answers (F1), the
 * server reflection gate (I9), conversation-close on completion (I15), and a fresh run afterwards.
 * Assumes the app-reclaim seeds have run (the map must be published). A throwaway user, erased at the
 * end. Real Postgres.
 *
 * Run:  npm run smoke:reclaim-run
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { getSlotHeads } from '@/lib/framework/data-slots';
import { MODULE_SURFACE_CONTEXT_TYPE } from '@/lib/framework/guidance/surface';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import { missingReflectionSlug } from '@/lib/app/programme/runs/reflection';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { buildSummary } from '@/lib/app/programme/summary';
import { recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';
import {
  createRun,
  transitionRun,
  completeRun,
  saveRunAnswer,
  linkRunConversation,
  loadCoachTurnTarget,
} from '@/app/api/v1/app/reclaim/runs/service';

const PREFIX = 'smoke-reclaim-run';

function fail(message: string): never {
  throw new Error(message);
}

/** The run id stamped on a slot's current head (provenance is a Json column). */
async function slotRunId(userId: string, slug: string): Promise<string | undefined> {
  const [head] = await getSlotHeads(userId, { slotSlugs: [slug] });
  const provenance = head?.provenance;
  if (provenance && typeof provenance === 'object' && 'runId' in provenance) {
    const runId = (provenance as Record<string, unknown>).runId;
    return typeof runId === 'string' ? runId : undefined;
  }
  return undefined;
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
    // ── 2. Create a run (journey + row + enter Phase 0); refuse a second ──
    // F8 t-2: the gate no longer bootstraps a grant for any account (that was F6's placeholder, and in
    // production it meant self-serve access). This smoke is about the run *lifecycle*, so it grants the
    // entitlement directly; `smoke:reclaim-access` is what exercises the invite → grant path itself.
    await prisma.reclaimGrant.create({
      data: { id: `standard_${uid}`, userId: uid, tier: 'standard', auditsGranted: 1 },
    });
    // F8 t-4: consent stands in front of entitlement, so a run cannot start without it. Recorded here
    // for the same reason as the grant — `smoke:reclaim-access` is what tests the gates themselves.
    const { policyVersion } = await readReclaimAccessConfig();
    await recordConsent(uid, policyVersion, false);
    const run = await createRun(uid, '2026 Q3');
    if (run.status !== 'in_progress')
      fail(`new run status is "${run.status}", expected in_progress`);
    const journey = await prisma.userJourney.findUnique({
      where: {
        userId_graphSlug_contextKey: {
          userId: uid,
          graphSlug: RECLAIM_MODULE_SLUG,
          contextKey: run.id,
        },
      },
    });
    if (!journey) fail('createRun did not create the UserJourney');
    let refused = false;
    await createRun(uid).catch(() => (refused = true));
    if (!refused) fail('a second in_progress run was allowed');
    console.log(`[2] run ${run.id} created (journey + Phase 0); second run refused`);

    // ── 3. Save an answer — stamped with this run (I3 + F1) ───────────────
    await saveRunAnswer(uid, run.id, { slotSlug: 'reclaim_profile_first_name', value: 'Sam' });
    if ((await slotRunId(uid, 'reclaim_profile_first_name')) !== run.id) {
      fail('saved answer was not stamped with the run id');
    }
    console.log('[3] answer saved and stamped with the run id');

    // ── 4. Transition Phase 0 → 1 (no reflection gate on Phase 0) ─────────
    const t1 = await transitionRun(uid, run.id, 'phase-0-setup');
    if (t1.enteredPhaseKey !== 'phase-1-current')
      fail(`entered "${t1.enteredPhaseKey}", expected phase-1-current`);
    console.log('[4] transitioned Phase 0 → 1');

    // ── 5. Reflection gate (I9): Phase 1 → 2 blocked until p1 is present ──
    if ((await missingReflectionSlug(uid, run.id, 'phase-1-current')) !== 'reclaim_reflection_p1') {
      fail('reflection gate did not report the missing p1 slot');
    }
    await saveRunAnswer(uid, run.id, {
      slotSlug: 'reclaim_reflection_p1',
      value: 'What stood out: how little recovery time there is.',
    });
    if ((await missingReflectionSlug(uid, run.id, 'phase-1-current')) !== null) {
      fail('reflection gate still blocks after p1 was captured');
    }
    const t2 = await transitionRun(uid, run.id, 'phase-1-current');
    if (t2.enteredPhaseKey !== 'phase-2-energy')
      fail(`entered "${t2.enteredPhaseKey}", expected phase-2-energy`);
    console.log('[5] reflection gate blocked, then cleared, then transitioned Phase 1 → 2');

    // ── 6. Completion (I15): a surface conversation is closed ─────────────
    const coach = await prisma.aiAgent.findUnique({
      where: { slug: 'reclaim-coach' },
      select: { id: true },
    });
    if (!coach) fail('coach agent not seeded — run db:seed');
    const convo = await prisma.aiConversation.create({
      data: {
        userId: uid,
        agentId: coach.id,
        contextType: MODULE_SURFACE_CONTEXT_TYPE,
        contextId: RECLAIM_MODULE_SLUG,
        isActive: true,
      },
    });
    // The run owns its conversation (the conversational surface). The coach stream links the
    // conversation its first turn opens; here we drive that link directly, because the assertion worth
    // having is the one a timestamp guess used to fail: write-once, and never overwritten by a later
    // conversation. Also check the turn target reads the link back, since that is what a resumed
    // conversation depends on.
    await linkRunConversation(run.id, convo.id);
    const linked = await prisma.reclaimAuditRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { conversationId: true },
    });
    if (linked.conversationId !== convo.id) {
      fail(`run's conversation is "${linked.conversationId}", expected "${convo.id}"`);
    }
    const target = await loadCoachTurnTarget(uid, run.id);
    if (target.conversationId !== convo.id) {
      fail(`coach turn would open a new conversation instead of resuming ${convo.id}`);
    }
    if (target.phaseKey !== 'phase-2-energy') {
      fail(`coach turn scope names phase "${target.phaseKey}", expected phase-2-energy`);
    }
    await linkRunConversation(run.id, 'a-later-conversation');
    const stillLinked = await prisma.reclaimAuditRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { conversationId: true },
    });
    if (stillLinked.conversationId !== convo.id) {
      fail('a second link overwrote the run’s original conversation attribution');
    }
    console.log('[6a] run linked to its conversation, write-once, and resumed by the turn target');

    const completed = await completeRun(uid, run.id);
    if (completed.status !== 'complete') fail(`completed run status is "${completed.status}"`);
    const convoAfter = await prisma.aiConversation.findUnique({
      where: { id: convo.id },
      select: { isActive: true },
    });
    if (convoAfter?.isActive !== false)
      fail('I15: surface conversation was not closed on completion');
    console.log('[6] run completed; surface conversation closed (isActive:false)');

    // ── 7. Entitlement (I14, F6 t-1 / F8 t-2): one complete audit ────────
    // Completing the run consumed the standard-tier allowance granted in step 2, so a second audit is
    // refused until the grant is topped up (which is what F8's client tier and referral unlock do).
    let refusedAfterExhaustion = false;
    await createRun(uid).catch(() => (refusedAfterExhaustion = true));
    if (!refusedAfterExhaustion) fail('free tier allowed a second audit after one was completed');
    await prisma.reclaimGrant.updateMany({
      where: { userId: uid },
      data: { auditsGranted: { increment: 1 } },
    });
    const run2 = await createRun(uid);
    if (run2.id === run.id) fail('second run reused the first run id');
    console.log(`[7] free tier refused a 2nd audit; after a top-up, fresh run ${run2.id} allowed`);

    // ── 8. The repeat-audit read: run 1 stays readable once run 2 answers ──
    //
    // This is the real-Postgres half of the run-scoping fix, and the only place the JSON-path filter
    // and Postgres's actual supersession behaviour meet. Before the fix, answering ANY slug in run 2
    // superseded run 1's version of it and `readRunAnswers(uid, run.id)` silently stopped returning
    // it — which is what emptied the public share link a leader had already sent to a colleague.
    await saveRunAnswer(uid, run2.id, {
      slotSlug: 'reclaim_profile_first_name',
      value: 'Sam (second audit)',
    });

    const runOneAfter = await readRunAnswers(uid, run.id);
    if (runOneAfter['reclaim_profile_first_name']?.value !== 'Sam') {
      fail(
        `run 1's answer was lost once run 2 superseded it — got ${JSON.stringify(
          runOneAfter['reclaim_profile_first_name']
        )}, expected "Sam"`
      );
    }

    const runTwoAfter = await readRunAnswers(uid, run2.id);
    if (runTwoAfter['reclaim_profile_first_name']?.value !== 'Sam (second audit)') {
      fail("run 2's own answer did not read back");
    }

    // And the summary built on it — the thing behind the share token — still renders run 1.
    const runOneSummary = await buildSummary(uid, run.id);
    if (runOneSummary.firstName !== 'Sam') {
      fail(`the shared summary for run 1 hollowed out: firstName is ${runOneSummary.firstName}`);
    }
    console.log('[8] run 1 still reads (and still summarises) after run 2 superseded its answers');
  } finally {
    // Erase the throwaway user — cascades the runs, journey, slot values, and conversation.
    await eraseUser({
      userId: uid,
      userEmail: user.email,
      actorUserId: uid,
      reason: 'self_service',
    }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(
    '\n✓ smoke:reclaim-run passed — create, answer, reflection gate, complete, repeat, run-scoped reads'
  );
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-run failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
