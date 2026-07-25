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
import {
  createRun,
  transitionRun,
  completeRun,
  saveRunAnswer,
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
    const completed = await completeRun(uid, run.id);
    if (completed.status !== 'complete') fail(`completed run status is "${completed.status}"`);
    const convoAfter = await prisma.aiConversation.findUnique({
      where: { id: convo.id },
      select: { isActive: true },
    });
    if (convoAfter?.isActive !== false)
      fail('I15: surface conversation was not closed on completion');
    console.log('[6] run completed; surface conversation closed (isActive:false)');

    // ── 7. A fresh run is allowed after completion (resume/repeat) ────────
    const run2 = await createRun(uid);
    if (run2.id === run.id) fail('second run reused the first run id');
    console.log(`[7] fresh run ${run2.id} allowed after completion`);
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

  console.log('\n✓ smoke:reclaim-run passed — create, answer, reflection gate, complete, resume');
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-run failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
