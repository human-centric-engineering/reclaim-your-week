/**
 * The capture sweep — the half of recording that does not depend on the coach remembering to.
 *
 * These drive the real sweep with the exchanges that were actually lost in live testing, and stub
 * only the two edges: the provider (so the extraction is a fixture rather than a model call) and
 * `appendSlotValue` (so the writes land somewhere readable). Everything between — the worklist, the
 * group allowlist, the typed-value rule, the supersede guards, run stamping — is the shipping code.
 *
 * The two sentences at the centre of this file are real. "I end up spending more time with the
 * Manchester people to compensate for not being located there" was the whole of
 * `reclaim_profile_distributed_impact`, given in reply to a question about exactly that, and the
 * coach recorded nothing. So was "change happens all the time, life at work is chaotic". A sweep that
 * cannot pick those up is not worth running.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** In-memory stand-in for the slot store, keyed like the real unique index. */
const store = new Map<
  string,
  {
    value: string;
    valueJson: unknown;
    version: number;
    sourceType: string;
    confidence: number;
    provenance: Record<string, unknown>;
  }
>();

const {
  readRunAnswers,
  resolveAgentProviderAndModel,
  getProvider,
  runStructuredCompletion,
  findUnique,
} = vi.hoisted(() => ({
  readRunAnswers: vi.fn(),
  resolveAgentProviderAndModel: vi.fn(),
  getProvider: vi.fn(),
  runStructuredCompletion: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiAgent: { findUnique },
    aiMessage: {
      findMany: vi.fn(async () => [
        {
          role: 'assistant',
          content: 'How does this distribution affect your leadership approach?',
        },
        {
          role: 'user',
          content:
            'I end up spending more time with the manchester people to compensate for not being located there',
        },
      ]),
    },
  },
}));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers }));
vi.mock('@/lib/app/programme/buckets/labels', () => ({
  readBucketLabels: vi.fn(async () => ({})),
}));
vi.mock('@/lib/orchestration/llm/agent-resolver', () => ({ resolveAgentProviderAndModel }));
vi.mock('@/lib/orchestration/llm/provider-manager', () => ({ getProvider }));
vi.mock('@/lib/orchestration/llm/structured-completion', () => ({ runStructuredCompletion }));
vi.mock('@/lib/framework/data-slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/framework/data-slots')>();
  return {
    ...actual,
    appendSlotValue: vi.fn(
      async (input: {
        slotSlug: string;
        value: string;
        valueJson?: unknown;
        sourceType: string;
        confidence: number;
        provenance: Record<string, unknown>;
      }) => {
        const version = (store.get(input.slotSlug)?.version ?? 0) + 1;
        store.set(input.slotSlug, {
          value: input.value,
          valueJson: input.valueJson ?? null,
          version,
          sourceType: input.sourceType,
          confidence: input.confidence,
          provenance: input.provenance,
        });
        return { slotSlug: input.slotSlug, version } as never;
      }
    ),
  };
});

const { runCaptureSweep } = await import('@/lib/app/programme/coach/capture-sweep');

const USER_ID = 'user-1';
const RUN_ID = 'run-q3';

const input = {
  userId: USER_ID,
  runId: RUN_ID,
  phaseKey: 'phase-0-setup',
  conversationId: 'conv-1',
};

/** What the extractor came back with, in the shape the sweep's own parser produces. */
type Reading = {
  slotSlug: string;
  value: string;
  verbatim?: string;
  confidence: number;
  sourceType: string;
  reasoningNote: string;
  supersedes: boolean;
};

const extracts = (...readings: Partial<Reading>[]) => {
  runStructuredCompletion.mockResolvedValue({
    value: readings.map((r) => ({
      value: 'Something they said',
      confidence: 9,
      sourceType: 'direct',
      reasoningNote: 'From the exchange.',
      supersedes: false,
      ...r,
    })),
    tokenUsage: { input: 100, output: 20 },
    costUsd: 0.001,
  });
};

/** One reading already in the run, in the shape `readRunAnswers` returns. */
const held = (value: string, over: Partial<{ sourceType: string; confidence: number }> = {}) => ({
  value,
  valueJson: null,
  sourceType: 'direct',
  confidence: 9,
  ...over,
});

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  readRunAnswers.mockResolvedValue({});
  findUnique.mockResolvedValue({ id: 'agent-1', provider: 'openai', model: 'gpt-4o' });
  resolveAgentProviderAndModel.mockResolvedValue({ providerSlug: 'openai', model: 'gpt-4o' });
  getProvider.mockResolvedValue({ name: 'openai' });
  extracts();
});

