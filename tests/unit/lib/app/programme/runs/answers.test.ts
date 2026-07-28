/**
 * Run-scoped answer reads (F6, fixed for repeat audits).
 *
 * The load-bearing assertion is no longer just "only this run's values" — it is **"this run's values
 * even after a later run has superseded them"**. Reading heads (`WHERE supersededAt IS NULL`) and
 * filtering by `provenance.runId` was correct while every leader had one audit and silently returned
 * less and less of run 1 once they had two, hollowing out `buildSummary` and the public share link
 * built on it.
 *
 * The store is a **stateful in-memory fake** rather than a per-call mock: the bug lived in the
 * interaction between supersession and the run filter, and a mock that returns whatever it is handed
 * cannot express that interaction. This fake models the real invariants — versions are monotonic per
 * `(userId, slotSlug)`, writing a new version supersedes the previous one — so a test can literally
 * run audit 1, run audit 2, and ask what audit 1 looks like afterwards.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface Row {
  userId: string;
  slotSlug: string;
  version: number;
  value: string;
  valueJson: unknown;
  provenance: unknown;
  /** How the reading was come by. The conversational panel shows an inference differently. */
  sourceType: string;
  /** 1–10. A form answer is 10; a coach's inference is lower and is offered back to the leader. */
  confidence: number;
  supersededAt: Date | null;
}

const { store, findMany } = vi.hoisted(() => {
  const store: { rows: unknown[] } = { rows: [] };
  const findMany = vi.fn();
  return { store, findMany };
});

vi.mock('@/lib/db/client', () => ({ prisma: { slotValue: { findMany } } }));

import { readRunAnswers } from '@/lib/app/programme/runs/answers';

/** Rows for the fake, plus the write that models real supersession. */
const rows = () => store.rows as Row[];

/** Append a slot value the way `saveAnswer` does: new version, previous head superseded. */
function write(
  userId: string,
  slotSlug: string,
  value: string,
  runId: string,
  valueJson: unknown = null,
  how: { sourceType?: string; confidence?: number; verbatim?: string } = {}
) {
  const existing = rows().filter((r) => r.userId === userId && r.slotSlug === slotSlug);
  for (const row of existing) row.supersededAt = new Date();
  rows().push({
    userId,
    slotSlug,
    version: existing.length + 1,
    value,
    valueJson,
    // A row written before `verbatim` existed has no such key — `how.verbatim` unset reproduces that
    // shape exactly (no `verbatim: undefined` sitting in the object), rather than merely being falsy.
    provenance: {
      runId,
      conversationId: 'c1',
      ...(how.verbatim !== undefined ? { verbatim: how.verbatim } : {}),
    },
    // Defaults match a form answer: stated directly, at full confidence.
    sourceType: how.sourceType ?? 'direct',
    confidence: how.confidence ?? 10,
    supersededAt: null,
  });
}

/** A form-path answer as the read returns it, for assertions that are about the value. */
const stated = (value: string, valueJson: unknown = null) => ({
  value,
  valueJson,
  sourceType: 'direct',
  confidence: 10,
});

beforeEach(() => {
  store.rows = [];
  findMany.mockReset();
  // A stand-in for the query the module issues: the user filter, the optional slug narrowing, the
  // `provenance.runId` JSON path filter, ascending version order — and `supersededAt` **if the query
  // asks for it**. That last part is what makes these regression tests rather than a restatement of
  // the fix: put the head filter back in `readRunAnswers` and they fail, the way they would have
  // before it.
  findMany.mockImplementation((args: { where: Record<string, unknown>; orderBy?: unknown }) => {
    const where = args.where;
    const slugFilter = where.slotSlug as { in: string[] } | undefined;
    const provenance = where.provenance as { path: string[]; equals: string } | undefined;
    const direction = (args.orderBy as { version?: string } | undefined)?.version ?? 'asc';

    const matched = rows()
      .filter((r) => r.userId === where.userId)
      .filter((r) => (slugFilter ? slugFilter.in.includes(r.slotSlug) : true))
      .filter((r) => (where.supersededAt === null ? r.supersededAt === null : true))
      .filter((r) => {
        if (provenance === undefined) return true;
        const p = r.provenance as Record<string, unknown> | null;
        const key = provenance.path[0];
        return p !== null && key !== undefined && p[key] === provenance.equals;
      })
      // Honour `orderBy` rather than always sorting ascending. A fake that sorts for the code under
      // test would make "the run's last write wins" hold because of the FAKE, and flipping the real
      // query to `desc` would keep every assertion green while returning a leader's corrected hours
      // as their original ones.
      .sort((a, b) => (direction === 'desc' ? b.version - a.version : a.version - b.version));

    return Promise.resolve(matched);
  });
});

describe('readRunAnswers — the repeat-audit bug', () => {
  it('still returns run 1’s answers after run 2 has superseded them', async () => {
    // Audit 1: the leader reports 10 hours of deep work and finishes.
    write('u1', 'reclaim_current_hours__deep_work', '10', 'run-1', 10);
    write('u1', 'reclaim_setup_weekly_hours', '55', 'run-1', 55);

    // Audit 2, months later: they answer the same questions again.
    write('u1', 'reclaim_current_hours__deep_work', '4', 'run-2', 4);
    write('u1', 'reclaim_setup_weekly_hours', '48', 'run-2', 48);

    const runOne = await readRunAnswers('u1', 'run-1');

    // Before the fix this was `{}` — every run-1 value had been superseded and so was no longer a
    // head, which is what silently emptied a shared summary link.
    expect(runOne['reclaim_current_hours__deep_work']).toEqual(stated('10', 10));
    expect(runOne['reclaim_setup_weekly_hours']).toEqual(stated('55', 55));
  });

  it('keeps the two runs separate in both directions', async () => {
    write('u1', 'reclaim_current_hours__deep_work', '10', 'run-1', 10);
    write('u1', 'reclaim_current_hours__deep_work', '4', 'run-2', 4);

    expect((await readRunAnswers('u1', 'run-1'))['reclaim_current_hours__deep_work']?.value).toBe(
      '10'
    );
    expect((await readRunAnswers('u1', 'run-2'))['reclaim_current_hours__deep_work']?.value).toBe(
      '4'
    );
  });

  it('does not leak a slug that only a different run ever answered', async () => {
    write('u1', 'reclaim_setup_why_now', 'A hard quarter', 'run-1');

    expect(await readRunAnswers('u1', 'run-2')).toEqual({});
  });
});

