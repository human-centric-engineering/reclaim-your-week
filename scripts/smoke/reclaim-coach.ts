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
 * `smoke:reclaim-calendar` this runs in CI, in the `smoke` job, beside the other five leaf smokes.
 *
 * **It is not in `leaf:checks`, and this comment used to say it was.** `leaf:checks` is
 * `leaf:content-diff && leaf:invariants` — content and unit-level invariants, no database and no
 * smokes. The claim was false from the day it was written and the script ran in no gate at all for
 * two features ([[post-v1]] P21, fixed as F12 t-2). Worth leaving the correction visible: a script
 * that names its own gate is asserting something nothing checks, so if this line and
 * `.github/workflows/ci.yml` ever disagree again, the workflow is the truth.
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
import { CALENDAR_RETURN_MOMENT } from '@/lib/app/programme/coach/opening';
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
    if (chartRevealed(await readCoachOpenings(uid, run.id))) {
      fail('the reveal is recorded before the leader has seen anything');
    }

    // I12 state one: every area has a figure, and the leader has not looked yet. The picture must
    // stay unspoken. Asserted here rather than later because the ledger only moves forwards — once
    // the moment is claimed this state cannot be recreated on the same run.
    const beforeReveal = await buildCoachPhaseContext(uid);
    if (!beforeReveal.includes('not asked to see this yet')) {
      fail(
        'a leader who has not looked yet is not protected from the coach describing the picture'
      );
    }
    if (beforeReveal.includes('picture is on their screen now')) {
      fail('the coach is told the picture is up before the leader has asked to see it (I12)');
    }

    // The route refuses here; the smoke asserts the fact the route reads, which is what has to be
    // true in the database rather than in a mock.
    await claimCoachOpening(uid, run.id, CHART_REVEAL_MOMENT);
    if (!chartRevealed(await readCoachOpenings(uid, run.id))) {
      fail('the reveal was not recorded, so the transition gate would never open');
    }
    console.log('[8] the reveal is a recorded fact, and the gate reads it');

    // ── 9. The coach's phase context is assembled from real reads ──
    //
    // "section", not "phase". The leader's screen calls these sections and the briefing says the
    // word aloud, so `phase-context.ts` switched the spoken count in #59 while the code, the slugs
    // and the run state kept saying phase. The assertion here still read "phase 1 of 6", and
    // **nothing noticed** because this script ran in no gate — the entire argument of post-v1 P21,
    // and it was found by wiring the smoke into CI rather than by anyone running it.
    const block = await buildCoachPhaseContext(uid);
    if (!block.includes('section 1 of 6')) fail('the coach is not told which section it is in');
    if (!block.includes('Do not restate'))
      fail('the coach is not told the card has already spoken');
    console.log('[9] the coach is told where it is, and what the card already said');

    // ── 10. I12, walked in the leader's own order ──
    //
    // This is the pacing contract the invariants table credits this smoke with, and it was being
    // half-proved. The old step 9 saved `reclaim_reflection_p1` *before* claiming the reveal — the
    // reverse of what a leader does — and then asserted the pause instruction that appears only when
    // the reveal has happened and the reflection has not. The block has three branches and the run
    // was landing in the third, so the assertion could never have failed for the reason it named.
    //
    //   before the reveal — say nothing about the picture   (asserted above, while it was true)
    //   after the reveal  — ask what stands out, and stop
    //   after they answer — now your own reading belongs
    //
    // Each branch is identified by a string unique to it. The obvious discriminator — "what stands
    // out to you here" — appears **twice** in `phase-context.ts`: once in the reveal beat and once
    // in the generic phase-closing reflection instruction that every phase carries. Asserting on it
    // is why the old check passed in a state it was not testing, so it is deliberately not used.
    if (!block.includes('picture is on their screen now')) {
      fail('the pause is missing, so the coach would interpret in the same beat (I12)');
    }
    await saveRunAnswer(uid, run.id, { slotSlug: 'reclaim_reflection_p1', value: 'A lot of it.' });
    const afterReflection = await buildCoachPhaseContext(uid);
    if (!afterReflection.includes('your own reading belongs')) {
      fail('the coach is never released into its own reading, so the beat never ends');
    }
    if (afterReflection.includes('picture is on their screen now')) {
      fail('the coach is still held in the pause after the leader has answered it');
    }
    console.log('[10] I12 holds in all three states: hold, ask, then interpret');

    // ── 11. The calendar reaches the coach as framed arithmetic (F13) ──
    //
    // Mocks cannot reach this: the deltas live in `reclaim_composite_variance_note.valueJson`, and
    // whether a JSONB column survives the round trip into `readCalendarReading` is a fact about
    // Postgres and Prisma rather than about the pure function, which its own unit tests already
    // cover. Before F13 the coach was told "2 bucket(s) diverged from the estimate" and no figures.
    const deepWork = bucketToken('deep-work');
    await saveRunAnswer(uid, run.id, {
      slotSlug: 'reclaim_calendar_uploaded',
      value: 'true',
      valueJson: true,
    });
    await saveRunAnswer(uid, run.id, {
      slotSlug: `reclaim_composite_hours__${deepWork}`,
      value: '11',
      valueJson: 11,
    });
    await saveRunAnswer(uid, run.id, {
      slotSlug: 'reclaim_composite_variance_note',
      value: '1 bucket(s) diverged from the estimate',
      valueJson: [{ token: deepWork, estimate: 4, composite: 11, delta: 7 }],
    });

    const withCalendar = await buildCoachPhaseContext(uid);
    if (!withCalendar.includes('Higher than they thought:')) {
      fail('the perception-versus-reality summary never reaches the coach');
    }
    if (!withCalendar.includes('the reconciled figure is 11h')) {
      fail('the coach is given the category but not the figure, which is what :314 asks for');
    }
    if (!withCalendar.includes('never evidence that they were wrong')) {
      fail('the figures arrive without the I17 framing that makes them information, not a verdict');
    }
    console.log('[11] the calendar reaches the coach as figures, framed');

    // ── 12. The return beat claims once, under a burst (F13 t-3) ──
    //
    // Two tabs open on `/programme` when the leader comes back from the calendar step both see an
    // unclaimed moment and both post. The conditional `updateMany` is what makes that one turn, and
    // whether Postgres serialises it is not something a mocked Prisma can answer.
    const returns = await Promise.all(
      Array.from({ length: 5 }, () => claimCoachOpening(uid, run.id, CALENDAR_RETURN_MOMENT))
    );
    const returnWinners = returns.filter(Boolean).length;
    if (returnWinners !== 1) {
      fail(
        `five racing calendar-return claims produced ${returnWinners} beats, expected exactly 1`
      );
    }
    if (!(await readCoachOpenings(uid, run.id)).includes(CALENDAR_RETURN_MOMENT)) {
      fail('the calendar-return beat is not in the ledger, so a reload would replay it');
    }
    console.log('[12] the calendar-return beat fires once, however many tabs are open');
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