describe('the sweep records what the coach did not', () => {
  it('picks up the answer to the question that was just asked', async () => {
    extracts({
      slotSlug: 'reclaim_profile_distributed_impact',
      value: 'They spend more time with the Manchester team to make up for not being based there.',
      verbatim:
        'I end up spending more time with the manchester people to compensate for not being located there',
    });

    const result = await runCaptureSweep(input);

    expect(result.recorded).toEqual(['reclaim_profile_distributed_impact']);
    expect(store.get('reclaim_profile_distributed_impact')?.value).toContain('Manchester');
    // The leader's own sentence survives, because the gap phase quotes these words back at them.
    expect(store.get('reclaim_profile_distributed_impact')?.provenance.verbatim).toContain(
      'compensate'
    );
  });

  it('stamps the run and the phase from the server, never from the extraction', async () => {
    extracts({ slotSlug: 'reclaim_setup_why_now', value: 'A board review is coming.' });

    await runCaptureSweep(input);

    expect(store.get('reclaim_setup_why_now')?.provenance).toMatchObject({
      runId: RUN_ID,
      nodeKey: 'phase-0-setup',
    });
  });

  it('reads a bare yes into the typed value, so a boolean slot is not refused for prose', async () => {
    extracts({ slotSlug: 'reclaim_setup_in_transition', value: 'Yes' });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual([]);
    expect(store.get('reclaim_setup_in_transition')?.valueJson).toBe(true);
  });

  it('refuses a figure it could not state plainly rather than storing a wrong number', async () => {
    extracts({ slotSlug: 'reclaim_setup_weekly_hours', value: 'Hard to say, it varies a lot' });

    const result = await runCaptureSweep(input);

    expect(result.recorded).toEqual([]);
    expect(result.refused).toEqual(['reclaim_setup_weekly_hours:typed_value_required']);
    expect(store.size).toBe(0);
  });

  it('refuses a note that the leader did not answer, which is not an answer', async () => {
    // Observed on a live audit, and the leader saw it. A message about a role, a team and two
    // locations came back with `reclaim_profile_first_name` at confidence 9, valued "The leader did
    // not provide their first name in this exchange." Nothing refused it, and the panel then showed
    // that sentence in the row headed "Your first name" as though they had said it. Leaving a reading
    // out means returning nothing for it, never returning a value that says it was not answered.
    extracts({
      slotSlug: 'reclaim_profile_first_name',
      value: 'The leader did not provide their first name in this exchange.',
      reasoningNote: 'The leader did not mention their first name in the exchange.',
    });

    const result = await runCaptureSweep(input);

    expect(result.recorded).toEqual([]);
    expect(result.refused).toEqual(['reclaim_profile_first_name:not_an_answer']);
    expect(store.size).toBe(0);
  });

  it('refuses a placeholder standing in for a reading nobody gave', async () => {
    extracts({ slotSlug: 'reclaim_setup_why_now', value: 'Not provided' });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual(['reclaim_setup_why_now:not_an_answer']);
    expect(store.size).toBe(0);
  });

  it('still records a real answer that merely opens on similar words', async () => {
    // The other half of the rule, and the reason it is anchored rather than searched for: a leader
    // talking about leadership, or about what their week did not protect, is answering.
    extracts({
      slotSlug: 'reclaim_setup_why_now',
      value: 'No time was protected last quarter, and that is what finally pushed me to do this.',
    });

    const result = await runCaptureSweep(input);

    expect(result.recorded).toEqual(['reclaim_setup_why_now']);
  });

  it('reaches nowhere but the phase the leader is on', async () => {
    // The brief names this phase's slugs. A slug outside it is the extractor reaching past its
    // worklist, and it is checked in code rather than trusted from the prompt.
    extracts({ slotSlug: 'reclaim_current_hours__deep_work', value: '6' });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual(['reclaim_current_hours__deep_work:off_phase']);
    expect(store.size).toBe(0);
  });

  it('never records a reflection, which is the leader’s own noticing to have', async () => {
    // Excluded from the worklist as well as refused by `checkSlotWrite`. A sweep that inferred a
    // reflection would be the tool having the pause on the leader's behalf.
    extracts({ slotSlug: 'reclaim_reflection_p1', value: 'Most of the week is firefighting.' });

    const result = await runCaptureSweep({ ...input, phaseKey: 'phase-1-current' });

    expect(result.recorded).toEqual([]);
    expect(store.size).toBe(0);
  });
});

