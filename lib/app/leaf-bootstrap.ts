/**
 * Leaf-app boot hook — Reclaim Your Week.
 *
 * Fills the reserved leaf boot seam with this app's one-time startup steps. It runs
 * at server startup after the framework is initialised (called by
 * `lib/app/bootstrap.ts`'s `initApp()`) — nodejs runtime, production and development
 * — and **before** the boot-time `syncFramework()`, so a module registered here is
 * reconciled into `framework_module` on the same boot.
 *
 * Registration is synchronous and DB-free: `registerModule()` records the definition
 * in the in-memory registry; the sync that follows in `initApp()` persists it. If
 * this hook throws, `initApp()` skips the sync (the fail-safe against reconciling a
 * half-populated registry) — so keep boot steps side-effect-light.
 */
import { registerModule } from '@/lib/framework/modules';
import { reclaimAuditModule } from '@/lib/app/programme/module';

export function initLeafApp(): Promise<void> {
  // Register the reclaim-audit module (F2). Idempotent by slug — HMR / repeat-import safe.
  registerModule(reclaimAuditModule);
  return Promise.resolve();
}
