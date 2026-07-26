/**
 * Re-author the coach agent's four prose fields from code (the conversational surface).
 *
 * **Why this unit has to exist.** `002-reclaim-surface` seeds the agent's prose in the `create` half
 * of an upsert only, so that an operator's edits survive a re-seed. The consequence, which was
 * invisible while the coach was rendered nowhere, is that *shipping* a change to the authored voice
 * changed nothing: `agent.ts` is where I1 and I2 are enforced and where the instructions are written,
 * and an installed database kept whatever text it was first given. Making the phases conversational
 * turns that from a latent oddity into a contradiction, because the instructions the coach was seeded
 * with tell it that it does not record audit answers and that the application captures each one, while
 * the grant it now holds says otherwise. An agent told not to do the thing it is equipped for does the
 * thing badly.
 *
 * **So the authored voice in code is the source of truth for these four fields.** This unit re-applies
 * them, and its `hashInputs` fold `agent.ts` into the unit's content hash, so it re-runs exactly when
 * the authored content changes and skips when it has not. The trade is deliberate and worth stating
 * plainly: an admin edit to *this* agent's persona, instructions, guardrails or brand voice is
 * overwritten the next time the authored text changes. That is the right way round for this app.
 * Rashmir's editing surface is the content configuration (`Module.config`, the F10 content editor),
 * which is where her wording lives and is not touched here; the agent's prose is code that two
 * invariant guards read.
 *
 * Nothing else about the agent is touched: capability grants, visibility, the module binding and the
 * `isSystem` flag are 002's, and this unit deliberately does not restate them.
 */

import type { SeedUnit } from '@/prisma/runner';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';

const unit: SeedUnit = {
  name: 'app-reclaim/003-reclaim-coach-voice',
  // Relative to this file: the authored agent definition. Editing the prose re-runs the unit.
  hashInputs: ['../../../lib/app/programme/agent.ts'],
  async run({ prisma, logger }) {
    logger.info('🗣  Re-authoring the reclaim coach voice from code...');

    // `updateMany` rather than `update`: a database that has never run 002 (a fresh install seeding
    // in order will have, but a partial restore may not) has no row to update, and a seed unit that
    // throws over an absent optional row is a worse outcome than one that quietly matches nothing.
    const updated = await prisma.aiAgent.updateMany({
      where: { slug: reclaimCoachAgent.slug },
      data: {
        name: reclaimCoachAgent.name,
        description: reclaimCoachAgent.description,
        persona: reclaimCoachAgent.persona,
        systemInstructions: reclaimCoachAgent.systemInstructions,
        guardrails: reclaimCoachAgent.guardrails,
        brandVoiceInstructions: reclaimCoachAgent.brandVoiceInstructions,
      },
    });

    if (updated.count === 0) {
      logger.warn(
        `No agent row for "${reclaimCoachAgent.slug}" — 002-reclaim-surface creates it, so the voice will be current from its own create.`
      );
      return;
    }
    logger.info(`✓  coach voice re-authored (${updated.count} agent row)`);
  },
};

export default unit;