/**
 * Synthesis: a captured reading is not a closed one.
 *
 * A leader says "about fifteen hours on relationships", and two turns later, describing something
 * else, mentions that most of it is one board member. The second sentence is not a new slot; it is
 * the first reading, better.
 */
describe('a reading that grows across turns', () => {
  it('supersedes what is held with a value carrying both, recorded as built across turns', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_setup_keeping_me_up: held('Whether the restructure lands.'),
    });
    extracts({
      slotSlug: 'reclaim_setup_keeping_me_up',
      value: 'Whether the restructure lands, and whether the team survives it.',
      confidence: 9,
      supersedes: true,
    });

    const result = await runCaptureSweep(input);

    expect(result.recorded).toEqual(['reclaim_setup_keeping_me_up']);
    const row = store.get('reclaim_setup_keeping_me_up');
    expect(row?.value).toContain('team survives');
    // The source type the framework's vocabulary defines for exactly this, and which the panel reads
    // to decide what to offer back.
    expect(row?.sourceType).toBe('built_across_turns');
    // And the earlier reading is behind it rather than gone: slot values are versioned.
    expect(row?.version).toBe(1);
  });

  it('leaves a captured reading alone when the exchange adds nothing to it', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_setup_keeping_me_up: held('Whether the restructure lands.'),
    });
    extracts({
      slotSlug: 'reclaim_setup_keeping_me_up',
      value: 'Whether the restructure lands.',
      supersedes: false,
    });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual(['reclaim_setup_keeping_me_up:already_held']);
    expect(store.size).toBe(0);
  });

  it('does not rewrite a reading in different words', async () => {
    // `supersedes` set does not make it an addition. An identical value is a rewrite, and a rewrite
    // is a version of the leader's audit that says the same thing at a different timestamp.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_why_now: held('A board review is coming.'),
    });
    extracts({
      slotSlug: 'reclaim_setup_why_now',
      value: 'A board review is coming.',
      supersedes: true,
    });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual(['reclaim_setup_why_now:already_held']);
  });

  it('never writes over something the leader confirmed', async () => {
    // A `user_confirmed` reading is one they were shown and agreed to. Improving on it is the tool
    // editing the leader.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_why_now: held('A board review is coming.', { sourceType: 'user_confirmed' }),
    });
    extracts({
      slotSlug: 'reclaim_setup_why_now',
      value: 'A board review, and the funding round behind it.',
      confidence: 10,
      supersedes: true,
    });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual(['reclaim_setup_why_now:already_held']);
    expect(store.size).toBe(0);
  });

  it('never lets a guess displace something already settled', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_setup_why_now: held('A board review is coming.') });
    extracts({
      slotSlug: 'reclaim_setup_why_now',
      value: 'Possibly something to do with the funding round.',
      confidence: 4,
      sourceType: 'inferred',
      supersedes: true,
    });

    const result = await runCaptureSweep(input);

    expect(result.refused).toEqual(['reclaim_setup_why_now:already_held']);
  });
});

describe('a sweep that cannot run costs the leader nothing', () => {
  it('returns rather than throwing when the provider is unreachable', async () => {
    runStructuredCompletion.mockRejectedValue(new Error('provider down'));

    const result = await runCaptureSweep(input);

    expect(result).toEqual({ recorded: [], refused: [], skipped: 'failed' });
  });

  it('does not run at all without a conversation to read', async () => {
    const result = await runCaptureSweep({ ...input, conversationId: undefined });

    expect(result.skipped).toBe('no_transcript');
    expect(runStructuredCompletion).not.toHaveBeenCalled();
  });

  it('does not run on a phase that captures nothing conversationally', async () => {
    // Phase 6's own slots are the sharing choices, which are consent and never the coach's.
    const result = await runCaptureSweep({ ...input, phaseKey: 'phase-6-summary' });

    expect(result.skipped).toBe('no_slots');
    expect(runStructuredCompletion).not.toHaveBeenCalled();
  });

  it('takes an empty extraction as the real answer it usually is', async () => {
    extracts();

    const result = await runCaptureSweep(input);

    expect(result.skipped).toBe('nothing_outstanding');
    expect(store.size).toBe(0);
  });
});

