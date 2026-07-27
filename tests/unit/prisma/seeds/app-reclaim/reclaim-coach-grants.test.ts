import { describe, it, expect, vi } from 'vitest';

import grantsSeed from '@/prisma/seeds/app-reclaim/004-reclaim-coach-grants';
import { reclaimCoachAgent, RECLAIM_RECORD_ANSWERS_SLUG } from '@/lib/app/programme/agent';
import { COACH_WRITABLE_GROUPS } from '@/lib/app/programme/coach/writable-slots';
import type { SeedContext } from '@/prisma/runner';

/**
 * The unit that keeps the coach's grants equal to what `agent.ts` authors.
 *
 * Everything this seed does exists because the same failure kept happening in a different place: a
 * change to the authored rules ships, every test that reads the code passes, and the database of
 * every installed environment carries on with the old rules. It happened for prose (which is why
 * `003` exists), for a retired capability (which is why this unit exists), and — found on the branch
 * that widened the write allowlist to include reflections — for the **exposure config**, because
 * `002` writes it and has no `hashInputs`, so it re-runs only when its own file changes.
 *
 * So what is pinned here is the reconciliation itself, in all three directions: the authored grants
 * are written with their `customConfig`, a retired capability is left explicitly disabled rather than
 * deleted (a missing pivot row is *permissive*, not denied), and a grant nobody authors any more is
 * revoked. The load-bearing assertion is the exposure one — the others already had a home in the
 * unit's own header, and the exposure gap did not, which is exactly how it survived.
 */
function makeCtx(options: { agent?: { id: string } | null; held?: HeldGrant[] } = {}) {
  const { agent = { id: 'agent-1' }, held = [] } = options;

  const upsert = vi.fn().mockResolvedValue({});
  const create = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue(held);
  // Every capability the agent authors exists; the retired one does too, so the disable path runs.
  const capabilityFindUnique = vi
    .fn()
    .mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve({ id: `cap-${where.slug}` })
    );
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const ctx = {
    prisma: {
      aiAgent: { findUnique: vi.fn().mockResolvedValue(agent) },
      aiCapability: { findUnique: capabilityFindUnique },
      aiAgentCapability: { upsert, create, update, updateMany, findFirst, findMany },
    },
    logger,
  } as unknown as SeedContext;

  return { ctx, upsert, create, update, updateMany, logger };
}

interface HeldGrant {
  id: string;
  isEnabled: boolean;
  capability: { slug: string };
}

/** The upsert call for one capability slug, or `undefined` if the seed never wrote it. */
function upsertFor(upsert: ReturnType<typeof vi.fn>, slug: string) {
  return upsert.mock.calls.find(
    ([arg]) => arg.where.agentId_capabilityId.capabilityId === `cap-${slug}`
  )?.[0];
}

describe('app-reclaim/004-reclaim-coach-grants seed', () => {
  it('writes the authored exposure config, so widening the allowlist is not a no-op', async () => {
    const { ctx, upsert } = makeCtx();
    await grantsSeed.run(ctx);

    const call = upsertFor(upsert, RECLAIM_RECORD_ANSWERS_SLUG);
    expect(call).toBeDefined();
    // Both halves of the upsert carry it: an installed database needs the `update` branch, and a
    // fresh one needs `create`. The bug this test exists for was an installed database.
    expect(call.update.customConfig).toEqual({
      write: { groups: [...COACH_WRITABLE_GROUPS, 'reclaim_calendar'] },
    });
    expect(call.create.customConfig).toEqual(call.update.customConfig);
  });

  it('does not re-enable a capability an operator switched off', () => {
    // The admin UI's per-capability switch is the supported way to revoke a grant, and this unit's
    // own header is entirely about `isEnabled: false` being the state that means revoked. Because
    // `hashInputs` folds in the whole of `agent.ts`, a seed that wrote `isEnabled: true` on update
    // would undo that switch on every persona tweak or typo fix — a control that silently stops
    // working. `create` still enables, because a missing row is permissive rather than denied.
    const { ctx, upsert } = makeCtx();
    return grantsSeed.run(ctx).then(() => {
      for (const [call] of upsert.mock.calls) {
        expect(call.update.isEnabled).toBeUndefined();
        expect(call.create.isEnabled).toBe(true);
      }
    });
  });

  it('carries the reflection group through to the row that enforces it', async () => {
    // The specific widening that surfaced the gap. `facetAllows` refuses what the stored facet omits,
    // so a coach permitted in code and absent from this row cannot record what it was just told it
    // may — a silent disagreement between the authored rule and the enforced one.
    const { ctx, upsert } = makeCtx();
    await grantsSeed.run(ctx);

    const groups = upsertFor(upsert, RECLAIM_RECORD_ANSWERS_SLUG).update.customConfig.write.groups;
    expect(groups).toContain('reclaim_reflection');
    expect(groups).not.toContain('reclaim_share');
    expect(groups).not.toContain('reclaim_composite');
  });

  it('writes every authored grant, not only the one carrying config', async () => {
    const { ctx, upsert } = makeCtx();
    await grantsSeed.run(ctx);

    expect(upsert).toHaveBeenCalledTimes(reclaimCoachAgent.capabilities.length);
    for (const grant of reclaimCoachAgent.capabilities) {
      expect(upsertFor(upsert, grant.slug)).toBeDefined();
    }
  });

  it('leaves a retired capability disabled rather than absent, because absence is permissive', async () => {
    // `fill_slot` selects its run from a model-supplied argument (I6). Deleting the row would not
    // revoke it: the dispatcher synthesizes a default-allow binding for a missing row, so deleting
    // removes the *restriction*. `isEnabled: false` is the state that means revoked.
    const { ctx, create } = makeCtx();
    await grantsSeed.run(ctx);

    expect(create).toHaveBeenCalledWith({
      data: { agentId: 'agent-1', capabilityId: 'cap-fill_slot', isEnabled: false },
    });
  });

  it('revokes a grant the agent still holds but nobody authors any more', async () => {
    const { ctx, updateMany } = makeCtx({
      held: [{ id: 'grant-stale', isEnabled: true, capability: { slug: 'request_transition' } }],
    });
    await grantsSeed.run(ctx);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['grant-stale'] } },
      data: { isEnabled: false },
    });
  });

  it('does nothing when the agent row is absent, since 002 creates it', async () => {
    const { ctx, upsert, logger } = makeCtx({ agent: null });
    await grantsSeed.run(ctx);

    expect(upsert).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
