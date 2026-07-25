/**
 * Module registry — the in-memory set of registered `ModuleDefinition`s.
 *
 * Pure and DB-free: `registerModule()` records a definition in a module-scoped
 * `Map` keyed by slug; the boot-time reconciliation of that map into
 * `framework_module` rows is `syncRegisteredModules()` (see `./sync`), kept a
 * separate function so registration stays synchronous, side-effect-light, and
 * unit-testable on its own.
 *
 * Registration happens in code at module-import time:
 *   - the framework registers its own modules (if any) from within `initFramework()`;
 *   - a leaf app registers its modules from `initLeafApp()` (the single leaf boot
 *     hook), calling `registerModule()` exported here.
 * The boot sequence (`lib/app/bootstrap.ts`) runs both before `syncFramework()`.
 *
 * Idempotent by slug — re-registering the same slug replaces the prior definition
 * — so repeated imports under HMR or multiple entrypoints are safe. Mirrors the
 * per-slug `Map` used by the capability schema registry
 * (`lib/orchestration/schemas/registry.ts`) and the capability dispatcher.
 */

import type { ModuleDefinition } from '@/lib/framework/modules/definition';

// keep-mine (leaf defect fix — logged in `.context/app/daybreak-asks.md`): the registry
// MUST be stashed on `globalThis`, not a bare module-scoped `Map`. `registerModule()` runs
// only from `initApp()` at `instrumentation.ts` boot, but under Next 16 + Turbopack the
// instrumentation module graph is separate from the route-handler/RSC graph — a plain module
// singleton populated at boot is a DIFFERENT, empty instance at request time, so
// `getRegisteredModule()` returns `undefined` and the admin module UI reports "no longer
// registered" despite a successful boot-time sync. Mirrors `globalForPrisma` in
// `lib/db/client.ts`. Delete this block and restore the plain `Map` once Daybreak lands the
// fix upstream.
const globalForModuleRegistry = globalThis as unknown as {
  frameworkModuleRegistry?: Map<string, ModuleDefinition>;
};

const modules =
  globalForModuleRegistry.frameworkModuleRegistry ?? new Map<string, ModuleDefinition>();

globalForModuleRegistry.frameworkModuleRegistry = modules;

/**
 * Register a module definition. Idempotent by slug: a later registration of the
 * same slug replaces the earlier one (HMR / repeat-import safe). Call at
 * module-import time, before the boot-time sync.
 */
export function registerModule(definition: ModuleDefinition): void {
  modules.set(definition.slug, definition);
}

/** All currently-registered module definitions, in insertion order. */
export function getRegisteredModules(): ModuleDefinition[] {
  return [...modules.values()];
}

/**
 * The registered definition for a slug, or `undefined` if no module with that slug is
 * registered in code (e.g. a retired `framework_module` row whose code was removed).
 * The source of a module's `configSchema` for validation + form rendering
 * (f-module-config).
 */
export function getRegisteredModule(slug: string): ModuleDefinition | undefined {
  return modules.get(slug);
}

/**
 * Test-only: clear the registry so each test starts from a known-empty state.
 * Not exported from the domain barrel (`./index`).
 */
export function __resetModuleRegistryForTests(): void {
  modules.clear();
}
