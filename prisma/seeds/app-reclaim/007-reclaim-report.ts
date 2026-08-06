/**
 * Seed the report agent — the row behind the binding, and nothing else.
 *
 * **What this row is for, and what it is not.** The report agent's prose lives in
 * `lib/app/programme/report/agent.ts` and is composed per call by `reportSystemPrompt()`; nothing
 * reads the persona, instructions, guardrails or brand voice off this row at runtime. The row exists
 * for three things: the provider/model binding, a cost identity that is not the coach's, and
 * visibility in the admin console so an operator can see the agent exists and repoint it.
 *
 * **The create-only / re-author split mirrors 002, 003 and the analyst seed it replaces, and getting
 * it backwards breaks quietly.**
 *
 *  - `provider` and `model` are written on **create only**, so an operator who repoints the agent in
 *    admin still has that binding after the next deploy.
 *  - the four prose fields are **re-authored from code** on every run whose `hashInputs` changed, so
 *    that shipping a voice fix actually changes the row the admin screens display.
 *
 * Backwards means either the model silently reverts on every deploy, or a voice fix ships as a no-op.
 *
 * **No capability grants and no module binding, deliberately.** It reads a brief and returns JSON; it
 * has no tools, no server-issued scope, and no way to write a slot (I6). `visibility` stays
 * `internal` for the same reason as the coach's twin: a `public` agent with no grants is still a chat
 * surface a leader could open, and this one has nothing to say in a conversation.
 *
 * ## Retiring the analyst
 *
 * `reclaim-analyst` wrote the two lists this agent's report now contains, from a brief that could not
 * see anything the leader said. Its code is gone. Its **row** is deactivated rather than deleted:
 * `AiAgent` rows carry cost history and audit entries that point at them, and deleting one to tidy up
 * is how a month of spend stops adding up. Deactivating is idempotent and says plainly, on the admin
 * screen, that this agent is not in service.
 */

import type { SeedUnit } from '@/prisma/runner';
import { serviceAccountWhere } from '@/lib/auth/account';
import { reclaimReportAgent } from '@/lib/app/programme/report/agent';

/** The agent this one replaces. Named here rather than imported: its module no longer exists. */
const RETIRED_ANALYST_SLUG = 'reclaim-analyst';

const unit: SeedUnit = {
  name: 'app-reclaim/007-reclaim-report',
  // Relative to this file: the authored definition. Editing the prose re-runs the unit.
  hashInputs: ['../../../lib/app/programme/report/agent.ts'],
  async run({ prisma, logger }) {
    logger.info('📄 Seeding the reclaim report agent...');

    const serviceAccount = await prisma.user.findFirst({
      where: serviceAccountWhere,
      select: { id: true },
    });
    if (!serviceAccount) {
      throw new Error('No service account — core seeds must run before app-reclaim.');
    }

    const runtimeNote =
      'The report agent runs through runStructuredCompletion, not the chat dispatcher. Its system prompt is composed in lib/app/programme/report/agent.ts at call time; these fields are the authored source of that text and are re-applied from code on every deploy that changes it. Editing them here has no effect on what the report says.';

    await prisma.aiAgent.upsert({
      where: { slug: reclaimReportAgent.slug },
      // Re-author the prose and the descriptive fields; leave the binding, and anything an operator
      // may have tuned (temperature, budgets, isActive), exactly as found.
      update: {
        name: reclaimReportAgent.name,
        description: reclaimReportAgent.description,
        persona: reclaimReportAgent.persona,
        systemInstructions: reclaimReportAgent.systemInstructions,
        guardrails: reclaimReportAgent.guardrails,
        brandVoiceInstructions: reclaimReportAgent.brandVoiceInstructions,
        isSystem: true,
        runtimePromptManaged: true,
        runtimePromptNote: runtimeNote,
      },
      create: {
        slug: reclaimReportAgent.slug,
        name: reclaimReportAgent.name,
        description: reclaimReportAgent.description,
        persona: reclaimReportAgent.persona,
        systemInstructions: reclaimReportAgent.systemInstructions,
        guardrails: reclaimReportAgent.guardrails,
        brandVoiceInstructions: reclaimReportAgent.brandVoiceInstructions,
        // Not `public`: this agent must never resolve as a module surface a leader can chat to.
        visibility: 'internal',
        provider: reclaimReportAgent.provider,
        model: reclaimReportAgent.model,
        isActive: true,
        isSystem: true,
        runtimePromptManaged: true,
        runtimePromptNote: runtimeNote,
        createdBy: serviceAccount.id,
      },
    });

    // Deactivate rather than delete, and only if it is there: a fresh database has never had one.
    const retired = await prisma.aiAgent.updateMany({
      where: { slug: RETIRED_ANALYST_SLUG, isActive: true },
      data: {
        isActive: false,
        description:
          'Retired. Replaced by the report writer, which reads the whole audit rather than the figures alone. Kept inactive so its cost history and audit entries still resolve.',
      },
    });

    logger.info(`   ✓ ${reclaimReportAgent.slug} (no capabilities, no module binding)`);
    if (retired.count > 0) logger.info(`   ✓ ${RETIRED_ANALYST_SLUG} deactivated`);
  },
};

export default unit;
