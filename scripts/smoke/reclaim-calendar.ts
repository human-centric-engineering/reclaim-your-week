/**
 * Smoke: the calendar branch never persists a meeting title (F5 t-4, I4).
 *
 * The machine proof of the product's trust story. Runs the real upload path against real Postgres — a
 * `.ics` with uniquely-tagged titles → in-memory parse → one `runStructuredCompletion` categorise →
 * per-bucket totals via `saveAnswer` — then scans **every** slot value the run wrote (value, valueJson,
 * provenance) plus the user's chat messages, and asserts none of the tagged titles appears anywhere.
 * A leaked title would fail here. Assumes the app-reclaim seeds have run (coach agent + provider).
 * Throwaway user, erased at the end. Requires a configured provider + key (same as smoke:reclaim).
 *
 * Run:  npm run smoke:reclaim-calendar
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { createRun } from '@/app/api/v1/app/reclaim/runs/service';
import { analyseCalendarUpload } from '@/lib/app/programme/calendar/analyse';

const PREFIX = 'smoke-reclaim-calendar';

/** Distinctive titles that must never survive into the DB. */
const MARKERS = ['SMOKECAL-ALPHA', 'SMOKECAL-BETA', 'SMOKECAL-GAMMA', 'SMOKECAL-PERSONAL'].map(
  (m) => `${m}-${process.pid}`
);

function fail(message: string): never {
  throw new Error(message);
}

/** A small week of events with tagged titles, spanning 2026-01-05..01-09. */
function fixtureIcs(): string {
  const [alpha, beta, gamma, personal] = MARKERS;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RYW smoke//calendar//EN',
    'X-WR-CALNAME:Smoke Work',
    event('a', '20260105T090000Z', '20260105T110000Z', alpha),
    event('b', '20260106T140000Z', '20260106T153000Z', beta),
    event('c', '20260107T100000Z', '20260107T110000Z', gamma),
    event('d', '20260108T173000Z', '20260108T183000Z', personal),
    'END:VCALENDAR',
    '',
  ].join('\n');
}

function event(uid: string, start: string, end: string, summary: string): string {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@smoke`,
    'DTSTAMP:20251201T000000Z',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    'END:VEVENT',
  ].join('\n');
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
    const run = await createRun(uid, '2026 Q1');
    console.log(`[2] run ${run.id} created`);

    const review = await analyseCalendarUpload(uid, run.id, fixtureIcs(), {
      windowStart: new Date('2026-01-01T00:00:00Z'),
      windowEnd: new Date('2026-02-01T00:00:00Z'),
      periodLabel: 'Smoke week',
    });
    if (review.totalHours <= 0) fail('categorisation produced no hours — provider misconfigured?');
    console.log(
      `[3] analysed: ${review.buckets.length} bucket(s), ${review.totalHours}h total, ` +
        `${review.ambiguous.length} ambiguous, ${review.excludedPersonalCount} personal excluded`
    );

    // ── 4. Scan every slot value this user wrote for any tagged title ─────
    const slotValues = await prisma.slotValue.findMany({ where: { userId: uid } });
    const haystack = slotValues
      .map((v) => `${v.value ?? ''}|${JSON.stringify(v.valueJson)}|${JSON.stringify(v.provenance)}`)
      .join('\n');
    for (const marker of MARKERS) {
      if (haystack.includes(marker)) fail(`I4 VIOLATION: title "${marker}" found in a slot value`);
    }
    console.log(`[4] scanned ${slotValues.length} slot value(s) — no meeting title present`);

    // ── 5. No chat message was persisted for this user (streamChat would have) ─
    const messageCount = await prisma.aiMessage.count({
      where: { conversation: { is: { userId: uid } } },
    });
    if (messageCount !== 0)
      fail(`I4 VIOLATION: ${messageCount} chat message(s) persisted by categorisation`);
    console.log('[5] no chat messages persisted (categorisation used runStructuredCompletion)');

    // ── 6. The calendar totals actually landed (the branch did something) ─
    const uploaded = slotValues.find((v) => v.slotSlug === 'reclaim_calendar_uploaded');
    if (!uploaded) fail('reclaim_calendar_uploaded was not written');
    console.log('[6] calendar totals persisted (uploaded flag set)');
  } finally {
    await eraseUser({
      userId: uid,
      userEmail: user.email,
      actorUserId: uid,
      reason: 'self_service',
    }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log('\n✓ smoke:reclaim-calendar passed — no meeting title anywhere in the DB (I4)');
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-calendar failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
