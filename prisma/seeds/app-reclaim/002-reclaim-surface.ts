/**
 * Seed the reclaim-audit module surface (F3 t-1).
 *
 * Stands up everything `resolveModuleSurface` and `smoke:reclaim` need: the module row **active**,
 * the coach agent **public**, bound **primary** into the module's `coach` seat, with its read-only
 * capability grants and the profile-locked `fill_slot` exposure (I6).
 *
 * **Why this seed replicates the boot chain.** The `Module` row, its slot definitions, and the
 * framework capability rows (`get_state`, `get_journey_state`, `get_next_steps`, `fill_slot`) are
 * materialised by `initFramework()` → `initLeafApp()` → `syncFramework()` — which run at *app boot*
 * (`lib/app/bootstrap.ts`). A standalone `db:seed` (what `db:reset` and CI run) never boots the app,
 * so without this nothing creates those rows and there is nothing to activate, link, or bind. Running
 * the same three-step sequence here is what makes the leaf's seeds self-sufficient. The sequence is
 * fixed and idempotent (`lib/framework/index.ts`): `initFramework` registers the built-in capability
 * descriptors in-memory, `initLeafApp` registers the `reclaim-audit` module, `syncFramework`
 * reconciles both into rows. (A F3 spike finding — see planning-retro / daybreak-asks, t-3.)
 */

import { Prisma } from '@prisma/client';
import type { SeedUnit } from '@/prisma/runner';
import { serviceAccountWhere } from '@/lib/auth/account';
import { initFramework, syncFramework } from '@/lib/framework';
import { initLeafApp } from '@/lib/app/leaf-bootstrap';
import { MODULE_STATUS } from '@/lib/framework/modules/status';
import { bindAgent, listModuleBindings } from '@/lib/framework/modules';
import { RECLAIM_MODULE_SLUG, RECLAIM_COACH_ROLE } from '@/lib/app/programme/module';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';

const unit: SeedUnit = {
  name: 'app-reclaim/002-reclaim-surface',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding reclaim-audit surface (module, coach agent, binding)...');

    // 1. Materialise the framework rows — the boot chain a standalone seed would otherwise skip.
    initFramework();
    await initLeafApp();
    await syncFramework();

    // 2. Activate the module. It syncs as `draft`; only `active` is ever live (isModuleLive).
    await prisma.module.update({
      where: { slug: RECLAIM_MODULE_SLUG },
      data: { status: MODULE_STATUS.active },
    });

    // 3. The service account authors the agent and is the actor of record for the bind.
    const serviceAccount = await prisma.user.findFirst({
      where: serviceAccountWhere,
      select: { id: true },
    });
    if (!serviceAccount) {
      throw new Error('No service account found — ensure 001-system-owner runs first.');
    }

    // 4. Seed the coach agent. `public` is required by `resolveModuleSurface`: the module surface is
    //    end-user-facing, and a non-public agent yields no surface (→ 404). Re-seed only re-marks
    //    isSystem so admin edits to the prose, and to the binding below, survive.
    //
    //    **The binding is pinned rather than left empty.** This used to author `model: ''` /
    //    `provider: ''` for dynamic resolution, which on an OpenAI install fills in `gpt-4o-mini` —
    //    and a mini model does not reliably make the silent, unprompted, multi-slot tool calls this
    //    coach's entire capture path is built on. Seen live: it narrated "I'll record that…" and
    //    called nothing, so the leader's panel stayed empty. See `RECLAIM_COACH_MODEL` in
    //    `lib/app/programme/agent.ts` for the full reasoning and for what a replacement must satisfy.
    const agent = await prisma.aiAgent.upsert({
      where: { slug: reclaimCoachAgent.slug },
      update: { isSystem: true },
      create: {
        slug: reclaimCoachAgent.slug,
        name: reclaimCoachAgent.name,
        description: reclaimCoachAgent.description,
        persona: reclaimCoachAgent.persona,
        systemInstructions: reclaimCoachAgent.systemInstructions,
        guardrails: reclaimCoachAgent.guardrails,
        brandVoiceInstructions: reclaimCoachAgent.brandVoiceInstructions,
        visibility: 'public',
        model: reclaimCoachAgent.model,
        provider: reclaimCoachAgent.provider,
        isActive: true,
        isSystem: true,
        createdBy: serviceAccount.id,
      },
    });

    // 5. Link the capability grants. Unlike the optional knowledge grants elsewhere, a missing
    //    capability row is a hard error: the read-only set + the profile-scoped `fill_slot` exposure
    //    are the I6 lockdown, and a silently-skipped grant would widen (by omission) what the agent
    //    can reach. `customConfig` carries the per-agent exposure allowlist for `fill_slot`.
    for (const grant of reclaimCoachAgent.capabilities) {
      const capability = await prisma.aiCapability.findUnique({
        where: { slug: grant.slug },
        select: { id: true },
      });
      if (!capability) {
        throw new Error(
          `Capability "${grant.slug}" has no ai_capability row — syncFramework did not project it.`
        );
      }
      const customConfig: Prisma.InputJsonValue | typeof Prisma.JsonNull =
        grant.customConfig ?? Prisma.JsonNull;
      await prisma.aiAgentCapability.upsert({
        where: { agentId_capabilityId: { agentId: agent.id, capabilityId: capability.id } },
        update: { isEnabled: true, customConfig },
        create: {
          agentId: agent.id,
          capabilityId: capability.id,
          isEnabled: true,
          customConfig,
        },
      });
    }

    // 6. Bind the agent into the coach seat, primary. `bindAgent` treats a duplicate
    //    (module, agent, role) as an error, so skip when the binding already exists (re-seed).
    const bindings = await listModuleBindings(RECLAIM_MODULE_SLUG);
    const alreadyBound = bindings.some(
      (b) => b.agent?.slug === reclaimCoachAgent.slug && b.role === RECLAIM_COACH_ROLE
    );
    if (!alreadyBound) {
      await bindAgent({
        moduleSlug: RECLAIM_MODULE_SLUG,
        agentId: agent.id,
        role: RECLAIM_COACH_ROLE,
        isPrimary: true,
        userId: serviceAccount.id,
      });
    }

    logger.info(
      `✅ reclaim-audit surface ready: module active, "${reclaimCoachAgent.slug}" public + bound primary (${reclaimCoachAgent.capabilities.length} capabilities)`
    );
  },
};

export default unit;
