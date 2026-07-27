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
 * narrower tool is redundant. Retiring it removes the last grant on this agent whose write target a
 * model could influence at all — and that is only true once the row says so explicitly.
 *
 * **Disables rather than deletes, and that is the whole point of the unit.** The first cut deleted the
 * row, on the reasoning that an absent grant matches absent code while a disabled one invites a later
 * "why is this off?" and a helpful re-enable. That reasoning rested on a false premise about what
 * absence means here: the dispatcher **synthesizes a default-allow binding for a missing pivot row**
 * (`dispatcher.ts` — "No explicit row → synthesize a default-allow binding"), and `loadExposureConfig`
 * returns `PERMISSIVE` when there is no binding. So deleting the row does not revoke the capability.
 * It removes the *restriction* on it.
 *
 * For `fill_slot` specifically that inverts the intent. It was pinned to `reclaim_profile` because it
 * selects its run from `contextKey`, a model-supplied argument (I6). Deleted, it would be unpinned —
 * and a resumed conversation's own history may contain earlier `fill_slot` calls from before this
 * change, which is exactly the sort of thing a model imitates. With no restriction it could reach
 * `reclaim_reflection_*` (opening its own phase gate) or `reclaim_share_*` (manufacturing consent),
 * the two things I6 refuses on principle.
 *
 * `isEnabled: false` is checked by the dispatcher **before** any exposure logic and refuses outright,
 * so it is the state that actually means revoked. Found by `/security-review` on this branch.
 *
 * Only this one agent: other agents' grants are untouched.
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

    // Capabilities this agent once held and must never hold again. Named explicitly rather than
    // inferred, because the state that needs fixing is an **absent** row, and absence carries no
    // record of what used to be there. An earlier version of this unit deleted `fill_slot` instead of
    // disabling it, so any database seeded in that window is sitting in the permissive-fallback state
    // this unit exists to prevent; ensuring the row is what repairs it.
    const RETIRED = ['fill_slot'];

    for (const slug of RETIRED) {
      const capability = await prisma.aiCapability.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (capability === null) continue; // not installed here, so nothing can dispatch it
      const existing = await prisma.aiAgentCapability.findFirst({
        where: { agentId: agent.id, capabilityId: capability.id },
        select: { id: true, isEnabled: true },
      });
      if (existing === null) {
        await prisma.aiAgentCapability.create({
          data: { agentId: agent.id, capabilityId: capability.id, isEnabled: false },
        });
        logger.info(
          `✓  ${slug}: disabled binding restored (a missing row is permissive, not denied)`
        );
      } else if (existing.isEnabled) {
        await prisma.aiAgentCapability.update({
          where: { id: existing.id },
          data: { isEnabled: false },
        });
        logger.info(`✓  ${slug}: revoked`);
      }
    }

    const authored = reclaimCoachAgent.capabilities.map((c) => c.slug);
    const held = await prisma.aiAgentCapability.findMany({
      where: { agentId: agent.id },
      select: { id: true, isEnabled: true, capability: { select: { slug: true } } },
    });

    const stale = held.filter(
      (grant) => !authored.includes(grant.capability.slug) && grant.isEnabled
    );
    if (stale.length === 0) {
      logger.info('✓  grants already match the authored list');
      return;
    }

    await prisma.aiAgentCapability.updateMany({
      where: { id: { in: stale.map((g) => g.id) } },
      data: { isEnabled: false },
    });
    logger.info(
      `✓  revoked ${stale.length} grant(s) no longer authored: ${stale
        .map((g) => g.capability.slug)
        .join(', ')}`
    );
  },
};

export default unit;
