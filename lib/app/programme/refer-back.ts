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
import {
  presentAnswer,
  isLeadersOwnWords,
  DEFAULT_PRESENTATION,
  type PresentationPolicy,
} from '@/lib/app/programme/slots/present';

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

/**
 * Build the refer-back for a specific run from its slot values (run-scoped).
 *
 * **What "verbatim" costs, and why the instruction is now conditional.** This block told the coach to
 * return the leader's words "verbatim, do not paraphrase" — while serving it `value`, which under
 * conversational capture is the coach's own rendering of what it heard ("close to the leader's own
 * words", by the tool's own description). So the tool was quoting a sentence nobody had said, and
 * saying it was a quote. `provenance.verbatim` now carries the real one where the coach caught it, and
 * `presentAnswer` decides which to serve — these two slugs default to leaning verbatim precisely
 * because this beat exists. When there is no real quote to give, which is every form-path run and
 * every run captured before this landed, the block asks for the substance rather than claiming a
 * fidelity it cannot supply. Telling a model a paraphrase is verbatim is how the tool ends up
 * presenting its own words as the leader's.
 */
export async function buildReferBack(
  userId: string,
  runId: string,
  policy: PresentationPolicy = DEFAULT_PRESENTATION
): Promise<ReferBack> {
  const answers = await readRunAnswers(userId, runId, [KEEPING_ME_UP, WHY_NOW]);
  const keepingUp = answers[KEEPING_ME_UP];
  const why = answers[WHY_NOW];

  const keepingMeUp =
    keepingUp === undefined ? null : presentAnswer(KEEPING_ME_UP, keepingUp, policy);
  const whyNow = why === undefined ? null : presentAnswer(WHY_NOW, why, policy);

  // Quoted only where what we hold is genuinely theirs. Both slugs quoted, or neither: a block that
  // quoted one and reported the other would read as though the tool had chosen which to take
  // seriously.
  const quoted =
    (keepingUp === undefined || isLeadersOwnWords(KEEPING_ME_UP, keepingUp, policy)) &&
    (why === undefined || isLeadersOwnWords(WHY_NOW, why, policy));

  const parts: string[] = [];
  if (keepingMeUp) parts.push(`- What keeps them up at night: "${keepingMeUp}"`);
  if (whyNow) parts.push(`- Why they wanted to do this now: "${whyNow}"`);
  const contextBlock =
    parts.length === 0
      ? ''
      : [
          ...(quoted
            ? [
                "The leader's own words from the start of this audit. At the gap, return these to them",
                'verbatim, do not paraphrase, and do not present them as your own observation:',
              ]
            : [
                'What the leader said at the start of this audit, as it was recorded rather than word for',
                'word. At the gap, put this back in front of them and do not present it as your own',
                'observation. Give it back as the substance of what they told you, and do not quote it as',
                'though these were their exact words:',
              ]),
          ...parts,
        ].join('\n');

  return { keepingMeUp, whyNow, contextBlock };
}

/** Build the refer-back for the user's single active run — the shape the context contributor needs. */
export async function buildReferBackForActiveRun(
  userId: string,
  policy: PresentationPolicy = DEFAULT_PRESENTATION
): Promise<ReferBack> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { userId, status: 'in_progress' },
    select: { id: true },
  });
  if (run === null) return { keepingMeUp: null, whyNow: null, contextBlock: '' };
  return buildReferBack(userId, run.id, policy);
}
