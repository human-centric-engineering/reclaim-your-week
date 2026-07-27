/**
 * The Phase 6 summary (F7 t-4). Assembles the standalone artifact from the run's slots (§10): name +
 * role + org, the period, priorities, the current allocation (the chart), the ideal allocation, the
 * chosen action, and the footnote. **Shareable-safe by construction:** it carries only the summary
 * fields §10 lists — never the sensitive prose (`reclaim_setup_keeping_me_up`, gap/challenge answers),
 * so the same object is safe to serve behind a public share token. Run-scoped (`readRunAnswers`).
 */

import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { RECLAIM_FOOTNOTE } from '@/lib/app/programme/content';
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