describe('readRunAnswers — within one run', () => {
  it('takes the run’s final answer when a leader corrected themselves mid-audit', async () => {
    write('u1', 'reclaim_current_hours__deep_work', '10', 'run-1', 10);
    write('u1', 'reclaim_current_hours__deep_work', '12', 'run-1', 12); // corrected before moving on

    const answers = await readRunAnswers('u1', 'run-1');
    expect(answers['reclaim_current_hours__deep_work']).toEqual(stated('12', 12));
  });

  it('ignores a value with no runId in its provenance', async () => {
    rows().push({
      userId: 'u1',
      slotSlug: 'x',
      version: 1,
      value: 'v',
      valueJson: null,
      provenance: { conversationId: 'c' },
      sourceType: 'direct',
      confidence: 10,
      supersededAt: null,
    });

    expect(await readRunAnswers('u1', 'run-1')).toEqual({});
  });

  it('reports how a reading was come by, which is what tells an inference from a statement', async () => {
    // The coach recorded this from what the leader implied rather than stated (stage 0's capture
    // path). The panel shows it back for confirmation, and it can only do that if the read says so.
    write('u1', 'reclaim_current_hours__delivery_operations', '20', 'run-1', 20, {
      sourceType: 'inferred',
      confidence: 4,
    });

    const answers = await readRunAnswers('u1', 'run-1');

    expect(answers['reclaim_current_hours__delivery_operations']).toEqual({
      value: '20',
      valueJson: 20,
      sourceType: 'inferred',
      confidence: 4,
    });
  });

  it('takes the confirmed reading once the leader has agreed one', async () => {
    write('u1', 'reclaim_current_hours__delivery_operations', '20', 'run-1', 20, {
      sourceType: 'inferred',
      confidence: 4,
    });
    write('u1', 'reclaim_current_hours__delivery_operations', '20', 'run-1', 20, {
      sourceType: 'user_confirmed',
      confidence: 10,
    });

    const answers = await readRunAnswers('u1', 'run-1');

    expect(answers['reclaim_current_hours__delivery_operations']?.sourceType).toBe(
      'user_confirmed'
    );
  });

  it('narrows to the requested slugs and scopes the query to the run', async () => {
    write('u1', 'reclaim_setup_weekly_hours', '50', 'run-1', 50);
    write('u1', 'reclaim_current_hours__deep_work', '10', 'run-1', 10);

    const answers = await readRunAnswers('u1', 'run-1', ['reclaim_setup_weekly_hours']);
    expect(Object.keys(answers)).toEqual(['reclaim_setup_weekly_hours']);

    const args = findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(args.where.userId).toBe('u1');
    expect(args.where.provenance).toEqual({ path: ['runId'], equals: 'run-1' });
    // And crucially: no `supersededAt` narrowing, which is what caused the bug.
    expect(args.where).not.toHaveProperty('supersededAt');
    // Ascending order is load-bearing, not incidental: the loop overwrites per slug, so `desc` would
    // return a leader's FIRST answer where they had corrected themselves. Asserted on the query
    // rather than only through the fake, so the guarantee does not depend on how the fake sorts.
    expect(args.orderBy).toEqual({ version: 'asc' });
  });

  it('scopes by user — one leader’s run id never reads another leader’s values', async () => {
    write('u1', 'reclaim_current_hours__deep_work', '10', 'run-1', 10);
    write('u2', 'reclaim_current_hours__deep_work', '99', 'run-1', 99);

    expect((await readRunAnswers('u1', 'run-1'))['reclaim_current_hours__deep_work']?.value).toBe(
      '10'
    );
  });
});

describe('readRunAnswers — verbatim round trip', () => {
  it('still parses a row written before `verbatim` existed, with no verbatim key on the answer', async () => {
    // Every row from before the field shipped has `provenance: { runId, conversationId }` and nothing
    // else — `provenanceRunIdSchema` must accept that shape rather than discarding the row.
    write('u1', 'reclaim_setup_why_now', 'A hard quarter', 'run-1');

    const answers = await readRunAnswers('u1', 'run-1');

    expect(answers['reclaim_setup_why_now']).toEqual(stated('A hard quarter'));
    expect(answers['reclaim_setup_why_now']).not.toHaveProperty('verbatim');
  });

  it('round-trips a distinct verbatim through the provenance blob', async () => {
    write('u1', 'reclaim_setup_why_now', 'They are worried about the team coping', 'run-1', null, {
      sourceType: 'inferred',
      confidence: 6,
      verbatim: "I don't think they'd cope, honestly.",
    });

    const answers = await readRunAnswers('u1', 'run-1');

    expect(answers['reclaim_setup_why_now']).toEqual({
      value: 'They are worried about the team coping',
      valueJson: null,
      sourceType: 'inferred',
      confidence: 6,
      verbatim: "I don't think they'd cope, honestly.",
    });
  });
});
