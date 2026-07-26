/**
 * The comparative open and the recent-audit shortcut (F9 t-2). Prisma and the run reader are mocked.
 *
 * The load-bearing assertions are the ones that keep this from becoming a verdict: the difference is
 * a signed number and nothing else (I12), it is `null` rather than invented when either side is
 * missing, and the shortcut expires rather than confirming stale context back at someone.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindFirst: vi.fn(),
  readRunAnswers: vi.fn(),
  readBucketLabels: vi.fn(),
  readShortcutConfig: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimAuditRun: { findFirst: mocks.runFindFirst } },
}));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers: mocks.readRunAnswers }));
vi.mock('@/lib/app/programme/buckets/labels', () => ({
  readBucketLabels: mocks.readBucketLabels,
}));
vi.mock('@/lib/app/programme/config', () => ({
  readReclaimShortcutConfig: mocks.readShortcutConfig,
}));

import { readComparison, readShortcut, fillConfirmLine } from '@/lib/app/programme/compare';

const hours = (n: number) => ({ value: String(n), valueJson: n });
const text = (v: string) => ({ value: v, valueJson: null });

const PREVIOUS_RUN = {
  id: 'run-1',
  quarter: '2026 Q1',
  completedAt: new Date('2026-04-01T00:00:00.000Z'),
  startedAt: new Date('2026-03-01T00:00:00.000Z'),
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.runFindFirst.mockResolvedValue(PREVIOUS_RUN);
  mocks.readRunAnswers.mockResolvedValue({});
  mocks.readBucketLabels.mockResolvedValue({});
  mocks.readShortcutConfig.mockResolvedValue({
    recentAuditConfirm:
      '"I can see from your recent audit that you are [role] at [organisation], working around [hours] per week, with [priorities]. Is all of that still accurate, or has anything changed?"',
    recentAuditWithinDays: 31,
  });
});

describe('readComparison', () => {
  it('returns previous: null on a first audit, so the UI is absent rather than empty', async () => {
    mocks.runFindFirst.mockResolvedValue(null);

    const view = await readComparison('u1', 'run-2');
    expect(view.previous).toBeNull();
    expect(view.buckets).toEqual([]);
  });

  it('puts both numbers and the signed difference side by side', async () => {
    mocks.readRunAnswers
      .mockResolvedValueOnce({ reclaim_current_hours__deep_work: hours(10) }) // previous
      .mockResolvedValueOnce({ reclaim_current_hours__deep_work: hours(4) }); // current

    const view = await readComparison('u1', 'run-2');
    const deep = view.buckets.find((b) => b.bucketSlug === 'deep-work');

    expect(deep).toMatchObject({ previousHours: 10, currentHours: 4, differenceHours: -6 });
  });

  it('renders a rise and a fall as the same kind of fact — a signed number, nothing else', async () => {
    mocks.readRunAnswers
      .mockResolvedValueOnce({
        reclaim_current_hours__deep_work: hours(10),
        reclaim_current_hours__team_development: hours(2),
      })
      .mockResolvedValueOnce({
        reclaim_current_hours__deep_work: hours(4),
        reclaim_current_hours__team_development: hours(8),
      });

    const view = await readComparison('u1', 'run-2');
    const fell = view.buckets.find((b) => b.bucketSlug === 'deep-work');
    const rose = view.buckets.find((b) => b.bucketSlug === 'team-development');

    // I12's sibling: the shape carries no verdict, so the two are structurally identical apart from
    // sign. There is no `status`, no `direction`, nothing a UI could colour red.
    expect(Object.keys(fell ?? {}).sort()).toEqual(Object.keys(rose ?? {}).sort());
    expect(fell?.differenceHours).toBe(-6);
    expect(rose?.differenceHours).toBe(6);
  });

  it('leaves the difference null rather than inventing one when a side is missing', async () => {
    mocks.readRunAnswers
      .mockResolvedValueOnce({ reclaim_current_hours__deep_work: hours(10) })
      .mockResolvedValueOnce({}); // this audit has not reached Phase 1 yet

    const deep = (await readComparison('u1', 'run-2')).buckets.find(
      (b) => b.bucketSlug === 'deep-work'
    );
    expect(deep).toMatchObject({ previousHours: 10, currentHours: null, differenceHours: null });
  });

  it('prefers the composite where that audit reconciled a calendar (I-composite)', async () => {
    mocks.readRunAnswers
      .mockResolvedValueOnce({
        reclaim_current_hours__deep_work: hours(10),
        reclaim_composite_hours__deep_work: hours(13),
      })
      .mockResolvedValueOnce({ reclaim_current_hours__deep_work: hours(4) });

    const deep = (await readComparison('u1', 'run-2')).buckets.find(
      (b) => b.bucketSlug === 'deep-work'
    );
    expect(deep?.previousHours).toBe(13);
  });

  it('does not show a conditional bucket the leader was never asked about', async () => {
    // A calendar upload writes a literal 0 into every composite slot, including fundraising for a
    // leader who said it was irrelevant. Showing "Fundraising & capital · 0h" would be a row about
    // an area the audit deliberately never put in front of them.
    mocks.readRunAnswers
      .mockResolvedValueOnce({
        reclaim_setup_fundraising_relevant: { value: 'No', valueJson: false },
        reclaim_current_hours__deep_work: hours(10),
        reclaim_composite_hours__fundraising_capital: hours(0),
      })
      .mockResolvedValueOnce({
        reclaim_setup_fundraising_relevant: { value: 'No', valueJson: false },
        reclaim_current_hours__deep_work: hours(8),
      });

    const view = await readComparison('u1', 'run-2');
    expect(view.buckets.map((b) => b.bucketSlug)).toEqual(['deep-work']);
  });

  it('labels both columns with the leader’s CURRENT name for the bucket (I7)', async () => {
    mocks.readBucketLabels.mockResolvedValue({ deep_work: 'Thinking time' });
    mocks.readRunAnswers
      .mockResolvedValueOnce({ reclaim_current_hours__deep_work: hours(10) })
      .mockResolvedValueOnce({ reclaim_current_hours__deep_work: hours(8) });

    const deep = (await readComparison('u1', 'run-2')).buckets.find(
      (b) => b.bucketSlug === 'deep-work'
    );
    expect(deep?.title).toBe('Thinking time');
  });
});

describe('previousCompletedRun ordering', () => {
  it('asks Postgres for NULLS LAST — a null completedAt must not outrank a real one', async () => {
    mocks.readRunAnswers.mockResolvedValue({});
    await readComparison('u1', 'run-2');

    // Postgres sorts NULLs FIRST on a descending order, so without this a `complete` row with no
    // `completedAt` becomes "last time" — the OLDEST audit shown as the most recent.
    const args = mocks.runFindFirst.mock.calls[0]?.[0] as { orderBy: unknown[] };
    expect(args.orderBy[0]).toEqual({ completedAt: { sort: 'desc', nulls: 'last' } });
  });
});

describe('readShortcut', () => {
  it('offers the previous context back when the last audit was recent', async () => {
    mocks.runFindFirst.mockResolvedValue({
      ...PREVIOUS_RUN,
      completedAt: new Date(Date.now() - 5 * 86_400_000),
    });
    mocks.readRunAnswers.mockResolvedValue({
      reclaim_profile_role: text('CEO'),
      reclaim_profile_org_type: text('Nonprofit'),
      reclaim_setup_weekly_hours: text('55'),
      reclaim_setup_priorities: text('Grow the team'),
    });

    const shortcut = await readShortcut('u1');
    expect(shortcut.previous).not.toBeNull();
    expect(shortcut.confirmLine).toContain('you are CEO at Nonprofit');
    // "55 hours per week", not "55 per week" — the source's `[hours]` is shorthand for a phrase, and
    // filling it literally made the one line meant to sound like someone remembering you read as
    // machine-assembled.
    expect(shortcut.confirmLine).toContain('around 55 hours per week');
    // And not wrapped in the source's own quotation marks, which marked coach speech in a system
    // prompt and would read on screen as the product quoting somebody.
    expect(shortcut.confirmLine?.startsWith('"')).toBe(false);
    expect(shortcut.answers['reclaim_profile_role']).toBe('CEO');
  });

  it('expires rather than confirming stale context back at someone', async () => {
    // A year on, role, hours and priorities are exactly the things that will have moved. Asking in
    // full is better than confirming what is no longer true.
    mocks.runFindFirst.mockResolvedValue({
      ...PREVIOUS_RUN,
      completedAt: new Date(Date.now() - 365 * 86_400_000),
    });

    const shortcut = await readShortcut('u1');
    expect(shortcut.previous).toBeNull();
    expect(shortcut.confirmLine).toBeNull();
    expect(shortcut.answers).toEqual({});
  });

  it('offers nothing on a first audit', async () => {
    mocks.runFindFirst.mockResolvedValue(null);
    expect(await readShortcut('u1')).toEqual({ previous: null, confirmLine: null, answers: {} });
  });

  it('never carries the two sensitive prose slots forward', async () => {
    mocks.runFindFirst.mockResolvedValue({
      ...PREVIOUS_RUN,
      completedAt: new Date(Date.now() - 5 * 86_400_000),
    });
    mocks.readRunAnswers.mockResolvedValue({
      reclaim_profile_role: text('CEO'),
      reclaim_setup_keeping_me_up: text('Losing my best person'),
      reclaim_setup_why_now: text('A hard quarter'),
    });

    const shortcut = await readShortcut('u1');
    // The read requests a fixed slug list that excludes them; even handed them, they must not reach
    // a form that would put last quarter's worry in this quarter's mouth.
    const requested = mocks.readRunAnswers.mock.calls[0]?.[2] as string[];
    expect(requested).not.toContain('reclaim_setup_keeping_me_up');
    expect(requested).not.toContain('reclaim_setup_why_now');
    expect(JSON.stringify(shortcut.answers)).not.toContain('Losing my best person');
  });
});

describe('fillConfirmLine', () => {
  it('interpolates the leader’s own context, and reads as a sentence', () => {
    const filled = fillConfirmLine('you are [role] at [organisation], [hours], [priorities]', {
      role: 'CEO',
      organisation: 'Nonprofit',
      hours: '55',
      priorities: 'Grow the team',
    });
    expect(filled).toBe('you are CEO at Nonprofit, 55 hours, Grow the team');
  });

  it('leaves an already-worded hours answer alone', () => {
    // Some leaders type "about 50-55" rather than a number. Appending "hours" to that would be worse
    // than leaving it, so only a bare number gets the unit.
    expect(fillConfirmLine('[hours]', { hours: 'about 50-55 most weeks' })).toBe(
      'about 50-55 most weeks'
    );
  });

  it('inserts a leader’s answer literally, even one containing a replacement pattern', () => {
    // `$&` and friends are special to `String.replace` with a string replacement. A function
    // replacement keeps them literal, so a leader whose priorities mention "$&" see exactly that.
    expect(fillConfirmLine('[priorities]', { priorities: 'ship $& survive' })).toBe(
      'ship $& survive'
    );
  });

  it('never leaves a raw placeholder on screen when an answer is missing', () => {
    const filled = fillConfirmLine('[role] at [organisation], [hours], [priorities]', {});
    expect(filled).not.toContain('[');
  });
});
