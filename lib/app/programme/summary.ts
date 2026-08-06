/**
 * The Phase 6 summary (F7 t-4). Assembles the standalone artifact from the run's slots (§10): name +
 * role + org, the period, priorities, the current allocation (the chart), the ideal allocation, the
 * chosen action, and the footnote. **Shareable-safe by construction:** it carries only the summary
 * fields §10 lists — never the sensitive prose (`reclaim_setup_keeping_me_up`, gap/challenge answers),
 * so the same object is safe to serve behind a public share token. Run-scoped (`readRunAnswers`).
 */

import { prisma } from '@/lib/db/client';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { RECLAIM_FOOTNOTE } from '@/lib/app/programme/content';
import { readReclaimConsultationEmail } from '@/lib/app/programme/config';
import { parseReportReading, type ReportReading } from '@/lib/app/programme/report/reading';
import {
  buildChartData,
  type Answers,
  type ChartData,
  type SlotAnswer,
} from '@/lib/app/programme/chart/series';

export interface SummaryBucketRow {
  token: string;
  title: string;
  current: number;
  ideal: number | null;
}

export interface AuditSummary {
  firstName: string | null;
  /**
   * When this audit happened, as an ISO date, and the reason the report has a date on it at all.
   *
   * A report a leader keeps for a year and comes back to is worthless without one: "twelve hours in
   * delivery" is a fact about a particular week, and a document that does not say which week is a
   * document making a claim about now. `completedAt` where the run is finished, `startedAt` while it
   * is still open, so the date on screen during section 6 is the day they did the work rather than a
   * blank waiting for a button press.
   *
   * ISO rather than formatted: the two surfaces render it in their own way, and a formatted string
   * crossing an API is a locale decision made in the wrong place.
   */
  auditedOn: string;
  role: string | null;
  orgType: string | null;
  period: string | null;
  priorities: string | null;
  /** The current-reality chart data (composite when a calendar was reconciled, I-composite). */
  current: ChartData;
  /** Per-bucket current vs ideal, for the summary comparison. */
  rows: SummaryBucketRow[];
  action: {
    chosen: string | null;
    when: string | null;
    howKnown: string | null;
  };
  /**
   * §10's two remaining items — the key gaps, and the phased pathway (F14).
   *
   * `null` whenever the report agent has not run, was refused, or failed, and **every surface renders
   * nothing for `null`** rather than an error or a placeholder. The summary satisfied §10's other
   * six bullets for the whole of v1; telling a leader their artifact is defective is worse than
   * quietly being the artifact it was before.
   *
   * Read from the run row, never generated here. `buildSummary` is called by the public share route
   * with no session and by the PDF route, and neither is a place to start spending money.
   */
  report: ReportReading | null;
  /**
   * Where a leader takes this next, carried on the artifact rather than left on the screen.
   *
   * The screen already offers it once, at the end (§10, and the consultation invitation appears once
   * by I16's reading of Brief §2). The **document** is the thing that outlives the screen: somebody
   * reading their report six months later, deciding they want to talk to somebody, should not have to
   * find the app again to discover who. Operator-set through `Module.config`, so it is read here
   * rather than hard-coded into two render surfaces.
   */
  contactEmail: string;
  footnote: string;
}

// Typed as `SlotAnswer` (prose + typed form) rather than as the full `RunAnswer` these are called
// with: the summary reads two fields, and the narrower signature is what lets the same helpers serve
// the chart's answer map. A reading's source type and confidence are deliberately not summary
// material — the summary is what the leader takes away, not a record of how it was captured.
const text = (a: SlotAnswer): string | null => (a && a.value.trim() ? a.value : null);
const numOf = (a: SlotAnswer): number | null => {
  if (!a) return null;
  const n = typeof a.valueJson === 'number' ? a.valueJson : Number(a.value);
  return Number.isFinite(n) ? n : null;
};

/** Build the summary for a run. Reads every slug it needs run-scoped; carries no sensitive prose. */
export async function buildSummary(userId: string, runId: string): Promise<AuditSummary> {
  const [answers, run, config] = await Promise.all([
    readRunAnswers(userId, runId) as Promise<Answers>,
    prisma.reclaimAuditRun.findFirst({
      where: { id: runId, userId },
      select: { analystReading: true, completedAt: true, startedAt: true },
    }),
    readReclaimConsultationEmail(),
  ]);
  const current = buildChartData(answers);

  // Re-parsed on the way out rather than trusted as stored. The column is JSON written by an earlier
  // deploy, so the shape it holds is whatever that build considered valid; re-running the refusals
  // means a reading that would not pass today's guards does not reach a public share because it
  // happened to be written before them. The token set is this run's own areas.
  const report =
    run?.analystReading == null
      ? null
      : parseReportReading(run.analystReading, new Set(current.buckets.map((b) => b.token)));

  const rows: SummaryBucketRow[] = current.buckets.map((b) => ({
    token: b.token,
    title: b.title,
    current: b.hours,
    ideal: numOf(answers[`reclaim_ideal_hours__${b.token}`]),
  }));

  return {
    firstName: text(answers['reclaim_profile_first_name']),
    // `completedAt` once finished, `startedAt` while the leader is still on section 6. A run that
    // cannot be read at all is dated today, which is the only honest answer available and is never
    // the common case: `buildSummary`'s callers have all loaded the run already.
    auditedOn: (run?.completedAt ?? run?.startedAt ?? new Date()).toISOString(),
    role: text(answers['reclaim_profile_role']),
    orgType: text(answers['reclaim_profile_org_type']),
    period: text(answers['reclaim_setup_audit_period']),
    priorities: text(answers['reclaim_setup_priorities']),
    current,
    rows,
    action: {
      chosen: text(answers['reclaim_action_chosen']),
      when: text(answers['reclaim_action_when']),
      howKnown: text(answers['reclaim_action_how_known']),
    },
    report,
    contactEmail: config,
    footnote: RECLAIM_FOOTNOTE,
  };
}
