/**
 * Seed the analyst agent (F14 t-1) — the row behind the binding, and nothing else.
 *
 * **What this row is for, and what it is not.** The analyst's prose lives in
 * `lib/app/programme/analyst/agent.ts` and is composed per call by `analystSystemPrompt()`; nothing
 * reads the persona, instructions, guardrails or brand voice off this row at runtime. The row exists
 * for three things: the provider/model binding, a cost identity that is not the coach's, and
 * visibility in the admin console so an operator can see that a second agent exists and repoint it.
 *
 * **The create-only / re-author split mirrors 002 and 003, and getting it backwards breaks quietly.**
 *
 *  - `provider` and `model` are written on **create only**, so an operator who repoints the analyst
 *    in admin still has that binding after the next deploy (`agent.ts`'s reasoning for the coach).
 *  - the four prose fields are **re-authored from code** on every run whose `hashInputs` changed, so
 *    that shipping a voice fix actually changes the row the admin screens display. 003 exists
 *    precisely because seeding prose in the `create` half meant a shipped change to the authored
 *    voice changed nothing.
 *
 * Backwards means either the model silently reverts on every deploy, or a voice fix ships as a no-op.
 *
 * **No capability grants and no module binding, deliberately.** The analyst reads a brief and returns
 * JSON; it has no tools, no server-issued scope, and no way to write a slot (I6). `visibility` stays
 * `internal` for the same reason — a `public` agent with no grants is still a chat surface a leader
 * could open, and this one has nothing to say in a conversation.
 */

import type { SeedUnit } from '@/prisma/runner';
import { serviceAccountWhere } from '@/lib/auth/account';
import { reclaimAnalystAgent } from '@/lib/app/programme/analyst/agent';

const unit: SeedUnit = {
  name: 'app-reclaim/005-reclaim-analyst',
  // Relative to this file: the authored definition. Editing the prose re-runs the unit.
  hashInputs: ['../../../lib/app/programme/analyst/agent.ts'],
  async run({ prisma, logger }) {
    logger.info('🔎 Seeding the reclaim analyst agent...');

    const serviceAccount = await prisma.user.findFirst({
      where: serviceAccountWhere,
      select: { id: true },
    });
    if (!serviceAccount) {
      throw new Error('No service account — core seeds must run before app-reclaim.');
    }

    await prisma.aiAgent.upsert({
      where: { slug: reclaimAnalystAgent.slug },
      // Re-author the prose and the descriptive fields; leave the binding, and anything an operator
      // may have tuned (temperature, budgets, isActive), exactly as found.
      update: {
        name: reclaimAnalystAgent.name,
        description: reclaimAnalystAgent.description,
        persona: reclaimAnalystAgent.persona,
        systemInstructions: reclaimAnalystAgent.systemInstructions,
        guardrails: reclaimAnalystAgent.guardrails,
        brandVoiceInstructions: reclaimAnalystAgent.brandVoiceInstructions,
        isSystem: true,
        // Honest about what this agent is: the row's prompt fields are not what drives a call.
        // `runtimePromptManaged` is the platform's own flag for exactly this shape (an agent
        // dispatched for its binding, whose system prompt is assembled in application code), and
        // setting it is what stops an operator editing this row and wondering why nothing changed.
        runtimePromptManaged: true,
        runtimePromptNote:
          'The analyst runs through runStructuredCompletion, not the chat dispatcher. Its system prompt is composed in lib/app/programme/analyst/agent.ts at call time; these fields are the authored source of that text and are re-applied from code on every deploy that changes it. Editing them here has no effect on what the analyst says.',
      },
      create: {
        slug: reclaimAnalystAgent.slug,
        name: reclaimAnalystAgent.name,
        description: reclaimAnalystAgent.description,
        persona: reclaimAnalystAgent.persona,
        systemInstructions: reclaimAnalystAgent.systemInstructions,
        guardrails: reclaimAnalystAgent.guardrails,
        brandVoiceInstructions: reclaimAnalystAgent.brandVoiceInstructions,
        // Not `public`: this agent must never resolve as a module surface a leader can chat to.
        visibility: 'internal',
        provider: reclaimAnalystAgent.provider,
        model: reclaimAnalystAgent.model,
        isActive: true,
        isSystem: true,
        runtimePromptManaged: true,
        runtimePromptNote:
          'The analyst runs through runStructuredCompletion, not the chat dispatcher. Its system prompt is composed in lib/app/programme/analyst/agent.ts at call time.',
        createdBy: serviceAccount.id,
      },
    });

    logger.info(`   ✓ ${reclaimAnalystAgent.slug} (no capabilities, no module binding)`);
  },
};

export default unit;
