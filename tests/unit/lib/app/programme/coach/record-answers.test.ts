/**
 * The gate for conversational capture: a conversation must produce the same chart a form does.
 *
 * This is the one test the whole conversational plan rests on. Nine bucket hour slots feed the
 * charts, the benchmark comparisons, the gap arithmetic and the cross-audit trend lines. A form
 * guarantees a number in each. A conversation offers "about eight, some weeks more", and if that
 * lands as prose then `buildChartData` reads it through `num()`, which falls back to
 * `Number('about eight')`, gets `NaN`, and returns **0**. The chart still renders. The benchmarks
 * still compare. Every number is wrong and nothing anywhere says so.
 *
 * So the test drives the real capability with the tool calls a coach would actually emit from a
 * Phase 1 conversation, and asserts the chart built from what it wrote is byte-identical to the
 * chart built from the equivalent form submission. `appendSlotValue` is the only thing stubbed —
 * everything above it (the group allowlist, the typed-value rule, masking, run stamping) is the
 * shipping code.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** In-memory stand-in for the slot store, keyed like the real unique index. */
const store = new Map<string, { value: string; valueJson: unknown; version: number }>();

vi.mock('@/lib/framework/data-slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/framework/data-slots')>();
  return {
    ...actual,
    appendSlotValue: vi.fn(
      async (input: { userId: string; slotSlug: string; value: string; valueJson?: unknown }) => {
        const prior = store.get(input.slotSlug);
        const version = prior ? prior.version + 1 : 1;
        const row = {
          value: input.value,
          valueJson: input.valueJson ?? null,
          version,
        };
        store.set(input.slotSlug, row);
        return { slotSlug: input.slotSlug, version } as never;
      }
    ),
  };
});

const { ReclaimRecordAnswersCapability } =
  await import('@/lib/app/programme/coach/capabilities/record-answers');
const { saveAnswer } = await import('@/lib/app/programme/slots/write');
const { buildChartData } = await import('@/lib/app/programme/chart/series');
const { RECLAIM_RUN_SCOPE_KEY } = await import('@/lib/app/programme/coach/scope');
const { RECLAIM_MODULE_SLUG } = await import('@/lib/app/programme/identity');

const USER_ID = 'user_leader_1';
const RUN_ID = 'run_q3_2026';

const capability = new ReclaimRecordAnswersCapability();

const dispatchContext = {
  userId: USER_ID,
  agentId: 'agent_coach',
  conversationId: 'conv_1',
  scope: {
    moduleSlug: RECLAIM_MODULE_SLUG,
    nodeKey: 'phase-1-current',
    [RECLAIM_RUN_SCOPE_KEY]: RUN_ID,
  },
};

/** Snapshot the store in the shape `buildChartData` reads. */
function answersFromStore(): Record<string, { value: string; valueJson: unknown }> {
  const out: Record<string, { value: string; valueJson: unknown }> = {};
  for (const [slug, row] of store) out[slug] = { value: row.value, valueJson: row.valueJson };
  return out;
}

/**
 * The nine bucket hours as a leader might give them, plus the fundraising flag. One shared source
 * for both paths, so the comparison is about the *mechanism* and not about differing inputs.
 */
