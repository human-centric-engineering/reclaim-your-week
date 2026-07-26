/**
 * App capability (agent tool) registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `registerBuiltInCapabilities()` calls this once before the first
 * agent dispatch (server route-handler runtime). Add
 * `registerAppCapability(new YourTool())` calls (your tools extend
 * `BaseCapability`).
 *
 * Full guide + example: CUSTOMIZATION.md §4 · .context/orchestration/capabilities.md
 */
export function initAppCapabilities(): void {
  // Nothing here. The reclaim coach's tools are declared on the module instead
  // (`reclaimAuditModule.capabilities` in `lib/app/programme/module.ts`), which is the seam that
  // both registers the handler and projects its `ai_capability` row at boot. This file is for a
  // capability that belongs to the app rather than to a module.
}
