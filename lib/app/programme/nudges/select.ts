/**
 * Who gets a quarterly nudge, and who does not (F9 t-3).
 *
 * Brief §2: _"The natural cadence is quarterly, which is also the shape of the future paid offer, so
 * nudges should be **gentle and quarterly rather than frequent**."_
 *
 * This is the one place in the product that reaches out unprompted, so it is the one place **I16** is
 * most at risk — the tool returns people to their own discernment, and Brief §2 asks for no pressure
 * on next steps anywhere in it. The selection rules below are what keep a nudge a nudge:
 *
 *   1. **At most one per audit cycle, ever.** Not "quarterly until they respond". A sequence is what
 *      turns a nudge into a nag, and the difference between the two lives entirely in the frequency
 *      and the copy. Enforced by comparing against the audit the last nudge was sent *about*, so
 *      re-running the tick is a no-op rather than a second send.
 *   2. **Never mid-audit.** A leader with an audit open does not need reminding to start one; they
 *      need to be left alone to finish it.
 *   3. **Never after opting out**, and opting out takes one click and no login (see the token route).
 *
 * The decision is pure — rows in, decisions out — so the rules can be stated exactly in a test rather
 * than inferred from a query. `runNudgeTick` is the thin shell that reads and sends.
 */

/** One leader's nudge-relevant state, as the tick reads it. */
export interface NudgeCandidate {
  userId: string;
  email: string;
  name: string | null;
  /** Their most recently completed audit. */
  lastCompletedRunId: string;
  lastCompletedAt: Date;
  /** True when any audit of theirs is currently `in_progress`. */
  hasRunInProgress: boolean;
  optedOut: boolean;
  /** The audit the last nudge was sent about, if they have ever been nudged. */
  lastNudgedForRunId: string | null;
}

export interface NudgeDecision {
  candidate: NudgeCandidate;
  send: boolean;
  /** Why not, for the log. Never surfaced to a leader — this is operator diagnostics. */
  reason:
    | 'due'
    | 'opted_out'
    | 'audit_in_progress'
    | 'already_nudged_for_this_audit'
    | 'too_soon'
    | 'too_long_ago';
}

/** How long after a completed audit the nudge falls due, in days. A quarter, give or take. */
export const NUDGE_AFTER_DAYS = 90;

/**
 * …and how long after which it is no longer worth sending.
 *
 * Without an upper bound, the first tick after this ships would mail the entire dormant backlog a
 * message whose subject line says "about three months ago" — false for someone eighteen months gone,
 * and a mass mailing on day one for a cohort that has moved on. A nudge is a nudge because it is
 * timely; past this window the honest thing is silence.
 */
export const NUDGE_UNTIL_DAYS = 200;

/**
 * Decide one leader's case. Ordered so the reason returned is the *most meaningful* one: a leader who
 * opted out is never described as "too soon", because the first fact is the one an operator needs.
 */
export function decideNudge(
  candidate: NudgeCandidate,
  now: Date,
  afterDays: number = NUDGE_AFTER_DAYS,
  untilDays: number = NUDGE_UNTIL_DAYS
): NudgeDecision {
  const decision = (send: boolean, reason: NudgeDecision['reason']): NudgeDecision => ({
    candidate,
    send,
    reason,
  });

  if (candidate.optedOut) return decision(false, 'opted_out');
  if (candidate.hasRunInProgress) return decision(false, 'audit_in_progress');
  if (candidate.lastNudgedForRunId === candidate.lastCompletedRunId) {
    // They have already been nudged about this audit. The next one is due after their NEXT audit,
    // not after another ninety days — which is what makes this a cadence rather than a campaign.
    return decision(false, 'already_nudged_for_this_audit');
  }

  const ageDays = (now.getTime() - candidate.lastCompletedAt.getTime()) / 86_400_000;
  if (ageDays < afterDays) return decision(false, 'too_soon');
  if (ageDays > untilDays) return decision(false, 'too_long_ago');

  return decision(true, 'due');
}

/** Decide a whole cohort. Pure; the tick calls this and then sends to the `send: true` subset. */
export function decideNudges(
  candidates: NudgeCandidate[],
  now: Date,
  afterDays: number = NUDGE_AFTER_DAYS,
  untilDays: number = NUDGE_UNTIL_DAYS
): NudgeDecision[] {
  return candidates.map((candidate) => decideNudge(candidate, now, afterDays, untilDays));
}
