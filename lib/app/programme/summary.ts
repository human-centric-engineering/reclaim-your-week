/**
 * The Phase 6 summary (F7 t-4). Assembles the standalone artifact from the run's slots (§10): name +
 * role + org, the period, priorities, the current allocation (the chart), the ideal allocation, the
 * chosen action, and the footnote. **Shareable-safe by construction:** it carries only the summary
 * fields §10 lists — never the sensitive prose (`reclaim_setup_keeping_me_up`, gap/challenge answers),
 * so the same object is safe to serve behind a public share token. Run-scoped (`readRunAnswers`).
 */

import { readRunAnswers, type RunAnswer } from '@/lib/app/programme/runs/answers';
import { RECLAIM_BUCKETS, bucketToken, RECLAIM_FOOTNOTE } from '@/lib/app/programme/content';
import { buildChartData, type Answers, type ChartData } from '@/lib/app/programme/chart/series';

export interface SummaryBucketRow {
  token: string;
  title: string;
  current: number;
  ideal: number | null;
}

export interface AuditSummary {
  firstName: string | null;
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
  footnote: string;
}

const text = (a: RunAnswer | undefined): string | null => (a && a.value.trim() ? a.value : null);
const numOf = (a: RunAnswer | undefined): number | null => {
  if (!a) return null;
  const n = typeof a.valueJson === 'number' ? a.valueJson : Number(a.value);
  return Number.isFinite(n) ? n : null;
};

/** Build the summary for a run. Reads every slug it needs run-scoped; carries no sensitive prose. */
export async function buildSummary(userId: string, runId: string): Promise<AuditSummary> {
  const answers: Answers = await readRunAnswers(userId, runId);
  const current = buildChartData(answers);

  const rows: SummaryBucketRow[] = current.buckets.map((b) => ({
    token: b.token,
    title: b.title,
    current: b.hours,
    ideal: numOf(answers[`reclaim_ideal_hours__${b.token}`]),
  }));

  return {
    firstName: text(answers['reclaim_profile_first_name']),
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
    footnote: RECLAIM_FOOTNOTE,
  };
}

/** The nine canonical bucket tokens (for a stable render order in the artifact). */
export const SUMMARY_BUCKET_ORDER = RECLAIM_BUCKETS.map((b) => bucketToken(b.slug));