const HOURS: Record<string, number> = {
  deep_work: 6,
  learning_development: 2,
  strategic_planning: 4,
  team_development: 7,
  organisational_oversight: 9,
  fundraising_capital: 5,
  relationship_building: 3,
  delivery_operations: 18,
  recovery_white_space: 1,
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

/** The form path: what `phase1-panel.tsx` sends through `saveBatch` → `saveAnswer`. */
async function driveFormPath(): Promise<void> {
  await saveAnswer({
    userId: USER_ID,
    runId: RUN_ID,
    slotSlug: 'reclaim_setup_fundraising_relevant',
    value: 'Yes',
    valueJson: true,
  });
  for (const [token, hours] of Object.entries(HOURS)) {
    await saveAnswer({
      userId: USER_ID,
      runId: RUN_ID,
      slotSlug: `reclaim_current_hours__${token}`,
      value: String(hours),
      valueJson: hours,
    });
  }
}

describe('conversational capture produces the same chart as the form', () => {
  it('matches the form path exactly, bucket for bucket', async () => {
    await driveFormPath();
    const fromForm = buildChartData(answersFromStore());

    store.clear();

    // The same audit, captured conversationally. Note the readings are *not* uniform: some were
    // stated plainly, one was volunteered while answering something else, one was inferred and
    // carries lower confidence. That mix is the point of the tool, and none of it may change the
    // arithmetic.
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_setup_fundraising_relevant',
            value: 'Fundraising is a significant part of the role.',
            valueJson: true,
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'They said raising is most of their autumn.',
          },
          ...Object.entries(HOURS).map(([token, hours]) => ({
            slotSlug: `reclaim_current_hours__${token}`,
            value: `About ${hours} hours a week.`,
            valueJson: hours,
            confidence: token === 'recovery_white_space' ? 5 : 9,
            sourceType:
              token === 'recovery_white_space' ? ('inferred' as const) : ('direct' as const),
            reasoningNote:
              token === 'recovery_white_space'
                ? 'Read from their remark that there is almost nothing left over.'
                : 'Stated when asked about this area.',
          })),
        ],
      },
      dispatchContext
    );

    expect(result.success).toBe(true);
    expect(result.data?.refused).toEqual([]);
    expect(result.data?.recorded).toHaveLength(10);

    const fromConversation = buildChartData(answersFromStore());

    expect(fromConversation).toEqual(fromForm);
    // And the numbers are real, not a chart drawn from zeroes.
    expect(fromConversation.totalHours).toBe(55);
    expect(fromConversation.buckets.find((b) => b.token === 'delivery_operations')?.status).toBe(
      'over'
    );
  });

  it('fills several slots from one answer, which is the whole reason for a batch', async () => {
    // "I'm probably twenty hours in delivery firefighting, and honestly no protected block at all."
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__delivery_operations',
            value: 'Around 20 hours a week.',
            valueJson: 20,
            confidence: 8,
            sourceType: 'direct',
            reasoningNote: 'Stated directly when asked about delivery.',
          },
          {
            slotSlug: 'reclaim_current_detail__delivery_operations',
            value: 'Firefighting, mostly things that should sit with the team.',
            confidence: 9,
            sourceType: 'emerged_naturally',
            reasoningNote: 'Volunteered while giving the hours.',
          },
          {
            slotSlug: 'reclaim_current_deep_block_exists',
            value: 'No protected block at present.',
            valueJson: false,
            confidence: 9,
            sourceType: 'unprompted',
            reasoningNote: 'Said so without being asked about deep work.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.success).toBe(true);
    expect(result.data?.recorded.map((r) => r.slotSlug)).toEqual([
      'reclaim_current_hours__delivery_operations',
      'reclaim_current_detail__delivery_operations',
      'reclaim_current_deep_block_exists',
    ]);
    // The certainty and the provenance of each reading survive, which is what lets the form panel
    // show an inference differently from something the leader said outright.
    expect(result.data?.recorded.map((r) => r.sourceType)).toEqual([
      'direct',
      'emerged_naturally',
      'unprompted',
    ]);
  });
});

