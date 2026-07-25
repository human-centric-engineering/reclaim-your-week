/**
 * Unit test — the app drift-probe bridge (f-overlays t-1).
 *
 * `registerAppDriftProbes()` (the fork-owned `lib/app/db-drift.ts`, called by
 * `scripts/db/check-drift.ts`) registers the framework tier's drift probes, then delegates to the
 * empty leaf hook — the drift analogue of the boot / admin-nav bridges. This asserts the end-to-end
 * wiring the drift check relies on: after the bridge runs, the framework HNSW probe is in the registry.
 *
 * @see lib/app/db-drift.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { registerAppDriftProbes } from '@/lib/app/db-drift';
import { getAppDriftProbes, resetAppDriftProbes } from '@/lib/db/drift-probes';

describe('registerAppDriftProbes (framework drift-probe wiring)', () => {
  beforeEach(() => resetAppDriftProbes());

  it('wires the framework node-embedding HNSW probe into the registry', () => {
    registerAppDriftProbes();
    const probes = getAppDriftProbes();
    expect(probes.some((p) => p.table === 'framework_node_embedding')).toBe(true);
  });

  it('wires the leaf (reclaim) probes in after the framework probes', () => {
    // The leaf hook (`lib/app/leaf-db-drift.ts`) is no longer empty — it registers the hand-written
    // `app_reclaim_*` user FKs and the partial-unique index (F4 t-1). Assert the delegation actually
    // reaches them, so a regression that drops the leaf call is caught.
    registerAppDriftProbes();
    const probes = getAppDriftProbes();
    const reclaim = probes.filter((p) => p.table.startsWith('app_reclaim_'));

    // The count grows as tables land (F8 t-1 added the referral FK; F9 t-3 the nudge), so pin the
    // SHAPE rather than a number: every leaf probe is either a user FK or the partial-unique index,
    // and each named policy below is present. A bare count would be a change-detector that says
    // nothing about whether the right thing is registered.
    expect(reclaim.length).toBeGreaterThanOrEqual(10);
    expect(
      reclaim.every((p) => p.kind === 'FK constraint' || p.kind === 'partial unique index')
    ).toBe(true);
    // Every `app_reclaim_*` FK probe names its ON DELETE action — that is what makes CI, rather than
    // a reviewer's memory, the check on the erasure policy.
    expect(
      reclaim
        .filter((p) => p.kind === 'FK constraint')
        .every((p) => /ON DELETE (CASCADE|SET NULL)/.test(p.name))
    ).toBe(true);
    // F9 t-3: the nudge preference is CASCADE, unlike consent — a preference about being emailed
    // evidences nothing once the person is gone.
    expect(reclaim.some((p) => p.name.includes('nudge') && p.name.includes('CASCADE'))).toBe(true);
    expect(
      reclaim.some((p) => p.name.includes('invitedByUserId') && p.name.includes('SET NULL'))
    ).toBe(true);
    expect(reclaim.some((p) => p.name.includes('active_user_key'))).toBe(true);
    // The SET NULL retention policy is named in the probe, not just CASCADE.
    expect(reclaim.some((p) => p.name.includes('consent') && p.name.includes('SET NULL'))).toBe(
      true
    );
  });

  it('does not throw registering the framework + leaf probes (delegation is safe)', () => {
    expect(() => registerAppDriftProbes()).not.toThrow();
  });
});
