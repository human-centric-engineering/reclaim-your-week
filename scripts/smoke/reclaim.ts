/* eslint-disable @typescript-eslint/require-await -- CLI smoke script; fake provider methods need the async signature to match the LlmProvider interface */
/**
 * Smoke: the reclaim-audit module surface, end to end against a real Postgres (F3 t-1).
 *
 * The F3 spike proof — `boot → register → sync → publish → resolve surface → stream`, the first time
 * it runs for a real leaf. Assumes the app-reclaim seeds have run (`db:reset` / `db:seed`): they
 * materialise the framework rows, activate the module, and bind the public coach agent. This script
 * resolves the module surface exactly as the framework chat route does and streams one turn through
 * the real `streamChat` handler.
 *
 * The LLM is stubbed with a fake provider (as `smoke:chat` does), so this proves the *wiring* —
 * surface resolution, the primary binding, conversation creation, persistence — without a real model
 * call or an API key. The coach agent seeds with dynamic model/provider resolution; this script
 * repoints it at the fake provider for the duration of the turn and restores it afterwards.
 *
 * Run:  npm run smoke:reclaim
 *
 * t-1 asserts: the surface resolves (module active + agent public + bound primary), one turn streams
 * non-empty content, and a conversation is created. The three silent-failure assertions (agent
 * visibility, fresh conversation on a second run, no special_category slot) are F3 t-2.
 */

import { prisma } from '@/lib/db/client';
import { initFramework, syncFramework } from '@/lib/framework';
import { initLeafApp } from '@/lib/app/leaf-bootstrap';
import { streamChat } from '@/lib/orchestration/chat';
import { registerProviderInstance } from '@/lib/orchestration/llm/provider-manager';
import type { LlmProvider } from '@/lib/orchestration/llm/provider';
import type {
  LlmMessage,
  LlmOptions,
  LlmResponse,
  ModelInfo,
  StreamChunk,
} from '@/lib/orchestration/llm/types';
import {
  resolveModuleSurface,
  MODULE_SURFACE_CONTEXT_TYPE,
} from '@/lib/framework/guidance/surface';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';

const SMOKE_PROVIDER_NAME = 'smoke-reclaim-provider';
const SMOKE_MODEL = 'fake-model-1';

/** A fake provider that yields one scripted plain-text turn — no real model call. */
function makeFakeProvider(script: StreamChunk[]): LlmProvider {
  return {
    name: SMOKE_PROVIDER_NAME,
    isLocal: false,
    async chat(_messages: LlmMessage[], _options: LlmOptions): Promise<LlmResponse> {
      throw new Error('smoke fake provider does not implement chat()');
    },
    async *chatStream(_messages: LlmMessage[], _options: LlmOptions): AsyncIterable<StreamChunk> {
      for (const chunk of script) yield chunk;
    },
    async embed(_text: string): Promise<number[]> {
      throw new Error('smoke fake provider does not implement embed()');
    },
    async listModels(): Promise<ModelInfo[]> {
      return [];
    },
    async testConnection() {
      return { ok: true, models: [] };
    },
  };
}

async function runTurn(
  args: Parameters<typeof streamChat>[0]
): Promise<{ content: string; conversationId: string | null; types: string[] }> {
  const types: string[] = [];
  let content = '';
  let conversationId: string | null = null;
  for await (const event of streamChat(args)) {
    types.push(event.type);
    if (event.type === 'start') conversationId = event.conversationId;
    if (event.type === 'content') content += event.delta;
  }
  return { content, conversationId, types };
}

/** Throw rather than `process.exit()` so an assertion failure inside the `try` still runs the
 *  `finally` (restore the agent's provider/model, clean up the run) before the top-level handler
 *  exits. `process.exit()` terminates synchronously and skips pending `finally` blocks — which
 *  would leave the seeded coach agent repointed at the in-memory fake provider. */
