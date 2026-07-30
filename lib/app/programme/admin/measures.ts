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
import { previewUserIds, excludeIds } from '@/lib/app/programme/preview/accounts';

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

/**
 * One quarter on the timeline (post-v1 P9).
 *
 * F9 deferred operator-side trends to F10's history reads; F10 deferred them to F9's. Both shipped,
 * so nobody owned it — the measures were point-in-time only, which is the one shape that cannot
 * answer the question Brief §1 actually asks. "Do people come back" is not a number, it is a
 * direction, and a single figure taken today cannot tell you whether it is moving.
 */
export interface MeasurePoint {
  /** Calendar quarter label, e.g. `2026 Q3` — the cadence the product itself runs on. */
  period: string;
  /** Audits completed in that quarter. */
  completions: number;
  /** Leaders completing their **second or later** audit in that quarter — a return, as it happened. */
  returns: number;
  /** Referral-tier invitations sent by leaders in that quarter. */
  referralsSent: number;
}

export interface MeasuresView {
  returnRate: ReturnRate;
  referral: ReferralConversion;
  totals: { clients: number; runsCompleted: number };
  /**
   * The last eight quarters, oldest first, or fewer where the product is younger than that.
   *
   * **Deliberately counts events in a period rather than restating the headline rate per period.**
   * A quarterly return *rate* over a cohort of eleven leaders is three significant figures of noise;
   * "two people came back this quarter" is a fact. I12's discipline applies to Rashmir's dashboard as
   * much as to a leader's chart: report what happened, and leave the reading to her.
   */
  timeline: MeasurePoint[];
}

/**
 * The rows the **timeline** needs, and nothing else.
 *
 * Its own type rather than a slice of `MeasureInput`: `buildTimeline` never reads the referral
 * redemption state or the client count, and a function that demands arguments it ignores makes every
 * caller and every test carry ballast to satisfy a compiler rather than a requirement.
 */
export interface TimelineInput {
  /** Every completion with its date. */
  completions?: Array<{ userId: string; completedAt: Date }>;
  /** When each referral-tier invitation was sent. */
  referralsSentAt?: Date[];
  /** The end of the window — the caller's clock, so the function stays pure and testable. */
  now?: Date;
}

/** The rows `computeMeasures` needs — deliberately the minimum, so tests can build them by hand. */
export interface MeasureInput extends TimelineInput {
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
    timeline: buildTimeline(input),
  };
}

/** `2026 Q3` from a date. The product's own cadence, and the one Rashmir thinks in. */
export function quarterOf(date: Date): string {
  return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/** The eight quarters ending in the one containing `now`, oldest first. */
function recentQuarters(now: Date, count = 8): string[] {
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back * 3, 1));
    out.push(quarterOf(d));
  }
  return out;
}

/**
 * Events per quarter. Pure, and it counts **events as they happened** rather than recomputing the
 * headline rate per period — see `MeasuresView.timeline` for why that is the honest shape at this
 * cohort size.
 *
 * A "return" is a completion that was not that leader's first, decided by ordering their completions
 * in time. So a leader who finished audits in Q1 and Q3 contributes one completion to Q1 and both a
 * completion and a return to Q3, which is exactly when the coming-back happened.
 */
export function buildTimeline(input: TimelineInput): MeasurePoint[] {
  const completions = input.completions ?? [];
  if (completions.length === 0 && (input.referralsSentAt ?? []).length === 0) return [];

  const now = input.now ?? new Date();
  const periods = recentQuarters(now);
  const index = new Map(periods.map((p, i) => [p, i]));

  const points: MeasurePoint[] = periods.map((period) => ({
    period,
    completions: 0,
    returns: 0,
    referralsSent: 0,
  }));

  // Order each leader's completions so "was this their first?" is answerable per event.
  const byUser = new Map<string, Date[]>();
  for (const c of completions) {
    const list = byUser.get(c.userId) ?? [];
    list.push(c.completedAt);
    byUser.set(c.userId, list);
  }
  for (const list of byUser.values()) list.sort((a, b) => a.getTime() - b.getTime());

  for (const [, dates] of byUser) {
    dates.forEach((date, nth) => {
      const at = index.get(quarterOf(date));
      if (at === undefined) return; // older than the window
      const point = points[at];
      if (point === undefined) return;
      point.completions += 1;
      if (nth > 0) point.returns += 1;
    });
  }

  for (const sentAt of input.referralsSentAt ?? []) {
    const at = index.get(quarterOf(sentAt));
    if (at === undefined) continue;
    const point = points[at];
    if (point !== undefined) point.referralsSent += 1;
  }

  return points;
}

/** Read the rows and compute. Four batched queries; nothing per-row. */
export async function readMeasures(): Promise<MeasuresView> {
  // Every measure on this screen is a count, so every query below excludes test accounts (F19).
  // Awaited before the batch rather than inside it: one extra round trip, and the alternative is four
  // copies of the same read. `undefined` when there are none, so the emitted SQL is unchanged.
  const notPreview = excludeIds(await previewUserIds());

  const [completedRuns, referralInvites, grants, runs] = await Promise.all([
    prisma.reclaimAuditRun.findMany({
      where: { status: 'complete', userId: notPreview },
      select: { userId: true, completedAt: true, startedAt: true },
    }),
    // A referral is an invite a *leader* sent — `invitedByUserId` is null for everything Rashmir
    // issues from the admin screen, which is what separates word of mouth from her own outreach.
    //
    // Excluded on the **sender**: a test account exercising the referral form would otherwise inflate
    // word of mouth, which is the one measure here that is about other people's enthusiasm.
    prisma.reclaimInvite.findMany({
      where: { invitedByUserId: { not: null, ...notPreview } },
      select: { redeemedByUserId: true, createdAt: true },
    }),
    prisma.reclaimGrant.findMany({
      where: { userId: notPreview },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.reclaimAuditRun.findMany({
      where: { userId: notPreview },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const clientIds = new Set<string>();
  for (const g of grants) clientIds.add(g.userId);
  for (const r of runs) clientIds.add(r.userId);

  return computeMeasures({
    completedRunUserIds: completedRuns.map((r) => r.userId),
    // `completedAt` is set by `completeRun`; fall back to the start for any row predating it, the
    // same way the trends and the nudge do.
    completions: completedRuns.map((r) => ({
      userId: r.userId,
      completedAt: r.completedAt ?? r.startedAt,
    })),
    referralsSentAt: referralInvites.map((i) => i.createdAt),
    referralInvites,
    clientCount: clientIds.size,
  });
}
