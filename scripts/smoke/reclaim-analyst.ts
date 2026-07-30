/**
 * Smoke: the analyst produces a reading a real model can actually get past the guards (F14).
 *
 * **The one thing no key-less test can reach.** `parseAnalystReading`'s refusals are unit-tested
 * against hand-written stubs, which proves the parser rejects what it should and proves **nothing
 * about whether a real model, given the real brief, ever returns something it accepts**. An analyst
 * refused on every live call would pass the entire suite and quietly produce a summary with two
 * empty sections for ever, because `null` is the designed failure mode and every surface renders it
 * as silence.
 *
 * That is exactly the shape of `smoke:reclaim-calendar`'s argument, and it lands in the same place:
 * **manual, needs a provider key, not in CI** ([[post-v1]] P16, whose decision now covers two
 * scripts rather than one).
 *
 * What it asserts:
 *   1. a brief built from a realistic finished audit is `usable`;
 *   2. a real model call returns a reading that survives every refusal;
 *   3. the reading is anchored — every gap names an area the brief supplied;
 *   4. the pathway is a sequence, one step per horizon, in order;
 *   5. nothing in it reads as an instruction or carries a banned term (the parser's job, asserted
 *      again here against live output rather than a fixture).
 *
 * Throwaway user, erased at the end. Real Postgres, real provider.
 *
 * Run:  npm run smoke:reclaim-analyst
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { buildAnalystBrief, briefTokens } from '@/lib/app/programme/analyst/brief';
import { runAnalyst } from '@/lib/app/programme/analyst/reading';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { createRun, saveRunAnswer, transitionRun } from '@/app/api/v1/app/reclaim/runs/service';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';

const PREFIX = 'smoke-reclaim-analyst';

function fail(message: string): never {
  throw new Error(message);
}

/** A plausible finished audit: a week that is heavy on delivery and thin on everything chosen. */
const NOW: Record<string, number> = {
  deep_work: 4,
  learning_development: 1,
  strategic_planning: 3,
  team_development: 6,
  organisational_oversight: 8,
  relationship_building: 9,
  delivery_operations: 22,
  recovery_white_space: 2,
};
const WANTED: Record<string, number> = {
  deep_work: 10,
  learning_development: 3,
  strategic_planning: 8,
  team_development: 8,
  organisational_oversight: 5,
  relationship_building: 7,
  delivery_operations: 10,
  recovery_white_space: 6,
};

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

    const write = (slotSlug: string, value: string, valueJson?: unknown) =>
      saveRunAnswer(uid, run.id, {
        slotSlug,
        value,
        ...(valueJson === undefined ? {} : { valueJson }),
      });

    await write('reclaim_profile_role', 'Chief Executive');
    await write('reclaim_profile_org_type', 'A social enterprise of about forty people');
    await write('reclaim_setup_priorities', 'Get the new programme funded and off the ground');
    await write('reclaim_setup_weekly_hours', '55', 55);
    await write('reclaim_setup_audit_period', 'last quarter');
    for (const bucket of RECLAIM_BUCKETS.filter((b) => !b.conditional)) {
      const token = bucketToken(bucket.slug);
      await write(`reclaim_current_hours__${token}`, String(NOW[token] ?? 0), NOW[token] ?? 0);
      await write(`reclaim_ideal_hours__${token}`, String(WANTED[token] ?? 0), WANTED[token] ?? 0);
    }
    await write('reclaim_ideal_total_hours', '57', 57);
    await write('reclaim_action_chosen', 'Two protected mornings a week for the funding bid');
    await write('reclaim_action_when', 'From next Monday');
    console.log('[2] a finished-looking audit written through the real write path');

    // Walk to the last phase so the run reads as a real one rather than a bag of slots.
    for (const key of RECLAIM_PHASE_KEYS.slice(0, -1)) {
      await transitionRun(uid, run.id, key).catch(() => undefined);
    }

    const brief = buildAnalystBrief(await readRunAnswers(uid, run.id));
    if (!brief.usable) fail('the brief is not usable, so no call would ever be made');
    if (brief.areas.length === 0) fail('the brief carries no areas');
    console.log(`[3] brief built: ${brief.areas.length} areas, usable`);

    // ── 4. The real call ──
    const reading = await runAnalyst(brief);
    if (reading === null) {
      fail(
        'the analyst returned nothing. Either the provider is unconfigured, or a real model cannot ' +
          'get a reading past the guards — which is the failure this smoke exists to catch, because ' +
          'every surface renders null as silence and nothing else would ever notice.'
      );
    }
    console.log(`[4] a real model produced a reading: ${reading.gaps.length} gaps, 3 steps`);

    // ── 5. Anchored, sequenced, and clean ──
    const allowed = briefTokens(brief);
    for (const gap of reading.gaps) {
      if (!allowed.has(gap.token))
        fail(`a gap names an area the brief never supplied: ${gap.token}`);
    }
    if (reading.pathway.map((s) => s.horizon).join(',') !== 'now,next,later') {
      fail('the pathway is not one step per horizon in order');
    }
    const prose = [
      ...reading.gaps.map((g) => g.observation),
      ...reading.pathway.flatMap((s) => [s.step, s.difference]),
    ];
    for (const line of prose) {
      if (line.includes('—')) fail(`live output carries an em dash: ${line}`);
      const banned = RECLAIM_BANNED_LEXICON.find((t) =>
        line.toLowerCase().includes(t.toLowerCase())
      );
      if (banned !== undefined) fail(`live output carries "${banned}": ${line}`);
    }
    console.log('[5] anchored to real areas, sequenced, and clean of banned lexicon');

    // Worth seeing, since the whole point is whether it reads like a coach or a consultant.
    console.log('\n--- what it produced ---');
    for (const gap of reading.gaps) console.log(`  gap  [${gap.token}] ${gap.observation}`);
    for (const step of reading.pathway) {
      console.log(`  ${step.horizon.padEnd(5)} ${step.step} → ${step.difference}`);
    }
    console.log('------------------------\n');

    console.log('✓ smoke:reclaim-analyst passed — a real model gets a reading past every guard');
  } finally {
    await eraseUser({
      userId: uid,
      userEmail: `${PREFIX}-${process.pid}@example.com`,
      actorUserId: uid,
      reason: 'self_service',
    });
  }
}

main().catch((error: unknown) => {
  console.error(`\n✗ smoke:reclaim-analyst failed: ${String(error)}`);
  process.exit(1);
});