function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  // ── 0. Boot the framework, as a running app would ─────────────────────
  // This is a separate process from the seed, so the in-memory registrations (the `module`
  // context contributor, capability handlers) do not carry over. Without this, buildContext
  // warns "unknown contextType: module" and the coach gets no module context. Running the boot
  // sequence here mirrors a live app and keeps the seed rows in sync (idempotent).
  initFramework();
  await initLeafApp();
  await syncFramework();

  // ── 1. A real user to own the conversation (createdBy FK) ─────────────
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!user) fail('No user rows — run db:seed first.');
  console.log(`[1] user ${user.id} (${user.email})`);

  // ── 2. Resolve the module surface — the whole vertical slice in one call ──
  // A non-null surface proves: module active, coach agent public, bound primary. Any of those
  // missing yields null (→ the route's 404), so this is the core t-1 assertion.
  const surface = await resolveModuleSurface(user.id, RECLAIM_MODULE_SLUG);
  if (surface === null) {
    fail(
      `resolveModuleSurface returned null for "${RECLAIM_MODULE_SLUG}" — module not active, or coach agent not public/bound primary. Did the app-reclaim seeds run?`
    );
  }
  console.log(
    `[2] surface resolved: agent "${surface.agentSlug}", resume=${surface.conversationId ?? 'new'}`
  );

  // ── 3. Repoint the coach agent at the fake provider for this turn ─────
  const original = await prisma.aiAgent.findUnique({
    where: { id: surface.agentId },
    select: { provider: true, model: true },
  });
  if (!original) fail(`agent ${surface.agentId} vanished between resolve and stream`);
  await prisma.aiAgent.update({
    where: { id: surface.agentId },
    data: { provider: SMOKE_PROVIDER_NAME, model: SMOKE_MODEL },
  });
  registerProviderInstance(
    SMOKE_PROVIDER_NAME,
    makeFakeProvider([
      { type: 'text', content: 'What stands out to you ' },
      { type: 'text', content: 'about how your week is spent right now?' },
      { type: 'done', usage: { inputTokens: 40, outputTokens: 12 }, finishReason: 'stop' },
    ])
  );

  let conversationId: string | null = null;
  try {
    // ── 4. Stream one turn, exactly as the framework module-chat route does ──
    const result = await runTurn({
      message: 'I am ready to start the audit.',
      agentSlug: surface.agentSlug,
      userId: user.id,
      conversationId: surface.conversationId,
      contextType: MODULE_SURFACE_CONTEXT_TYPE,
      contextId: RECLAIM_MODULE_SLUG,
      scope: surface.scope,
    });
    conversationId = result.conversationId;
    console.log(`[3] event sequence: ${result.types.join(' → ')}`);
    console.log(`[4] streamed content: "${result.content}"`);

    // ── 5. Assertions ────────────────────────────────────────────────────
    if (!conversationId) fail('no conversation created (missing start event)');
    if (result.content.trim().length === 0) fail('streamed an empty turn');

    const messages = await prisma.aiMessage.count({ where: { conversationId } });
    if (messages < 2) fail(`expected the user + assistant messages persisted, found ${messages}`);
    console.log(`[5] ${messages} messages persisted for conversation ${conversationId}`);
  } finally {
    // ── 6. Restore + clean up (scoped to this run) ───────────────────────
    await prisma.aiAgent.update({
      where: { id: surface.agentId },
      data: { provider: original.provider, model: original.model },
    });
    // Let the fire-and-forget cost log settle before deleting its FK target.
    await new Promise((r) => setTimeout(r, 250));
    if (conversationId) {
      await prisma.aiMessage.deleteMany({ where: { conversationId } });
      await prisma.aiCostLog.deleteMany({ where: { agentId: surface.agentId } });
      await prisma.aiConversation.deleteMany({ where: { id: conversationId } });
    }
    await prisma.$disconnect();
  }

  console.log('\n✓ smoke:reclaim passed — surface resolves and streams end to end');
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