describe('the typed-value rule is what stops a chart being drawn from prose', () => {
  it('refuses hours given only as words, and says how to put it right', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: 'About eight, some weeks more.',
            confidence: 7,
            sourceType: 'direct',
            reasoningNote: 'Their own estimate, given loosely.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.success).toBe(true);
    expect(result.data?.recorded).toEqual([]);
    expect(result.data?.refused[0]?.code).toBe('typed_value_required');
    expect(result.data?.refused[0]?.message).toContain('confirm');
    expect(store.size).toBe(0);
  });

  it('shows what the refusal is protecting: prose hours would chart as zero', () => {
    // Not a behaviour we ship — a demonstration of why the rule exists. If the prose ever reached
    // the store, this is the silent failure that would follow.
    const chart = buildChartData({
      reclaim_current_hours__deep_work: { value: 'About eight', valueJson: null },
    });
    expect(chart.buckets.find((b) => b.token === 'deep_work')?.hours).toBe(0);
    expect(chart.unallocated).toContain('Deep work');
  });

  it('a partial batch records the good answers and refuses only the bad one', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__strategic_planning',
            value: 'Four hours.',
            valueJson: 4,
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'Stated.',
          },
          {
            slotSlug: 'reclaim_current_hours__team_development',
            value: 'Hard to say, it varies.',
            confidence: 4,
            sourceType: 'inferred',
            reasoningNote: 'No figure given.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.recorded.map((r) => r.slotSlug)).toEqual([
      'reclaim_current_hours__strategic_planning',
    ]);
    expect(result.data?.refused.map((r) => r.slotSlug)).toEqual([
      'reclaim_current_hours__team_development',
    ]);
  });
});

describe('the run comes from the server, never from the model', () => {
  it('refuses to record anything when no run is in scope', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '6',
            valueJson: 6,
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'Stated.',
          },
        ],
      },
      { userId: USER_ID, agentId: 'agent_coach', scope: { moduleSlug: RECLAIM_MODULE_SLUG } }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('no_run_scope');
    expect(store.size).toBe(0);
  });

  it('stamps every write with the run from scope, so a second audit cannot be written into', async () => {
    const { appendSlotValue } = await import('@/lib/framework/data-slots');

    await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '6',
            valueJson: 6,
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'Stated.',
          },
        ],
      },
      dispatchContext
    );

    expect(vi.mocked(appendSlotValue)).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: expect.objectContaining({ runId: RUN_ID, nodeKey: 'phase-1-current' }),
      })
    );
  });
});

describe('what the coach may not record', () => {
  it('refuses a reflection, so it can never open its own phase gate', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_reflection_p1',
            value: 'They noticed how much of the week is firefighting.',
            confidence: 8,
            sourceType: 'synthesised',
            reasoningNote: 'Summarised from what they said.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.recorded).toEqual([]);
    expect(result.data?.refused[0]?.code).toBe('group_refused');
    expect(store.size).toBe(0);
  });

  it('refuses sharing consent, so it can never manufacture it', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_share_with_coach',
            value: 'They seemed happy to share.',
            valueJson: true,
            confidence: 6,
            sourceType: 'inferred',
            reasoningNote: 'They spoke warmly about the coach.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.refused[0]?.code).toBe('group_refused');
    expect(store.size).toBe(0);
  });

  it('refuses the computed calendar lane', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_calendar_hours__deep_work',
            value: 'Their calendar looked like about four hours.',
            valueJson: 4,
            confidence: 5,
            sourceType: 'inferred',
            reasoningNote: 'Guessed from the conversation.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.refused[0]?.code).toBe('group_refused');
    expect(store.size).toBe(0);
  });
});

describe('provenance redaction', () => {
  it("keeps the shape of a write and none of the leader's words", () => {
    const args = {
      answers: [
        {
          slotSlug: 'reclaim_setup_keeping_me_up',
          value: 'That the board will find out how far behind the restructure is.',
          confidence: 9,
          sourceType: 'direct' as const,
          reasoningNote: 'They said the board will find out how far behind they are.',
        },
      ],
    };
    const redacted = capability.redactProvenance(args, {
      success: true,
      data: { recorded: [], refused: [] },
    });
    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain('board');
    expect(serialised).not.toContain('restructure');
    // The slug survives: it is a vetted identifier from this module's own definitions, and without
    // it the audit trail cannot answer what the coach recorded here.
    expect(serialised).toContain('reclaim_setup_keeping_me_up');
    expect(serialised).toContain('direct');
  });
});
