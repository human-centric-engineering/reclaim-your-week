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
 * Asserts (t-1 + t-2): the surface resolves (module active + agent public + bound primary) and one
 * turn streams non-empty content; plus the three silent-failure traps that each fail with no
 * diagnostic if unguarded — the coach agent is `public` (a non-public agent 404s the surface), no
 * `reclaim_*` slot is `special_category` (I5), and a completed run yields a fresh conversation on the
 * next run while an active one resumes (I15).
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
  type ModuleSurface,
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

/** Stream one turn against a resolved surface, exactly as the framework module-chat route does. */
async function streamTurn(
  userId: string,
  surface: ModuleSurface,
  message: string
): Promise<{ content: string; conversationId: string | null; types: string[] }> {
  return runTurn({
    message,
    agentSlug: surface.agentSlug,
    userId,
    conversationId: surface.conversationId,
    contextType: MODULE_SURFACE_CONTEXT_TYPE,
    contextId: RECLAIM_MODULE_SLUG,
    scope: surface.scope,
  });
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
  // missing yields null (→ the route's 404).
  const surface = await resolveModuleSurface(user.id, RECLAIM_MODULE_SLUG);
  if (surface === null) {
    fail(
      `resolveModuleSurface returned null for "${RECLAIM_MODULE_SLUG}" — module not active, or coach agent not public/bound primary. Did the app-reclaim seeds run?`
    );
  }
  console.log(`[2] surface resolved: agent "${surface.agentSlug}"`);

  // ── Trap A (t-2): the coach agent must be `public` ────────────────────
  // A non-public agent makes the surface 404 with no diagnostic. resolveModuleSurface already gated
  // on it (the null check above), but assert the row directly so a regression names this trap rather
  // than surfacing as a mysterious 404. `original` doubles as the provider/model restore source.
  const original = await prisma.aiAgent.findUnique({
    where: { id: surface.agentId },
    select: { visibility: true, provider: true, model: true },
  });
  if (!original) fail(`agent ${surface.agentId} vanished after resolve`);
  if (original.visibility !== 'public') {
    fail(
      `coach agent visibility is "${original.visibility}", expected "public" — the surface would 404`
    );
  }
  console.log('[A] agent visibility is public');

  // ── Trap B (t-2, I5): no reclaim_* slot is `special_category` ─────────
  // slotMaskingPolicy redacts special_category prose, which would destroy reclaim_setup_keeping_me_up
  // (the sentence F7 must quote back verbatim). Assert against the SYNCED definitions in Postgres,
  // complementing F2's in-memory slot-sensitivity.test.ts. The non-empty check keeps a slug typo from
  // making the assertion vacuously pass.
  const reclaimSlots = await prisma.slotDefinition.findMany({
    where: { slug: { startsWith: 'reclaim_' } },
    select: { slug: true, sensitivity: true },
  });
  if (reclaimSlots.length === 0) {
    fail('no reclaim_* slot definitions in Postgres — did syncFramework run?');
  }
  const special = reclaimSlots.filter((s) => s.sensitivity === 'special_category');
  if (special.length > 0) {
    fail(
      `I5: ${special.length} reclaim_* slot(s) are special_category: ${special.map((s) => s.slug).join(', ')}`
    );
  }
  console.log(`[B] ${reclaimSlots.length} reclaim_* slots synced, none special_category`);

  // ── 3. Repoint the coach agent at the fake provider (restored in finally) ──
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

  const createdConversations = new Set<string>();
  try {
    // ── 4. Run 1 — a fresh surface conversation streams one turn ──────────
    const run1 = await streamTurn(user.id, surface, 'I am ready to start the audit.');
    if (!run1.conversationId) fail('run 1 created no conversation (missing start event)');
    if (run1.content.trim().length === 0) fail('run 1 streamed an empty turn');
    createdConversations.add(run1.conversationId);
    console.log(
      `[3] run 1 streamed (${run1.types.join(' → ')}); conversation ${run1.conversationId}`
    );
    console.log(`[4] content: "${run1.content}"`);

    const messages = await prisma.aiMessage.count({
      where: { conversationId: run1.conversationId },
    });
    if (messages < 2) fail(`expected user + assistant messages persisted, found ${messages}`);

    // ── Trap C (t-2, I15): active conversation resumes; a completed one does not ──
    // resolveModuleSurface keys the resume on isActive:true. While run 1 is active, re-resolving must
    // return its conversationId. After completion (isActive:false — what F4's complete route will do)
    // re-resolving must issue a fresh one, so audit 2 never resumes audit 1's transcript.
    const resumeSurface = await resolveModuleSurface(user.id, RECLAIM_MODULE_SLUG);
    if (resumeSurface?.conversationId !== run1.conversationId) {
      fail(
        `I15 resume: expected the active conversation ${run1.conversationId} to resume, got ${resumeSurface?.conversationId ?? 'a fresh surface'}`
      );
    }
    console.log(`[C1] active conversation resumes (${resumeSurface.conversationId})`);

    await prisma.aiConversation.update({
      where: { id: run1.conversationId },
      data: { isActive: false },
    });

    const freshSurface = await resolveModuleSurface(user.id, RECLAIM_MODULE_SLUG);
    if (freshSurface === null) fail('surface vanished after completing run 1');
    if (freshSurface.conversationId !== undefined) {
      fail(
        `I15: expected a fresh surface after completion, but it resumed ${freshSurface.conversationId}`
      );
    }
    const run2 = await streamTurn(user.id, freshSurface, 'Starting a second audit.');
    if (!run2.conversationId) fail('run 2 created no conversation');
    createdConversations.add(run2.conversationId);
    if (run2.conversationId === run1.conversationId) {
      fail(`I15: the second run reused conversation ${run1.conversationId} after completion`);
    }
    console.log(
      `[C2] completed run yields a fresh conversation (${run2.conversationId} ≠ ${run1.conversationId})`
    );
  } finally {
    // ── 5. Restore + clean up (scoped to this run) ───────────────────────
    await prisma.aiAgent.update({
      where: { id: surface.agentId },
      data: { provider: original.provider, model: original.model },
    });
    // Let the fire-and-forget cost log settle before deleting its FK target.
    await new Promise((r) => setTimeout(r, 250));
    const ids = [...createdConversations];
    if (ids.length > 0) {
      await prisma.aiMessage.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.aiCostLog.deleteMany({ where: { agentId: surface.agentId } });
      await prisma.aiConversation.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  }

  console.log('\n✓ smoke:reclaim passed — surface + streaming + the three silent-failure traps');
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
