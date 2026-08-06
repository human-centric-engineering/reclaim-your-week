/**
 * Smoke: the report agent produces a reading a real model can actually get past the guards (F14).
 *
 * **The one thing no key-less test can reach.** `parseReportReading`'s refusals are unit-tested
 * against hand-written stubs, which proves the parser rejects what it should and proves **nothing
 * about whether a real model, given the real brief, ever returns something it accepts**. An report agent
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
 * Run:  npm run smoke:reclaim-report
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { buildReportBrief, briefTokens } from '@/lib/app/programme/report/brief';
import { runReport } from '@/lib/app/programme/report/reading';
import { CHAPTER_TITLES } from '@/lib/app/programme/report/chapters';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { createRun, saveRunAnswer, transitionRun } from '@/app/api/v1/app/reclaim/runs/service';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';

const PREFIX = 'smoke-reclaim-report';

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
    // The prose, and it is the half this smoke used to leave out. A brief of figures alone produces
    // a report about a spreadsheet, so a run that carries no answer to a single question the audit
    // asked cannot tell anyone whether the reading is any good. These are the readings the deepened
    // lens actually works from: what they came in carrying, where their best hours go, what they
    // said when challenged, what they are putting down, and what they took away.
    await write(
      'reclaim_setup_why_now',
      'The board asked for a three year plan and I have not had a clear morning to think about it since March.'
    );
    await write(
      'reclaim_setup_keeping_me_up',
      'That the programme only works because I am holding it together, and I cannot say that out loud.'
    );
    await write(
      'reclaim_energy_peak_description',
      'First thing, before anyone else is online. By three in the afternoon I am answering rather than thinking.'
    );
    await write(
      'reclaim_energy_protected',
      'No. Mornings are when everyone books me, because that is when I am responsive.'
    );
    await write(
      'reclaim_gap_challenge_response',
      'I know I should hand the delivery over. I am not sure the team is ready, and I am not sure I would know what my job was without it.'
    );
    await write('reclaim_action_chosen', 'Two protected mornings a week for the funding bid');
    await write('reclaim_action_when', 'From next Monday');
    await write(
      'reclaim_action_stopping',
      'I will stop chairing the Wednesday delivery meeting and hand it to Priya.'
    );
    await write(
      'reclaim_reflection_p6',
      'I have been treating the thing I am best at as the thing only I can do, and those are not the same.'
    );
    console.log('[2] a finished-looking audit written through the real write path');

    // Walk to the last phase so the run reads as a real one rather than a bag of slots.
    for (const key of RECLAIM_PHASE_KEYS.slice(0, -1)) {
      await transitionRun(uid, run.id, key).catch(() => undefined);
    }

    const brief = buildReportBrief(await readRunAnswers(uid, run.id));
    if (!brief.usable) fail('the brief is not usable, so no call would ever be made');
    if (brief.areas.length === 0) fail('the brief carries no areas');
    console.log(`[3] brief built: ${brief.areas.length} areas, usable`);

    // ── 4. The real call ──
    const reading = await runReport(brief);
    if (reading === null) {
      fail(
        'the report agent returned nothing. Either the provider is unconfigured, or a real model cannot ' +
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
      ...reading.chapters.flatMap((c) => c.paragraphs),
      ...reading.gaps.map((g) => g.observation),
      ...reading.pathway.flatMap((s) => [s.step, s.difference]),
      ...(reading.closing === null ? [] : [reading.closing]),
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
    //
    // **The chapters are printed and used not to be**, which made this script the wrong shape for the
    // question it exists to answer: it printed two supporting lists and hid the report. Nobody can
    // judge depth from four gap sentences, and depth is the only thing a human eye adds here that the
    // assertions above do not already cover.
    console.log('\n--- what it produced ---');
    for (const chapter of reading.chapters) {
      console.log(`\n  ## ${CHAPTER_TITLES[chapter.section]}`);
      for (const paragraph of chapter.paragraphs) console.log(`  ${paragraph}\n`);
    }
    for (const gap of reading.gaps) console.log(`  gap  [${gap.token}] ${gap.observation}`);
    for (const step of reading.pathway) {
      console.log(`  ${step.horizon.padEnd(5)} ${step.step} → ${step.difference}`);
    }
    if (reading.closing !== null) console.log(`\n  ${reading.closing}`);
    console.log('------------------------\n');

    // Which chapters an audit this full earned, as a line an operator can read at a glance. Not an
    // assertion: the model chooses the arc from what the brief supports, and a run that skipped one
    // is a judgement about this audit rather than a failure. A run that produced only the three the
    // parser's minimum asks for is worth looking at, which is why the count is printed beside them.
    console.log(
      `[6] ${reading.chapters.length} chapters: ${reading.chapters.map((c) => c.section).join(', ')}`
    );

    console.log('✓ smoke:reclaim-report passed — a real model gets a reading past every guard');
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
  console.error(`\n✗ smoke:reclaim-report failed: ${String(error)}`);
  process.exit(1);
});
