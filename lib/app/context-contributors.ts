/**
 * App context-contributor registrations (prompt-context loaders).
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `buildContext()` calls this once before its first lookup
 * (server route-handler runtime). Add `registerContextContributor(type,
 * loader)` calls to inject your own `LOCKED CONTEXT` block per turn for a
 * given `contextType`, without editing the core `buildContext` switch.
 *
 * Full guide + example: CUSTOMIZATION.md §4 · .context/orchestration/chat.md
 */
import { registerContextContributor } from '@/lib/orchestration/chat/context-builder';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import { buildReferBackForActiveRun } from '@/lib/app/programme/refer-back';

export function initAppContextContributors(): void {
  // The refer-back (F7 t-2, I13): put the leader's own Phase 0 words in front of the coach so it hands
  // the insight back at the gap rather than inventing it. Keyed on the module slug; the loader resolves
  // the user's single active run and reads the two setup slots run-scoped (a data flow, not "remember").
  registerContextContributor(RECLAIM_MODULE_SLUG, async (_id, request) => {
    if (!request.userId) return '';
    const referBack = await buildReferBackForActiveRun(request.userId);
    return referBack.contextBlock;
  });
}
