/**
 * The two success measures (F10 t-2) — the numbers Rashmir named, which nothing reported until now.
 *
 * Brief §1: _"The success measure is not downloads; it is whether people come back, and whether they
 * tell others about it unprompted."_ Both halves are computed here, and both are computed **from the
 * leaf's own rows** rather than from the framework's engagement stream. That is a deliberate
 * reconciliation (plan D3), not a duplication:
 *
 *   `ModuleStats.returningUsers` counts users with more than one `module.entered` event. Re-opening
 *   the surface is not doing the audit again — a leader who opens the module twice in a sitting
 *   counts, and one who finished a second audit without a fresh entry event may not. The measure
 *   Rashmir asked for is people who **came back and did it again**, which is `status = 'complete'`
 *   grouped by user: exact, cheap, and unambiguous. The framework's engagement figures remain useful
 *   next to it; they must never be relabelled as it.
 *
 * The split below is the test strategy's: `computeMeasures` is pure and tested against hand-built
 * rows, and the Prisma reads are a thin shell around it. Testing this through a mocked Prisma chain
 * would only prove the mock returns what it was told to.
 */

import { prisma } from '@/lib/db/client';

/** Did people come back? Completions per leader, not sessions. */
export interface ReturnRate {
  /** Leaders who have completed at least one audit — the denominator, always shown. */
  completedAtLeastOne: number;
  /** Leaders who have completed two or more. */
  completedTwoOrMore: number;
  /** `completedTwoOrMore / completedAtLeastOne`, or `null` when nobody has finished one yet. */
  rate: number | null;
}

/** Did they tell others? Three counts and the two ratios between them. */
export interface ReferralConversion {
  /** Referral-tier invitations sent by leaders (never by an admin). */
  sent: number;
  /** …of which were redeemed into an account. */
  accepted: number;
  /** …of which went on to complete a first audit — the conversion that actually counts. */
  completed: number;
  acceptanceRate: number | null;
  completionRate: number | null;
}

export interface MeasuresView {
  returnRate: ReturnRate;
  referral: ReferralConversion;
  totals: { clients: number; runsCompleted: number };
}

/** The rows `computeMeasures` needs — deliberately the minimum, so tests can build them by hand. */
export interface MeasureInput {
  /** One entry per completed run: whose it was. Order irrelevant; repeats are the point. */
  completedRunUserIds: string[];
  /** Every referral-tier invite a leader sent. */
  referralInvites: Array<{ redeemedByUserId: string | null }>;
  /** How many leaders have a programme footprint at all. */
  clientCount: number;
}

/** A ratio, or `null` when the denominator is zero — never `0`, which would read as a real result. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * The measures, from rows. Pure: no Prisma, no clock, no config — so a test can state exactly the
 * cohort it means and read the answer back.
 */
export function computeMeasures(input: MeasureInput): MeasuresView {
  const completionsByUser = new Map<string, number>();
  for (const userId of input.completedRunUserIds) {
    completionsByUser.set(userId, (completionsByUser.get(userId) ?? 0) + 1);
  }

  const completedAtLeastOne = completionsByUser.size;
  const completedTwoOrMore = [...completionsByUser.values()].filter((n) => n >= 2).length;

  const accepted = input.referralInvites.filter((i) => i.redeemedByUserId !== null);
  // A referred leader has "converted" once they finish their FIRST audit (Brief §8's own rule for the
  // unlock) — so membership in the completed set, not a count of their runs.
  const completed = accepted.filter(
    (i) => i.redeemedByUserId !== null && completionsByUser.has(i.redeemedByUserId)
  );

  return {
    returnRate: {
      completedAtLeastOne,
      completedTwoOrMore,
      rate: ratio(completedTwoOrMore, completedAtLeastOne),
    },
    referral: {
      sent: input.referralInvites.length,
      accepted: accepted.length,
      completed: completed.length,
      acceptanceRate: ratio(accepted.length, input.referralInvites.length),
      completionRate: ratio(completed.length, accepted.length),
    },
    totals: { clients: input.clientCount, runsCompleted: input.completedRunUserIds.length },
  };
}

/** Read the rows and compute. Four batched queries; nothing per-row. */
export async function readMeasures(): Promise<MeasuresView> {
  const [completedRuns, referralInvites, grants, runs] = await Promise.all([
    prisma.reclaimAuditRun.findMany({ where: { status: 'complete' }, select: { userId: true } }),
    // A referral is an invite a *leader* sent — `invitedByUserId` is null for everything Rashmir
    // issues from the admin screen, which is what separates word of mouth from her own outreach.
    prisma.reclaimInvite.findMany({
      where: { invitedByUserId: { not: null } },
      select: { redeemedByUserId: true },
    }),
    prisma.reclaimGrant.findMany({ select: { userId: true }, distinct: ['userId'] }),
    prisma.reclaimAuditRun.findMany({ select: { userId: true }, distinct: ['userId'] }),
  ]);

  const clientIds = new Set<string>();
  for (const g of grants) clientIds.add(g.userId);
  for (const r of runs) clientIds.add(r.userId);

  return computeMeasures({
    completedRunUserIds: completedRuns.map((r) => r.userId),
    referralInvites,
    clientCount: clientIds.size,
  });
}
