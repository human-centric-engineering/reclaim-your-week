/**
 * Reconcile the coach agent's capability grants to the authored list.
 *
 * **Why this unit has to exist, and why it is the part that gets missed.** `002-reclaim-surface`
 * creates grants and updates the ones it names; neither it nor `003` ever *removes* one. So deleting
 * a capability from `agent.ts` changes the code, passes every test that reads the code, and leaves
 * the grant sitting in the database of every installed environment. The removal ships as a no-op and
 * the agent keeps the tool. That is the same class of failure `003`'s own header describes for prose,
 * one layer along.
 *
 * The concrete case this was written for is `fill_slot`. It was granted to the coach before
 * `record_answers` existed, locked to the run-independent `reclaim_profile` group because it selects
 * its run from `contextKey` — an argument the *model* supplies (I6). `record_answers` covers the same
 * group, takes its run from the server-issued dispatch scope, and is therefore strictly safer, so the
 * narrower tool is redundant. Removing it retires the last grant on this agent whose write target a
 * model could influence at all, and that is only true once the row is actually gone.
 *
 * **Deletes rather than deactivates**, and only for this one agent. A grant is a permission: an
 * inactive row that still exists invites a later "why is this off?" and a helpful re-enable, whereas
 * an absent row matches the code. Other agents are untouched — this reconciles `reclaim-coach`
 * against `reclaimCoachAgent.capabilities` and nothing else.
 *
 * `hashInputs` folds `agent.ts` in, so the unit re-runs exactly when the authored grant list changes.
 */

import type { SeedUnit } from '@/prisma/runner';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';

const unit: SeedUnit = {
  name: 'app-reclaim/004-reclaim-coach-grants',
  hashInputs: ['../../../lib/app/programme/agent.ts'],
  async run({ prisma, logger }) {
    logger.info('🔑  Reconciling the reclaim coach capability grants...');

    const agent = await prisma.aiAgent.findUnique({
      where: { slug: reclaimCoachAgent.slug },
      select: { id: true },
    });
    if (agent === null) {
      logger.warn(
        `No agent row for "${reclaimCoachAgent.slug}" — 002-reclaim-surface creates it with the authored grants, so there is nothing to reconcile.`
      );
      return;
    }

    const authored = reclaimCoachAgent.capabilities.map((c) => c.slug);
    const held = await prisma.aiAgentCapability.findMany({
      where: { agentId: agent.id },
      select: { id: true, capability: { select: { slug: true } } },
    });

    const stale = held.filter((grant) => !authored.includes(grant.capability.slug));
    if (stale.length === 0) {
      logger.info('✓  grants already match the authored list');
      return;
    }

    await prisma.aiAgentCapability.deleteMany({ where: { id: { in: stale.map((g) => g.id) } } });
    logger.info(
      `✓  revoked ${stale.length} grant(s) no longer authored: ${stale
        .map((g) => g.capability.slug)
        .join(', ')}`
    );
  },
};

export default unit;
