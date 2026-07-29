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
 *
 * ## The registration key, and the bug that hid in it
 *
 * Contributors are keyed on the chat request's **`contextType`**, and the id handed to the loader is
 * the `contextId`. A module-surface conversation is `contextType: 'module'` with `contextId:
 * 'reclaim-audit'`. This file registered under `'reclaim-audit'`, which is the id and not the type, so
 * the loader was never dispatched: the refer-back (I13) that Brief §5 calls "a data-flow requirement,
 * not just prompt text" never actually reached the coach. The test did not catch it because it mocked
 * `registerContextContributor` and asserted only what the registered loader returned, never the key it
 * was registered under. The key is a constant now, and pinned.
 *
 * Registering under `'module'` means taking the type the framework registers (`initFramework()` →
 * `loadModuleContext`), and the registry replaces per type rather than composing. So this loader
 * **delegates to the framework's loader first** and appends the leaf's blocks to what it returns,
 * which keeps the module name, description and fresh-slot injection exactly as the framework built
 * them. Any other module slug passes straight through untouched.
 */
import { registerContextContributor } from '@/lib/orchestration/chat/context-builder';
import { loadModuleContext, MODULE_CONTEXT_TYPE } from '@/lib/framework/modules/context';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';
import { buildReferBackForActiveRun } from '@/lib/app/programme/refer-back';
import { buildCoachPhaseContext } from '@/lib/app/programme/coach/phase-context';
import { readReclaimPresentation } from '@/lib/app/programme/config';
import { DEFAULT_PRESENTATION } from '@/lib/app/programme/slots/present';

export function initAppContextContributors(): void {
  registerContextContributor(MODULE_CONTEXT_TYPE, async (id, request) => {
    const frameworkContext = await loadModuleContext(id, request);
    const userId = request?.userId;
    if (id !== RECLAIM_MODULE_SLUG || userId === undefined) return frameworkContext;

    // Both leaf blocks read this leader's own answers for their active run, so they cache per
    // `(type, id, userId)` alongside the framework half rather than leaking across users.
    //
    //  - The phase block: which phase the leader is on, which readings it captures, and which of
    //    those this run already has. Without it the coach cannot pace a phase, and cannot tell a
    //    second audit from a first (the framework's fresh slots are cross-run heads).
    //  - The refer-back (F7 t-2, I13): the leader's own Phase 0 words, so the coach hands the insight
    //    back at the gap rather than inventing it.
    // The presentation policy decides whether the refer-back is serving the leader's own sentence or
    // the coach's reading of it, which decides whether the block may call itself a quote. Read here
    // and defaulted on failure, because a config row that cannot be read is not a reason to lose the
    // refer-back: the default leans verbatim for exactly these two slugs.
    const [phase, referBack] = await Promise.all([
      buildCoachPhaseContext(userId),
      readReclaimPresentation()
        .catch(() => DEFAULT_PRESENTATION)
        .then((policy) => buildReferBackForActiveRun(userId, policy)),
    ]);

    return [frameworkContext, phase, referBack.contextBlock]
      .filter((part) => part.length > 0)
      .join('\n\n');
  });
}
