/**
 * I11 — the report is supplied Rashmir's content, and this is the guard that says so out loud.
 *
 * ## The failure this exists for is a claim, not a bug
 *
 * `report/agent.ts` said, in its own header and in its own system instructions, that "the governing
 * frame, the nine areas and the footnote are not restated here: they reach the call through
 * `Module.config` at runtime (I11)". Nothing supplied them. `runReport` composed two messages, the
 * authored prose and the brief, and neither carried a word of her content — so the agent writing the
 * document a leader keeps could see twenty two hours against delivery and had never been told the
 * ceiling is ten to fifteen per cent, still less that above it "is often a signal of under-delegation
 * or difficulty letting go of an earlier identity as a practitioner".
 *
 * That is the same defect the coach carried for ten features (`coach/phase-context.ts`), with the same
 * cause and the same shape: **I11 forbids restating her content in authored prose, and forbidding is
 * not supplying.** A file that says it is given something is not a file that is given it, and nothing
 * fails when the supply is absent. The report simply comes out shallow, which reads like a model
 * being disappointing rather than like a defect.
 *
 * So this asserts the supply at the point it is consumed: the message list that actually reaches the
 * provider. Asserted over the composed messages rather than by grepping for an import, because an
 * import that is read and then not sent would pass a grep and fail a leader.
 *
 * Wired into `leaf:checks` via the `tests/unit/invariants` directory glob.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { runStructuredMock, getProviderMock, resolveMock, findAgentMock, findModuleMock } =
  vi.hoisted(() => ({
    runStructuredMock: vi.fn(),
    getProviderMock: vi.fn(),
    resolveMock: vi.fn(),
    findAgentMock: vi.fn(),
    findModuleMock: vi.fn(),
  }));

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/orchestration/llm/structured-completion', () => ({
  runStructuredCompletion: runStructuredMock,
}));
vi.mock('@/lib/orchestration/llm/provider-manager', () => ({ getProvider: getProviderMock }));
vi.mock('@/lib/orchestration/llm/agent-resolver', () => ({
  resolveAgentProviderAndModel: resolveMock,
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiAgent: { findUnique: findAgentMock },
    module: { findUnique: findModuleMock },
  },
}));

import { runReport } from '@/lib/app/programme/report/reading';
import { buildReportBrief } from '@/lib/app/programme/report/brief';
import {
  RECLAIM_GOVERNING_FRAME,
  RECLAIM_DEEP_WORK_NOTE,
  RECLAIM_BUCKETS,
} from '@/lib/app/programme/content';
import type { Answers } from '@/lib/app/programme/chart/series';
import type { LlmMessage } from '@/lib/orchestration/llm/types';

const n = (v: number) => ({ value: String(v), valueJson: v });

/** An audit with enough in it to be worth a call, which is what `usable` gates on. */
const answers: Answers = {
  reclaim_current_hours__deep_work: n(4),
  reclaim_current_hours__delivery_operations: n(22),
  reclaim_ideal_hours__deep_work: n(10),
  reclaim_ideal_hours__delivery_operations: n(8),
};

/** The system message as it reaches the provider, which is the only thing worth asserting on. */
async function systemMessage(): Promise<string> {
  await runReport(buildReportBrief(answers));
  const call = runStructuredMock.mock.calls[0]?.[0] as { messages: LlmMessage[] } | undefined;
  const system = call?.messages.find((m) => m.role === 'system');
  return typeof system?.content === 'string' ? system.content : '';
}

beforeEach(() => {
  vi.clearAllMocks();
  findAgentMock.mockResolvedValue({
    id: 'agent-1',
    provider: 'openai',
    model: 'gpt-4o',
    fallbackProviders: [],
  });
  // A module row that has never been edited, so the config falls back to the schema defaults. That
  // is the shape most installations are in, and the one where an absent supply is hardest to notice.
  findModuleMock.mockResolvedValue({ config: {} });
  resolveMock.mockResolvedValue({ providerSlug: 'openai', model: 'gpt-4o' });
  getProviderMock.mockResolvedValue({});
  runStructuredMock.mockResolvedValue({
    value: null,
    costUsd: 0,
    tokenUsage: { input: 0, output: 0 },
  });
});

describe('the report is given the content it says it is given', () => {
  it('sends the governing frame, which is the authority on how to read every figure', async () => {
    // Verbatim, not paraphrased: I11's whole point is that a summarised frame is a different frame.
    expect(await systemMessage()).toContain(RECLAIM_GOVERNING_FRAME);
  });

  it('sends every area with its benchmark and its diagnostic prose', async () => {
    const system = await systemMessage();

    for (const bucket of RECLAIM_BUCKETS) {
      expect(system, `${bucket.slug} is missing its title`).toContain(bucket.title);
      expect(system, `${bucket.slug} is missing its benchmark`).toContain(bucket.benchmark.note);
      // **The descriptions are the part that matters.** Sending titles and ranges alone would pass a
      // looser version of this test and would leave out the only thing in the config that says what
      // time in an area tends to mean, which is what turns a chart into a report.
      expect(system, `${bucket.slug} is missing its description`).toContain(bucket.description);
    }
  });

  it('sends the deep-work note and the total-hours bands', async () => {
    const system = await systemMessage();

    expect(system).toContain(RECLAIM_DEEP_WORK_NOTE);
    // The bands are what let the report say anything at all about the size of a week rather than
    // only its shape, and a model without them invents a threshold of its own.
    expect(system).toContain('55 to more hours');
  });

  it('reads the content from the module row rather than from the constants', async () => {
    findModuleMock.mockResolvedValue({
      config: { governingFrame: 'An operator has reworded the frame for this deployment.' },
    });
    const system = await systemMessage();

    // The third hop is Rashmir's own (I11): she edits her words through the admin content screen and
    // the report must read what she currently has, not what shipped. A supply that read the imported
    // constant would pass every other assertion in this file and still show a leader stale content.
    expect(system).toContain('An operator has reworded the frame for this deployment.');
    expect(system).not.toContain(RECLAIM_GOVERNING_FRAME);
  });

  it('tells the model the framework is not for quoting at the leader', async () => {
    // The content is confidential and the report is a document about one person's week. The coach is
    // told the same thing about the same content (`coach/phase-context.ts`), and a report that
    // explained the method back would be the tool talking about itself.
    expect(await systemMessage()).toContain('never quote it at the leader');
  });

  it('spends nothing at all on an audit with nothing in it', async () => {
    await runReport(buildReportBrief({}));
    expect(runStructuredMock).not.toHaveBeenCalled();
    // The config read is on the far side of the `usable` gate, so an empty audit costs no query
    // either.
    expect(findModuleMock).not.toHaveBeenCalled();
  });
});
