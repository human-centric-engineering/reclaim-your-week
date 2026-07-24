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
    // The leaf hook (`lib/app/leaf-db-drift.ts`) is no longer empty — it registers the eight
    // hand-written `app_reclaim_*` user FKs and the partial-unique index (F4 t-1). Assert the
    // delegation actually reaches them, so a regression that drops the leaf call is caught.
    registerAppDriftProbes();
    const probes = getAppDriftProbes();
    const reclaim = probes.filter((p) => p.table.startsWith('app_reclaim_'));
    // eight FK constraints + one partial unique index
    expect(reclaim).toHaveLength(9);
    expect(reclaim.filter((p) => p.kind === 'FK constraint')).toHaveLength(8);
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
