/**
 * The refer-back (F7 t-2, I13). What the leader said at Phase 0 about what keeps them up at night, and
 * why now, returns **in their own words** at Phase 4 — read from the run's slot values, never from the
 * model's memory (Brief §5: "a data-flow requirement, not just prompt text"). Run-scoped via
 * `readRunAnswers` (`provenance.runId`, F1), so a repeat audit never inherits a prior run's words.
 *
 * Two consumers share this one data flow: the Phase 4 UI (shows the leader their own words) and the
 * context contributor (`lib/app/context-contributors.ts`), which puts the same verbatim block in front
 * of the coach so it can hand the insight back rather than invent it.
 */

import { prisma } from '@/lib/db/client';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';

const KEEPING_ME_UP = 'reclaim_setup_keeping_me_up';
const WHY_NOW = 'reclaim_setup_why_now';

export interface ReferBack {
  /** The Phase 0 "what keeps you up at night" answer, verbatim, or `null` if not captured. */
  keepingMeUp: string | null;
  /** The Phase 0 "why now" answer, verbatim, or `null`. */
  whyNow: string | null;
  /** A prompt block for the coach context — the leader's own words + an instruction to return them verbatim. */
  contextBlock: string;
}

/** Build the refer-back for a specific run from its slot values (verbatim, run-scoped). */
export async function buildReferBack(userId: string, runId: string): Promise<ReferBack> {
  const answers = await readRunAnswers(userId, runId, [KEEPING_ME_UP, WHY_NOW]);
  const keepingMeUp = answers[KEEPING_ME_UP]?.value ?? null;
  const whyNow = answers[WHY_NOW]?.value ?? null;

  const parts: string[] = [];
  if (keepingMeUp) parts.push(`- What keeps them up at night: "${keepingMeUp}"`);
  if (whyNow) parts.push(`- Why they wanted to do this now: "${whyNow}"`);
  const contextBlock =
    parts.length === 0
      ? ''
      : [
          "The leader's own words from the start of this audit. At the gap, return these to them",
          'verbatim — do not paraphrase, and do not present them as your own observation:',
          ...parts,
        ].join('\n');

  return { keepingMeUp, whyNow, contextBlock };
}

/** Build the refer-back for the user's single active run — the shape the context contributor needs. */
export async function buildReferBackForActiveRun(userId: string): Promise<ReferBack> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { userId, status: 'in_progress' },
    select: { id: true },
  });
  if (run === null) return { keepingMeUp: null, whyNow: null, contextBlock: '' };
  return buildReferBack(userId, run.id);
}
