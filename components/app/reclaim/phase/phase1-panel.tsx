'use client';

/**
 * Phase 1 — current reality (F6 t-2). Shows the nine areas first (the overview), then a card per area:
 * **hours per week** (I8, never a percentage) + what it looks like in practice, with deep-work's three
 * extra questions and the fundraising area shown only when Phase 0 marked it relevant. A user may
 * relabel an area (I7 — the canonical slug is untouched). Ends with the required reflection (I9,
 * server-enforced). On continue it batch-saves and advances to Phase 2.
 *
 * **The chart is a reveal, not a live preview** (I12). It used to redraw as the leader typed, which
 * meant they met their week one bar at a time and there was no picture left to show them. Now it waits
 * until every area they were asked about has a figure, and then they choose when to look — and the
 * server will not let them leave phase 1 until they have (`422 CHART_REVEAL_REQUIRED`). The
 * conversational surface has the same rule; both read `chartRevealState`. Composite figures where a
 * calendar was reconciled, never raw calendar totals (I-composite).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RECLAIM_BUCKETS, bucketToken, RECLAIM_DEEP_WORK_NOTE } from '@/lib/app/programme/content';
import { buildChartData, truthy, type Answers } from '@/lib/app/programme/chart/series';
import {
  CHART_REVEAL_MOMENT,
  chartRevealState,
  everyVisibleAreaHasHours,
} from '@/lib/app/programme/chart/reveal';
import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import { Comparison } from '@/components/app/reclaim/repeat/comparison';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import { NumberField, TextAreaField, BooleanField } from '@/components/app/reclaim/phase/fields';
import { parseHours, isHours } from '@/components/app/reclaim/phase/hours';
import {
  saveBatch,
  advancePhase,
  readAnswers,
  readLabels,
  saveLabel,
  claimOpening,
  type AnswerInput,
  type RunAnswers,
} from '@/components/app/reclaim/phase/actions';

export function Phase1Panel({
  runId,
  coachOpenings,
  onAdvanced,
}: {
  runId: string;
  /** The moments this run has had, so a reload does not re-offer a reveal already given. */
  coachOpenings: string[];
  onAdvanced: () => void;
}) {
  const [base, setBase] = useState<RunAnswers>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [deepWhen, setDeepWhen] = useState('');
  const [deepBlocker, setDeepBlocker] = useState('');
  const [deepBlock, setDeepBlock] = useState<boolean | null>(null);
  const [reflection, setReflection] = useState('');
  const [stage, setStage] = useState<'overview' | 'cards'>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set the moment the leader asks to see their week, before the run's ledger catches up. */
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    void (async () => {
      const [answers, loaded] = await Promise.all([
        readAnswers(runId).catch((): RunAnswers => ({})),
        readLabels(),
      ]);
      setBase(answers);
      setLabels(loaded);
    })();
  }, [runId]);

  const fundraisingRelevant = truthy(base['reclaim_setup_fundraising_relevant']);
  const visible = useMemo(
    () => RECLAIM_BUCKETS.filter((b) => b.slug !== 'fundraising-capital' || fundraisingRelevant),
    [fundraisingRelevant]
  );

  /** The loaded answers merged with the live-entered hours, so the chart draws what they typed. */
  const liveAnswers = useMemo(() => {
    const live: Answers = { ...base };
    for (const [token, v] of Object.entries(hours)) {
      if (isHours(v))
        live[`reclaim_current_hours__${token}`] = { value: v, valueJson: parseHours(v) };
    }
    return live;
  }, [base, hours]);

  const chartData = useMemo(() => buildChartData(liveAnswers, labels), [liveAnswers, labels]);

  /**
   * I12 — the picture is an event, not a running total.
   *
   * This panel used to draw the chart the instant any one field had a number in it, so a leader met
   * their week a bar at a time while typing and there was never a picture to reveal. Now it waits
   * until every area they were asked about has a figure, and then they choose when to look. The
   * conversational surface has the same rule for the same reason; both read `chartRevealState`.
   */
  const revealState = chartRevealState(
    liveAnswers,
    revealed ? [CHART_REVEAL_MOMENT] : coachOpenings
  );
  const isRevealed = revealState === 'revealed';

  const reveal = useCallback(async () => {
    setRevealed(true);
    // Recorded server-side because the transition gate reads it, and because a reload should not
    // ask a leader to reveal a week they have already seen. A failure here leaves the chart on
    // screen and the gate closed, which the continue button explains rather than the leader
    // discovering it as a refusal.
    await claimOpening(runId, CHART_REVEAL_MOMENT);
  }, [runId]);

  /** The live hours keyed by canonical bucket slug, for the comparison beside the cards (F9 t-2). */
  const liveHours = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const bucket of RECLAIM_BUCKETS) {
      const typed = hours[bucketToken(bucket.slug)];
      out[bucket.slug] = typed !== undefined && isHours(typed) ? parseHours(typed) : null;
    }
    return out;
  }, [hours]);

  const relabel = useCallback(async (slug: string, token: string, label: string) => {
    setLabels((p) => ({ ...p, [token]: label }));
    await saveLabel(slug, label);
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const answers: AnswerInput[] = [];
      for (const b of visible) {
        const token = bucketToken(b.slug);
        const h = hours[token]?.trim();
        if (h && isHours(h)) {
          answers.push({
            slotSlug: `reclaim_current_hours__${token}`,
            value: h,
            valueJson: parseHours(h),
          });
        }
        const d = detail[token]?.trim();
        if (d) answers.push({ slotSlug: `reclaim_current_detail__${token}`, value: d });
      }
      if (deepBlock !== null) {
        answers.push({
          slotSlug: 'reclaim_current_deep_block_exists',
          value: deepBlock ? 'Yes' : 'No',
          valueJson: deepBlock,
        });
      }
      if (deepWhen.trim())
        answers.push({ slotSlug: 'reclaim_current_deep_block_when', value: deepWhen.trim() });
      if (deepBlocker.trim())
        answers.push({ slotSlug: 'reclaim_current_deep_block_blocker', value: deepBlocker.trim() });
      // The reflection (I9) — its presence is what the server checks before the transition.
      answers.push({ slotSlug: 'reclaim_reflection_p1', value: reflection.trim() });

      await saveBatch(runId, answers);
      const advanced = await advancePhase(runId, 'phase-1-current');
      if (!advanced.ok) {
        throw new Error(
          advanced.reflectionRequired
            ? 'A reflection is needed before moving on.'
            : advanced.chartRevealRequired
              ? 'Have a look at the shape of your week before moving on.'
              : (advanced.message ?? 'We could not move on just now.')
        );
      }
      onAdvanced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (stage === 'overview') {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-foreground text-2xl font-light">Where your time goes now</h2>
          <p className="text-muted-foreground text-[1.02rem] leading-relaxed">
            We will look at up to nine areas of leadership. First, here is the whole picture, then
            we will go through them one at a time, in hours per week.
          </p>
        </div>
        <ul className="space-y-4">
          {visible.map((b) => (
            <li key={b.slug} className="border-border/60 border-b pb-4">
              <p className="text-foreground text-sm font-medium">
                {labels[bucketToken(b.slug)] ?? b.title}
              </p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{b.description}</p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setStage('cards')}
          className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium"
        >
          Go through them
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* F9 t-2: on a repeat audit, the previous one sits above the cards being filled in. Renders
          nothing on a first audit — absent rather than empty. */}
      <Comparison runId={runId} liveHours={liveHours} />

      <div className="space-y-8">
        {visible.map((b) => {
          const token = bucketToken(b.slug);
          const isDeep = b.slug === 'deep-work';
          return (
            <section key={b.slug} className="border-border/60 space-y-4 border-b pb-8">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-foreground text-base font-medium">
                  {labels[token] ?? b.title}
                </h3>
                <RelabelControl
                  current={labels[token] ?? ''}
                  defaultTitle={b.title}
                  onSave={(label) => void relabel(b.slug, token, label)}
                />
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
              <NumberField
                id={`hours-${token}`}
                label="Hours per week"
                value={hours[token] ?? ''}
                onChange={(v) => setHours((p) => ({ ...p, [token]: v }))}
                step="0.5"
                help="A rough figure is fine. Approximate the shape, not a precise total (I17)."
              />
              <TextAreaField
                id={`detail-${token}`}
                label="What does that time actually look like in practice?"
                value={detail[token] ?? ''}
                onChange={(v) => setDetail((p) => ({ ...p, [token]: v }))}
                rows={2}
              />
              {isDeep && (
                <div className="border-border/70 space-y-4 border-l-2 pl-5">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {RECLAIM_DEEP_WORK_NOTE}
                  </p>
                  <BooleanField
                    label="Do you have at least one protected 60–90 minute deep-work block most days?"
                    value={deepBlock}
                    onChange={setDeepBlock}
                  />
                  {deepBlock === true && (
                    <TextAreaField
                      id="deep-when"
                      label="Where does that block sit? Is it in your peak window?"
                      value={deepWhen}
                      onChange={setDeepWhen}
                      rows={2}
                    />
                  )}
                  {deepBlock === false && (
                    <TextAreaField
                      id="deep-blocker"
                      label="What gets in the way of protecting one?"
                      value={deepBlocker}
                      onChange={setDeepBlocker}
                      rows={2}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/*
        I12 — the picture, then a pause, then the question. The chart renders alone: no reading of
        what it means sits beside it, and the reflection below is the leader's own noticing rather
        than ours.
      */}
      {/*
        The calendar branch. Unreachable from anywhere in the app since F5 merged — this panel was
        meant to link to it and never did, which is why the fix belongs on both surfaces rather than
        only on the conversational one.
      */}
      {everyVisibleAreaHasHours(liveAnswers) &&
        !truthy(liveAnswers['reclaim_calendar_uploaded']) && (
          <div className="border-border/70 border-t pt-8">
            <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
              If you would like, you can reality-check this against your actual calendar. It is
              optional, your calendar file is never stored, and the audit works just as well without
              it.
            </p>
            <Link
              href="/programme/calendar"
              className="border-border text-foreground mt-5 inline-block rounded-full border px-7 py-2.5 text-sm font-medium"
            >
              Look at my calendar
            </Link>
          </div>
        )}

      {revealState === 'ready' && (
        <div className="border-border/70 border-t pt-8">
          <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
            That is every area accounted for. Whenever you are ready, we can look at the shape of
            the week you have described.
          </p>
          <button
            type="button"
            onClick={() => void reveal()}
            className="bg-primary text-primary-foreground mt-5 rounded-full px-8 py-3 text-[0.95rem] font-medium"
          >
            Show me where the week is going
          </button>
        </div>
      )}

      {isRevealed && (
        <div className="border-border/70 border-t pt-8">
          <ReclaimChart data={chartData} />
        </div>
      )}

      <Reflection value={reflection} onChange={setReflection} />

      {error && (
        <p className="text-muted-foreground text-sm" role="status">
          {error} You can try again.
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || reflection.trim().length === 0 || !isRevealed}
        className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Continue to the next section'}
      </button>
    </div>
  );
}

/** A small inline control to rename an area (F6 t-4). Opens an input; saves on confirm. */
function RelabelControl({
  current,
  defaultTitle,
  onSave,
}: {
  current: string;
  defaultTitle: string;
  onSave: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(current);
          setOpen(true);
        }}
        className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-4"
      >
        Rename
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        type="text"
        value={text}
        maxLength={40}
        placeholder={defaultTitle}
        onChange={(e) => setText(e.target.value)}
        className="border-border w-40 rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          onSave(text.trim());
          setOpen(false);
        }}
        className="text-primary text-xs"
      >
        Save
      </button>
    </div>
  );
}