describe('what the extractor is told', () => {
  it('names every outstanding reading of this phase, and what each captured one currently holds', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_profile_first_name: held('John') });

    await runCaptureSweep(input);

    const brief = runStructuredCompletion.mock.calls[0][0].messages[1].content as string;
    expect(brief).toContain('reclaim_setup_why_now (not yet captured)');
    expect(brief).toContain('reclaim_profile_first_name (captured as "John")');
    // The exchange it is reading, with the coach's question above the leader's answer — a bare "yes"
    // means nothing without the question it answers.
    expect(brief).toContain('Coach: How does this distribution affect');
    expect(brief).toContain('Leader: I end up spending more time');
  });

  it('does not offer a reading that does not apply to this leader', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_setup_fundraising_relevant: { ...held('No'), valueJson: false },
    });

    await runCaptureSweep(input);

    const brief = runStructuredCompletion.mock.calls[0][0].messages[1].content as string;
    expect(brief).not.toContain('reclaim_setup_fundraising_support');
  });
});

/**
 * The parser is the boundary between an untrusted model response and the slot store, and every other
 * test in this file steps over it: `runStructuredCompletion` is stubbed, so the `parse` callback the
 * sweep hands it is never called and nothing here was exercised at all.
 *
 * So these reach for the real callback rather than a copy of it — run the sweep once, take the
 * function off the recorded call, and drive it. That way the thing under test is the parser this
 * module actually ships to the runner, and a change to which parser is passed shows up here.
 *
 * What it must get right is a refusal, not a rescue. A malformed response is dropped whole (`null`,
 * which is what tells the runner to retry) and a malformed *row* is dropped on its own; nothing is
 * guessed at, because a guess here writes a wrong sentence into a leader's audit under their name.
 */
