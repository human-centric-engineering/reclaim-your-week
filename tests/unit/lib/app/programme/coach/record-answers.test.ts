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
const store = new Map<
  string,
  { value: string; valueJson: unknown; version: number; provenance: Record<string, unknown> }
>();

vi.mock('@/lib/framework/data-slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/framework/data-slots')>();
  return {
    ...actual,
    appendSlotValue: vi.fn(
      async (input: {
        userId: string;
        slotSlug: string;
        value: string;
        valueJson?: unknown;
        provenance: Record<string, unknown>;
      }) => {
        const prior = store.get(input.slotSlug);
        const version = prior ? prior.version + 1 : 1;
        const row = {
          value: input.value,
          valueJson: input.valueJson ?? null,
          version,
          provenance: input.provenance,
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

/**
 * The gap that let a whole phase go unrecorded, and why every test here goes through `validate`.
 *
 * Every test above calls `execute` directly with args already in the right shape, which is not how
 * the dispatcher calls it: `BaseCapability.validate` parses the whole argument object first, and a
 * schema strict enough to reject one entry rejected all of them. A leader answered six slots in one
 * sentence, the coach sent the direct-reports count as the number 25, and the batch came back
 * `invalid_args` with nothing recorded and no sentence saying what to fix. The model retried the same
 * call, failed again, and the chat handler's circuit breaker took the tool away for the rest of the
 * turn, so the third and corrected call never ran. Panel: nought of fifteen.
 *
 * So these drive the capability the way the dispatcher does, and the assertion that matters most is
 * the least obvious one: `success` stays true. A model-argument slip must be reported as a refusal,
 * because a failure is what feeds the breaker.
 */
describe('a batch survives one bad entry, because a failed call costs the coach its tool', () => {
  /** `validate` then `execute`, which is what the dispatcher does and what the tests above skipped. */
  async function dispatch(rawArgs: unknown, context = dispatchContext) {
    return capability.execute(capability.validate(rawArgs), context);
  }

  it('records the whole answer a leader gave in one breath, count and all', async () => {
    // The exact shape the coach emitted in the conversation that prompted this: six readings from
    // one sentence, with the count sent as a number because that is what a count is.
    const result = await dispatch({
      answers: [
        {
          slotSlug: 'reclaim_profile_first_name',
          value: 'John',
          confidence: 10,
          sourceType: 'direct',
          reasoningNote: 'They gave their name.',
        },
        {
          slotSlug: 'reclaim_profile_role',
          value: 'Head of Engineering',
          confidence: 10,
          sourceType: 'direct',
          reasoningNote: 'They stated their role.',
        },
        {
          slotSlug: 'reclaim_profile_direct_reports',
          value: 25,
          confidence: 10,
          sourceType: 'direct',
          reasoningNote: 'They said twenty five direct reports.',
        },
        {
          slotSlug: 'reclaim_profile_distributed_team',
          value: 'Yes',
          confidence: 10,
          sourceType: 'direct',
          reasoningNote: 'Two offices, Guildford and Manchester.',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.refused).toEqual([]);
    expect(result.data?.recorded).toHaveLength(4);

    // The prose is the prose, and the typed forms are real values rather than strings — which is
    // what everything downstream of a number or a boolean slot depends on.
    expect(store.get('reclaim_profile_direct_reports')).toMatchObject({
      value: '25',
      valueJson: 25,
    });
    expect(store.get('reclaim_profile_distributed_team')).toMatchObject({
      value: 'Yes',
      valueJson: true,
    });
  });

  it('refuses only the entry it cannot read, and never fails the call', async () => {
    const result = await dispatch({
      answers: [
        {
          slotSlug: 'reclaim_current_hours__deep_work',
          value: 'Six hours.',
          valueJson: 6,
          confidence: 9,
          sourceType: 'direct',
          reasoningNote: 'Stated.',
        },
        // No slug at all — there is nothing to write this against.
        { value: 'Something they said.', confidence: 9, sourceType: 'direct', reasoningNote: 'x' },
        {
          slotSlug: 'reclaim_current_detail__deep_work',
          value: 'Early mornings, before anyone is up.',
          confidence: 9,
          sourceType: 'direct',
          reasoningNote: 'Said in the same breath.',
        },
      ],
    });

    // The load-bearing assertion: a bad argument is a refusal, not a failure. A failure here is what
    // spends a life on the chat handler's tool circuit breaker and takes the tool away mid-phase.
    expect(result.success).toBe(true);
    expect(result.data?.recorded.map((r) => r.slotSlug)).toEqual([
      'reclaim_current_hours__deep_work',
      'reclaim_current_detail__deep_work',
    ]);
    expect(result.data?.refused).toHaveLength(1);
    expect(result.data?.refused[0]?.code).toBe('invalid_answer');
  });

  it('keeps an unusable source type to itself rather than losing the batch for it', async () => {
    const result = await dispatch({
      answers: [
        {
          slotSlug: 'reclaim_setup_why_now',
          value: 'A board review is coming.',
          confidence: 8,
          sourceType: 'made_it_up',
          reasoningNote: 'Not one of the enumerated kinds.',
        },
        {
          slotSlug: 'reclaim_setup_keeping_me_up',
          value: 'Whether the restructure lands.',
          confidence: 8,
          sourceType: 'direct',
          reasoningNote: 'Stated.',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.recorded.map((r) => r.slotSlug)).toEqual(['reclaim_setup_keeping_me_up']);
    expect(result.data?.refused[0]?.code).toBe('invalid_answer');
  });

  it('takes a confidence it can work with instead of throwing the reading away', async () => {
    const result = await dispatch({
      answers: [
        {
          slotSlug: 'reclaim_setup_why_now',
          value: 'A board review is coming.',
          confidence: 12,
          sourceType: 'direct',
          reasoningNote: 'Stated.',
        },
      ],
    });

    expect(result.data?.recorded[0]?.confidence).toBe(10);
  });

  it('records the first twelve of an over-long batch and says so about the rest', async () => {
    const tokens = [
      'deep_work',
      'learning_development',
      'strategic_planning',
      'team_development',
      'organisational_oversight',
      'relationship_building',
      'delivery_operations',
      'recovery_white_space',
    ];
    const answers = [
      ...tokens.map((token, i) => ({
        slotSlug: `reclaim_current_hours__${token}`,
        value: String(i + 1),
        valueJson: i + 1,
        confidence: 9,
        sourceType: 'direct',
        reasoningNote: 'Stated.',
      })),
      ...tokens.map((token) => ({
        slotSlug: `reclaim_current_detail__${token}`,
        value: 'What that time looks like.',
        confidence: 9,
        sourceType: 'direct',
        reasoningNote: 'Said alongside the figure.',
      })),
    ];

    const result = await dispatch({ answers });

    expect(result.success).toBe(true);
    expect(result.data?.recorded).toHaveLength(12);
    expect(result.data?.refused).toHaveLength(4);
    expect(result.data?.refused.every((r) => r.code === 'batch_too_long')).toBe(true);
    // Named, so the coach knows which four to send again rather than guessing.
    expect(result.data?.refused[0]?.slotSlug).toBe(
      'reclaim_current_detail__organisational_oversight'
    );
  });

  it('redacts a malformed entry down to its type, so the trace is whole and still says nothing', () => {
    const redacted = capability.redactProvenance(
      { answers: ['a bare string the model sent by mistake'] },
      { success: true, data: { recorded: [], refused: [] } }
    );
    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain('bare string');
    expect(serialised).toContain('malformed');
  });
});

/**
 * The typed-value rule, and the case it was never about.
 *
 * "About eight, some weeks more" must not become a number, because a figure invented from a hedge
 * fails silently — the chart still draws. "25" is not that. Refusing it spent a turn asking the coach
 * to move a value between two keys, and what the coach actually did was move on to the next question
 * with the reading lost.
 */
describe('an unambiguous figure is read out of the prose; an approximate one still is not', () => {
  async function record(slotSlug: string, value: string) {
    return capability.execute(
      {
        answers: [
          { slotSlug, value, confidence: 9, sourceType: 'direct', reasoningNote: 'Stated.' },
        ],
      },
      dispatchContext
    );
  }

  it('reads a bare figure into the typed value', async () => {
    const result = await record('reclaim_current_hours__deep_work', '6');
    expect(result.data?.refused).toEqual([]);
    expect(store.get('reclaim_current_hours__deep_work')?.valueJson).toBe(6);
  });

  it('reads a bare yes or no into the typed value', async () => {
    await record('reclaim_setup_in_transition', 'No');
    expect(store.get('reclaim_setup_in_transition')?.valueJson).toBe(false);
  });

  it.each(['About eight, some weeks more.', '8 hours', 'eight', 'somewhere between 6 and 10'])(
    'still refuses %s, because that needs a reading rather than a parse',
    async (prose) => {
      const result = await record('reclaim_current_hours__deep_work', prose);
      expect(result.data?.recorded).toEqual([]);
      expect(result.data?.refused[0]?.code).toBe('typed_value_required');
      expect(store.size).toBe(0);
    }
  );

  it('still refuses a sentence about a yes-or-no slot, which is a summary and not an answer', async () => {
    const result = await record(
      'reclaim_setup_in_transition',
      'They are in the middle of a restructure.'
    );
    expect(result.data?.refused[0]?.code).toBe('typed_value_required');
  });

  it('leaves an explicit typed value alone, so the fallback can never override the coach', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '6',
            valueJson: 9,
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'They corrected themselves to nine.',
          },
        ],
      },
      dispatchContext
    );
    expect(result.data?.refused).toEqual([]);
    expect(store.get('reclaim_current_hours__deep_work')?.valueJson).toBe(9);
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

/**
 * The reflection is the one thing on this capability that was widened rather than narrowed. It used
 * to be refused outright, on the reasoning that the coach could otherwise open its own phase gate;
 * what that left on screen was the audit's central question asked by a textarea under the
 * conversation. The gate is still the server's (I9, in the transition route). What stops the coach
 * walking through it is that it may only write the reflection for the phase the *route* put in scope,
 * and only for something the leader actually said.
 */
describe('the reflection the coach may record, and the three it may not', () => {
  it("records this phase's reflection, in what the leader said", async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_reflection_p1',
            value: 'Most of my week is firefighting I did not choose.',
            confidence: 9,
            sourceType: 'user_confirmed',
            reasoningNote: 'Their words, offered back and confirmed.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.refused).toEqual([]);
    expect(result.data?.recorded[0]?.slotSlug).toBe('reclaim_reflection_p1');
    expect(store.size).toBe(1);
  });

  it("refuses another phase's reflection, so it cannot clear the gates ahead", async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_reflection_p4',
            value: 'The gap is mostly delegation.',
            confidence: 8,
            sourceType: 'direct',
            reasoningNote: 'Said while talking about phase one.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.recorded).toEqual([]);
    expect(result.data?.refused[0]?.code).toBe('reflection_wrong_phase');
    expect(store.size).toBe(0);
  });

  it('refuses an inferred reflection, because a reflection is not something worked out for someone', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_reflection_p1',
            value: 'They noticed how much of the week is firefighting.',
            confidence: 5,
            sourceType: 'inferred',
            reasoningNote: 'Read between the lines.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.recorded).toEqual([]);
    expect(result.data?.refused[0]?.code).toBe('reflection_not_inferred');
    expect(store.size).toBe(0);
  });

  it('refuses a reflection on a turn that carries no phase, rather than guessing which one', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_reflection_p1',
            value: 'Most of my week is firefighting.',
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'Their words.',
          },
        ],
      },
      {
        userId: USER_ID,
        agentId: 'agent_coach',
        scope: { moduleSlug: RECLAIM_MODULE_SLUG, [RECLAIM_RUN_SCOPE_KEY]: RUN_ID },
      }
    );

    expect(result.data?.recorded).toEqual([]);
    expect(result.data?.refused[0]?.code).toBe('reflection_wrong_phase');
    expect(store.size).toBe(0);
  });
});

describe('what the coach may not record', () => {
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

describe("the leader's own sentence, kept beside the coach's reading of it", () => {
  it('stores the quote on provenance, where the refer-back can find it', async () => {
    // `value` is the tidy reading and `verbatim` is what they actually said. Both are kept because
    // the gap phase quotes these words back at the leader, and quoting a paraphrase is the tool
    // putting words in their mouth.
    await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_setup_keeping_me_up',
            value: 'Whether the organisation can function without them.',
            verbatim: 'Honestly, whether the whole thing falls over if I take a week off.',
            confidence: 9,
            sourceType: 'direct',
            reasoningNote: 'They said it plainly when asked.',
          },
        ],
      },
      dispatchContext
    );

    const row = store.get('reclaim_setup_keeping_me_up');
    expect(row?.value).toBe('Whether the organisation can function without them.');
    expect(row?.provenance.verbatim).toBe(
      'Honestly, whether the whole thing falls over if I take a week off.'
    );
    // And the run stamp is untouched by the new field.
    expect(row?.provenance.runId).toBe(RUN_ID);
  });

  it('stores nothing when the coach did not catch a quote, so the reader falls back cleanly', async () => {
    await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_setup_why_now',
            value: 'A board review is coming up.',
            confidence: 8,
            sourceType: 'emerged_naturally',
            reasoningNote: 'It came up while they were describing the quarter.',
          },
        ],
      },
      dispatchContext
    );

    expect(store.get('reclaim_setup_why_now')?.provenance.verbatim).toBeUndefined();
  });

  it('does not duplicate the reading when the quote and the reading are the same string', async () => {
    // A coach that sends the same string twice should not double the row's storage for nothing.
    // `presentAnswer` falls back to `value`, so the rendered result is identical either way.
    await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_setup_why_now',
            value: 'A board review is coming up.',
            verbatim: 'A board review is coming up.',
            confidence: 8,
            sourceType: 'direct',
            reasoningNote: 'Their exact words were already the reading.',
          },
        ],
      },
      dispatchContext
    );

    expect(store.get('reclaim_setup_why_now')?.provenance.verbatim).toBeUndefined();
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

  it("masks the leader's verbatim as its own key, so the trace still shows a quote was taken", () => {
    const redacted = capability.redactProvenance(
      {
        answers: [
          {
            slotSlug: 'reclaim_setup_why_now',
            value: 'The board asked for a plan by September.',
            verbatim: 'honestly the board has finally started asking me for a plan',
            valueJson: { months: 2 },
            confidence: 9,
            sourceType: 'direct' as const,
            reasoningNote: 'They said the board asked.',
          },
        ],
      },
      { success: true, data: { recorded: [], refused: [] } }
    );
    const serialised = JSON.stringify(redacted);

    // The verbatim is the leader's sentence in the strictest sense and the last thing that belongs
    // in a durable trace — but folding it into `value`'s marker would hide that one was captured.
    expect(serialised).not.toContain('honestly the board');
    expect(serialised).toContain('slot-verbatim');
    expect(serialised).toContain('slot-value-json');
  });

  it('records the type alone of an entry that is not an answer at all', () => {
    const redacted = capability.redactProvenance(
      // The entries arrive unparsed, so this reads defensively rather than trusting a shape
      // `validate` no longer guarantees.
      { answers: ['reclaim_setup_why_now', null, 42] as never },
      { success: false, error: { message: 'nope', code: 'bad' } }
    );

    // An operator should be able to see that something malformed arrived without seeing what was in
    // it — so the type, and nothing else.
    expect(redacted.args).toEqual({
      answers: [{ malformed: 'string' }, { malformed: 'object' }, { malformed: 'number' }],
    });
  });

  it('drops a confidence or source type that arrived as the wrong kind of thing', () => {
    const redacted = capability.redactProvenance(
      {
        answers: [
          {
            slotSlug: 'reclaim_setup_why_now',
            value: 'A plan by September.',
            confidence: 'high',
            sourceType: 7,
            reasoningNote: 'They said so.',
          },
        ],
      },
      { success: true, data: { recorded: [], refused: [] } }
    );

    const [entry] = (redacted.args as { answers: Record<string, unknown>[] }).answers;
    expect(entry).not.toHaveProperty('confidence');
    expect(entry).not.toHaveProperty('sourceType');
    // The slug is the one field carried through verbatim, and only when it is the vetted kind.
    expect(entry.slotSlug).toBe('reclaim_setup_why_now');
  });

  it('omits the slug entirely when it is not a string', () => {
    const redacted = capability.redactProvenance(
      {
        answers: [
          {
            slotSlug: { slug: 'reclaim_setup_why_now' } as unknown as string,
            value: 'A plan by September.',
            confidence: 9,
            sourceType: 'direct' as const,
            reasoningNote: 'They said so.',
          },
        ],
      },
      { success: true, data: { recorded: [], refused: [] } }
    );

    const [entry] = (redacted.args as { answers: Record<string, unknown>[] }).answers;
    // Better an entry with no slug than a slug that is an object the trace reader will misread as
    // one of this module's own identifiers.
    expect(entry).not.toHaveProperty('slotSlug');
  });
});

