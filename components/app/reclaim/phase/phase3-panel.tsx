'use client';

/**
 * Phase 3 — the ideal week (F7 t-1). A target-hours input per bucket with the **gap updating live**
 * (ideal − current), a current-vs-ideal comparison, the **"suspiciously similar" gentle challenge**
 * (§8), plus the sustainable total, the deep-work block, and the one protected commitment. Hours,
 * never percentages (I8). Ends with the required reflection `reclaim_reflection_p3` (I9).
 */

import { useEffect, useMemo, useState } from 'react';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { buildGapChartData, truthy, type Answers } from '@/lib/app/programme/chart/series';
import { IdealWeekChart } from '@/components/app/reclaim/chart/ideal-week-chart';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import { NumberField, TextAreaField } from '@/components/app/reclaim/phase/fields';
import { AdvanceControls } from '@/components/app/reclaim/phase/advance-controls';
import { parseHours, isHours } from '@/components/app/reclaim/phase/hours';
import {
  readAnswers,
  type AnswerInput,
  type RunAnswers,
} from '@/components/app/reclaim/phase/actions';
import { NO_VALUE } from '@/components/app/reclaim/format';

export function Phase3Panel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [base, setBase] = useState<RunAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ideal, setIdeal] = useState<Record<string, string>>({});
  const [total, setTotal] = useState('');
  const [deepWhen, setDeepWhen] = useState('');
  const [commitment, setCommitment] = useState('');
  const [reflection, setReflection] = useState('');

  useEffect(() => {
    void readAnswers(runId)
      .then((a) => {
        setBase(a);
        setLoaded(true);
      })
      .catch(() => setFailed(true));
  }, [runId]);

  const fundraisingRelevant = truthy(base['reclaim_setup_fundraising_relevant']);
  const visible = useMemo(
    () => RECLAIM_BUCKETS.filter((b) => b.slug !== 'fundraising-capital' || fundraisingRelevant),
    [fundraisingRelevant]
  );

  const currentHours = (token: string): number => {
    const a = base[`reclaim_current_hours__${token}`];
    if (!a) return 0;
    return typeof a.valueJson === 'number' ? a.valueJson : parseHours(a.value);
  };

  // The "suspiciously similar" heuristic (§8): most areas within an hour of current, esp. delivery
  // still high or recovery still near zero.
  const suspiciouslySimilar = useMemo(() => {
    const withIdeal = visible.filter((b) => ideal[bucketToken(b.slug)]?.trim());
    if (withIdeal.length < 3) return false;
    const nearlySame = withIdeal.every(
      (b) =>
        Math.abs(
          parseHours(ideal[bucketToken(b.slug)] ?? '') - currentHours(bucketToken(b.slug))
        ) <= 1
    );
    return nearlySame;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideal, visible, base]);

  /**
   * The picture of the week being designed, drawn from what is in the fields right now.
   *
   * Read from local state rather than from `base`, because on this surface the ideal figures are not
   * saved until the leader advances — a chart built from stored answers would sit under a filled-in
   * table showing every area at zero. The conversation surface has no such problem (the coach writes
   * each figure as it lands), so it builds the same chart straight from the run's answers.
   *
   * Held back until every visible area has a figure, the gate `readIdealWeek` applies for the same
   * reason: a half-typed week is mostly zeroes, so the chart would be a picture of how far down the
   * table the leader has got rather than of the week they are designing.
   *
   * **`isHours` and not `> 0`, which is the same defect the conversation surface had.** A typed "0" is
   * an answer — `isHours` exists to say so, and this was the one reader that asked the question the
   * other way round. A leader who wants no delivery and operations at all in the week they are
   * designing filled the table in completely and watched the chart never appear.
   */
  const idealChart = useMemo(() => {
    const complete =
      visible.length > 0 && visible.every((b) => isHours(ideal[bucketToken(b.slug)]?.trim() ?? ''));
    if (!complete) return null;
    const typed: Answers = { ...(base as Answers) };
    for (const b of visible) {
      const token = bucketToken(b.slug);
      const hours = parseHours(ideal[token] ?? '');
      typed[`reclaim_ideal_hours__${token}`] = { value: String(hours), valueJson: hours };
    }
    return buildGapChartData(typed);
  }, [base, ideal, visible]);

  const answers = (): AnswerInput[] => {
    const out: AnswerInput[] = [];
    for (const b of visible) {
      const token = bucketToken(b.slug);
      const v = ideal[token]?.trim();
      if (v && isHours(v))
        out.push({ slotSlug: `reclaim_ideal_hours__${token}`, value: v, valueJson: parseHours(v) });
    }
    if (total.trim() && parseHours(total) > 0)
      out.push({
        slotSlug: 'reclaim_ideal_total_hours',
        value: total.trim(),
        valueJson: parseHours(total),
      });
    if (deepWhen.trim())
      out.push({ slotSlug: 'reclaim_ideal_deep_block_when', value: deepWhen.trim() });
    if (commitment.trim())
      out.push({ slotSlug: 'reclaim_ideal_protected_commitment', value: commitment.trim() });
    out.push({ slotSlug: 'reclaim_reflection_p3', value: reflection.trim() });
    return out;
  };

  // Gate on the load: the "Now" column and the suspiciously-similar heuristic read `base`, so
  // rendering before it arrives (or after it failed) would show a false 0h picture (I8/§8).
  if (failed) {
    return (
      <p className="text-muted-foreground text-sm">
        We could not load this section just now. Please refresh to try again.
      </p>
    );
  }
  if (!loaded) {
    return <p className="text-muted-foreground text-sm tracking-wide">Loading your week…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-foreground text-2xl font-light">Your ideal week</h2>
        <p className="text-muted-foreground text-[1.02rem] leading-relaxed">
          A realistic target, grounded in what you now know about your energy and the gaps, not a
          fantasy. Set the hours you would want in each area; the change from today shows as you go.
        </p>
      </div>

      <NumberField
        id="ideal-total"
        label="What would a sustainable weekly total look like?"
        value={total}
        onChange={setTotal}
        help="Hours per week you could hold steadily, not a heroic peak."
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left text-xs uppercase">
              <th className="py-2 pr-4 font-medium">Area</th>
              <th className="py-2 pr-4 font-medium">Now</th>
              <th className="py-2 pr-4 font-medium">Ideal</th>
              <th className="py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => {
              const token = bucketToken(b.slug);
              const now = currentHours(token);
              const want = parseHours(ideal[token] ?? '');
              const gap = ideal[token]?.trim() ? Math.round((want - now) * 10) / 10 : null;
              return (
                <tr key={b.slug} className="border-border/60 border-b">
                  <td className="text-foreground py-2 pr-4">{b.title}</td>
                  <td className="text-muted-foreground py-2 pr-4 tabular-nums">{now}h</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={ideal[token] ?? ''}
                      onChange={(e) => setIdeal((p) => ({ ...p, [token]: e.target.value }))}
                      aria-label={`${b.title} ideal hours`}
                      className="border-border w-20 rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none"
                    />
                  </td>
                  <td className="py-2 tabular-nums">
                    {gap === null ? (
                      <span className="text-muted-foreground/50">{NO_VALUE}</span>
                    ) : (
                      <span
                        className={
                          gap > 0
                            ? 'text-primary'
                            : gap < 0
                              ? 'text-muted-foreground'
                              : 'text-muted-foreground/60'
                        }
                      >
                        {gap > 0 ? '+' : ''}
                        {gap}h
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The week being designed, drawn over the week they have. The table above is where the figures
          are entered; this is what they add up to. */}
      {idealChart !== null && (
        <div className="border-border/70 rounded-2xl border px-4 py-5 sm:px-6">
          <IdealWeekChart data={idealChart} />
        </div>
      )}

      {suspiciouslySimilar && (
        <p className="text-foreground border-primary/40 bg-muted/40 rounded-xl border-l-2 px-5 py-4 text-sm leading-relaxed">
          Your ideal week looks close to the one you have now. That is worth a pause: if nothing
          moves, nothing changes. Is there one area where you would genuinely want it to be
          different?
        </p>
      )}

      <TextAreaField
        id="ideal-deep"
        label="Where would your daily deep-work block sit, given your energy?"
        value={deepWhen}
        onChange={setDeepWhen}
        rows={2}
      />
      <TextAreaField
        id="ideal-commitment"
        label="What is the one protected commitment that would make the biggest difference?"
        value={commitment}
        onChange={setCommitment}
        rows={2}
      />

      <Reflection value={reflection} onChange={setReflection} />
      <AdvanceControls
        runId={runId}
        fromPhase="phase-3-ideal"
        answers={answers}
        canAdvance={reflection.trim().length > 0}
        onAdvanced={onAdvanced}
      />
    </div>
  );
}