describe('what the parser will accept from the model', () => {
  /** The `parse` callback as the sweep passes it to the runner. */
  const parser = async (): Promise<(raw: string) => unknown[] | null> => {
    await runCaptureSweep(input);
    return runStructuredCompletion.mock.calls[0][0].parse as (raw: string) => unknown[] | null;
  };

  const row = (over: Record<string, unknown> = {}) => ({
    slotSlug: 'reclaim_setup_why_now',
    value: 'The board asked for a plan by September.',
    confidence: 8,
    sourceType: 'direct',
    reasoningNote: 'They said it outright.',
    ...over,
  });

  it('takes a well-formed reading whole', async () => {
    const parse = await parser();

    expect(parse(JSON.stringify({ readings: [row({ verbatim: 'the board asked me' })] }))).toEqual([
      {
        slotSlug: 'reclaim_setup_why_now',
        value: 'The board asked for a plan by September.',
        verbatim: 'the board asked me',
        confidence: 8,
        sourceType: 'direct',
        reasoningNote: 'They said it outright.',
        supersedes: false,
      },
    ]);
  });

  it.each([
    ['prose instead of JSON', 'I found two readings for you.'],
    ['a JSON scalar', '"readings"'],
    ['null', 'null'],
    ['an object with no readings key', '{"found":[]}'],
    ['readings that is not a list', '{"readings":{"slotSlug":"x"}}'],
  ])('drops the whole response when it is %s', async (_label, raw) => {
    const parse = await parser();

    // `null`, not `[]` — the two mean different things to the runner. An empty list is an answer and
    // ends the call; null is "that was not a response" and buys the one retry.
    expect(parse(raw)).toBeNull();
  });

  it('takes an empty list as an answer rather than a failure', async () => {
    const parse = await parser();

    expect(parse('{"readings":[]}')).toEqual([]);
  });

  it.each([
    ['the slug is missing', row({ slotSlug: undefined })],
    ['the slug is empty', row({ slotSlug: '' })],
    ['the slug is not a string', row({ slotSlug: 42 })],
    ['the value is only whitespace', row({ value: '   ' })],
    ['the value is not a string', row({ value: { hours: 25 } })],
    ['the source type is outside the vocabulary', row({ sourceType: 'guessed' })],
    ['the source type is missing', row({ sourceType: undefined })],
    ['the row is null', null],
    ['the row is a bare string', 'reclaim_setup_why_now'],
  ])('drops just the row when %s, and keeps the good one beside it', async (_label, bad) => {
    const parse = await parser();

    const out = parse(JSON.stringify({ readings: [bad, row()] }));

    // The good reading survives its neighbour. One unusable row in a batch used to cost the whole
    // batch, which is the failure this parser was written after.
    expect(out).toHaveLength(1);
    expect(out?.[0]).toMatchObject({ slotSlug: 'reclaim_setup_why_now' });
  });

  it('fills in a confidence the model left out rather than dropping the reading', async () => {
    const parse = await parser();

    expect(
      parse(JSON.stringify({ readings: [row({ confidence: undefined })] }))?.[0]
    ).toMatchObject({ confidence: 6 });
  });

  it.each([
    ['above the scale', 40, 10],
    ['below it', 0, 1],
    ['negative', -3, 1],
    ['fractional', 7.6, 8],
  ])('brings a confidence that is %s back onto it', async (_label, given, expected) => {
    const parse = await parser();

    expect(parse(JSON.stringify({ readings: [row({ confidence: given })] }))?.[0]).toMatchObject({
      confidence: expected,
    });
  });

  it('trims the value and ignores a verbatim that is blank or not a string', async () => {
    const parse = await parser();

    const [trimmed] = parse(
      JSON.stringify({ readings: [row({ value: '  spaced out  ', verbatim: '   ' })] })
    ) as Record<string, unknown>[];

    expect(trimmed.value).toBe('spaced out');
    // Absent rather than empty: `presentAnswer` falls back to the reading when there is no quote, and
    // an empty string would pass as one and blank the line it is quoted into.
    expect(trimmed).not.toHaveProperty('verbatim');
  });

  it('caps a runaway verbatim rather than storing the whole transcript in it', async () => {
    const parse = await parser();

    const [capped] = parse(
      JSON.stringify({ readings: [row({ verbatim: 'x'.repeat(5000) })] })
    ) as Record<string, string>[];

    expect(capped.verbatim).toHaveLength(2000);
  });

  it('supplies its own reasoning note when the model gives none', async () => {
    const parse = await parser();

    const [noted] = parse(JSON.stringify({ readings: [row({ reasoningNote: '' })] })) as Record<
      string,
      string
    >[];

    expect(noted.reasoningNote).toBe('Read from the exchange by the capture sweep.');
  });

  it('treats supersedes as claimed only when it is exactly true', async () => {
    const parse = await parser();

    const out = parse(
      JSON.stringify({
        readings: [row({ supersedes: true }), row({ supersedes: 'yes' }), row({ supersedes: 1 })],
      })
    ) as Record<string, boolean>[];

    // A truthy string is a model being loose with a flag that decides whether a leader's stored
    // sentence gets overwritten. Only the boolean counts.
    expect(out.map((r) => r.supersedes)).toEqual([true, false, false]);
  });

  it('reads no more than ten readings out of one response', async () => {
    const parse = await parser();

    const many = Array.from({ length: 25 }, (_, i) => row({ value: `Reading ${i}` }));

    expect(parse(JSON.stringify({ readings: many }))).toHaveLength(10);
  });
});

describe('the sweep survives the edges it depends on', () => {
  it('runs without bucket labels when that read fails', async () => {
    const { readBucketLabels } = await import('@/lib/app/programme/buckets/labels');
    vi.mocked(readBucketLabels).mockRejectedValueOnce(new Error('labels unavailable'));
    extracts({ slotSlug: 'reclaim_setup_why_now', value: 'The board asked for a plan.' });

    const result = await runCaptureSweep(input);

    // The labels only dress the brief's wording. Losing them must not cost the leader the capture.
    expect(result.recorded).toEqual(['reclaim_setup_why_now']);
  });

  it('does not reach for a provider when the coach agent is not seeded', async () => {
    findUnique.mockResolvedValue(null);

    const result = await runCaptureSweep(input);

    expect(result.skipped).toBe('provider_unavailable');
    expect(runStructuredCompletion).not.toHaveBeenCalled();
  });
});