describe('the grant is enforced at run time, not merely stated on the binding', () => {
  /**
   * For a version, I6 and two docblocks all said the write allowlist was "enforced a second time" by
   * the framework's `facetAllows`. It was not: `facetAllows` runs inside the framework's own
   * `fill_slot` and `get_state`, and a module capability that never calls it has an `ExposureConfig`
   * that enforces nothing. The writes were still constrained by `checkSlotWrite`, so nothing was
   * broken — but a rule documented as held twice and held once is worse than one held once and known
   * to be. These are the tests that would have caught it.
   */
  it('refuses a write outside the groups the grant permits', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '9',
            valueJson: 9,
            confidence: 9,
            sourceType: 'direct' as const,
            reasoningNote: 'They said nine hours.',
          },
        ],
      },
      { ...dispatchContext, customConfig: { write: { groups: ['reclaim_profile'] } } }
    );

    expect(result.success).toBe(true);
    expect(result.data?.recorded).toEqual([]);
    expect(result.data?.refused[0]).toMatchObject({
      slotSlug: 'reclaim_current_hours__deep_work',
      code: 'group_refused',
    });
    // The point of the test: nothing reached the store.
    expect(store.has('reclaim_current_hours__deep_work')).toBe(false);
  });

  it('still records a write the grant does permit', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '9',
            valueJson: 9,
            confidence: 9,
            sourceType: 'direct' as const,
            reasoningNote: 'They said nine hours.',
          },
        ],
      },
      { ...dispatchContext, customConfig: { write: { groups: ['reclaim_current'] } } }
    );

    expect(result.data?.refused).toEqual([]);
    expect(result.data?.recorded).toHaveLength(1);
  });

  it('fails closed on a grant it cannot read, rather than writing anyway', async () => {
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '9',
            valueJson: 9,
            confidence: 9,
            sourceType: 'direct' as const,
            reasoningNote: 'They said nine hours.',
          },
        ],
      },
      { ...dispatchContext, customConfig: { write: { groups: 'not-a-list' } } }
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ code: 'exposure_invalid' });
    expect(store.has('reclaim_current_hours__deep_work')).toBe(false);
  });

  it('treats an absent grant as unrestricted, matching the framework convention', async () => {
    // `facetAllows(undefined, …)` is true throughout the framework, and the code rule still applies.
    // Asserted so that a future change to fail closed here is a deliberate act rather than a
    // surprise: it would silently stop every write on a binding seeded before this field existed.
    const result = await capability.execute(
      {
        answers: [
          {
            slotSlug: 'reclaim_current_hours__deep_work',
            value: '9',
            valueJson: 9,
            confidence: 9,
            sourceType: 'direct' as const,
            reasoningNote: 'They said nine hours.',
          },
        ],
      },
      dispatchContext
    );

    expect(result.data?.recorded).toHaveLength(1);
  });
});
