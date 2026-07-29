'use client';

/**
 * Phase 6 — summary + share (F7 t-4). The standalone artifact (§10), **downloadable** (print) and
 * **shareable** via a tokenised link. Sharing is **invited, never required** — the optional capture
 * (age band, demographics, the feedback line, and the **separate** quote consent) appears only after
 * the leader chooses to share, each optional. Finishing completes the run (I15). The consultation
 * offer + closing affirmation appear once, at the end.
 */

import { useEffect, useState } from 'react';
import {
  RECLAIM_CLOSING_AFFIRMATION,
  RECLAIM_CONSULTATION_EMAIL,
} from '@/lib/app/programme/content';
import { SummaryView } from '@/components/app/reclaim/summary/summary-view';
import { CoachChat } from '@/components/app/reclaim/coach-chat';
import { ReferralInvite } from '@/components/app/reclaim/referral-invite';
import { DownloadReport } from '@/components/app/reclaim/report/download-report';
import { TextAreaField, SelectField } from '@/components/app/reclaim/phase/fields';
import {
  fetchSummary,
  shareSummary,
  completeAudit,
  readAnswers,
  saveAnswer,
  type ShareInput,
} from '@/components/app/reclaim/phase/actions';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';

const AGE_BANDS = ['Prefer not to say', 'Under 35', '35–44', '45–54', '55–64', '65+'];

export function Phase6Panel({
  runId,
  conversationId,
  coachOpenings,
  onAdvanced,
}: {
  runId: string;
  /** The run's transcript, so the closing beat continues the conversation rather than starting one. */
  conversationId: string | null;
  coachOpenings: string[];
  onAdvanced: () => void;
}) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  /**
   * The takeaway, asked before the summary exists (`Prompt_Text.md:35`).
   *
   * `null` while unread, `''` when the leader has been asked and not yet answered. The summary does
   * not render until it is saved: that ordering is the beat the source describes, and it is why this
   * question is no longer buried in the sharing form where only people who chose to share ever saw it.
   */
  const [takeawayValue, setTakeawayValue] = useState<string | null>(null);
  const [takeawayDraft, setTakeawayDraft] = useState('');
  const [savingTakeaway, setSavingTakeaway] = useState(false);
  const [failed, setFailed] = useState(false);
  const [wantShare, setWantShare] = useState(false);
  const [withCoach, setWithCoach] = useState(false);
  const [publicLink, setPublicLink] = useState(false);
  const [ageBand, setAgeBand] = useState('');
  const [quotable, setQuotable] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    void fetchSummary(runId)
      .then(setSummary)
      .catch(() => setFailed(true));
  }, [runId]);

  // The takeaway, read back so a leader who saved it and reloaded is not asked again.
  useEffect(() => {
    void readAnswers(runId)
      .then((answers) => setTakeawayValue(answers['reclaim_reflection_p6']?.value ?? ''))
      .catch(() => setTakeawayValue(''));
  }, [runId]);

  const saveTakeaway = async () => {
    setSavingTakeaway(true);
    setError(null);
    try {
      const value = takeawayDraft.trim();
      // The leader-initiated path, like every other reflection: the coach may ask and may offer
      // words back, and only this save writes one (I6, I9).
      await saveAnswer(runId, { slotSlug: 'reclaim_reflection_p6', value });
      setTakeawayValue(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSavingTakeaway(false);
    }
  };

  const saveShare = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: ShareInput = {
        publicLink,
        withCoach,
        ageBand: ageBand && ageBand !== 'Prefer not to say' ? ageBand : undefined,
        // Reuses what they already wrote rather than asking a near-identical question twice. The
        // source asks the takeaway of everyone before the summary; Brief §3 asks sharers for "in a
        // sentence, what did you take from this?" afterwards. Asking both verbatim reads as a repeat,
        // so the sharing step carries their saved answer and asks only for permission to quote it.
        takeaway: takeawayValue?.trim() || undefined,
        quotable,
      };
      const token = await shareSummary(runId, input);
      if (token) setShareLink(`${window.location.origin}/summary/${token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeAudit(runId);
      setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <p className="text-muted-foreground text-sm">We could not load your summary just now.</p>
    );
  }
  if (summary === null) {
    return <p className="text-muted-foreground text-sm tracking-wide">Gathering your summary…</p>;
  }

  if (finished) {
    return (
      <div className="space-y-8 py-6 text-center">
        <p className="text-foreground mx-auto max-w-xl text-xl leading-relaxed font-light">
          {RECLAIM_CLOSING_AFFIRMATION}
        </p>
        <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
          If a 30-minute conversation would help you take this further, you can reach Rashmir at{' '}
          <a
            href={`mailto:${RECLAIM_CONSULTATION_EMAIL}`}
            className="text-primary underline underline-offset-4"
          >
            {RECLAIM_CONSULTATION_EMAIL}
          </a>
          . No pressure. The work is yours.
        </p>
        {shareLink && (
          <p className="text-muted-foreground text-sm">
            Your shareable link:{' '}
            <a href={shareLink} className="text-primary underline underline-offset-4">
              {shareLink}
            </a>
          </p>
        )}
        <button
          type="button"
          onClick={onAdvanced}
          className="text-primary text-sm underline underline-offset-4"
        >
          Back to your audit
        </button>
      </div>
    );
  }

  // The source asks this before it produces anything, and so does this screen.
  if (takeawayValue === null || takeawayValue.trim().length === 0) {
    return (
      <div className="space-y-8">
        <TextAreaField
          id="takeaway-reflection"
          label="What are you taking away from this?"
          value={takeawayDraft}
          onChange={setTakeawayDraft}
          rows={4}
        />
        <p className="text-muted-foreground text-sm">
          Whatever comes to mind. Your summary is ready and will be here as soon as you have written
          it.
        </p>
        <button
          type="button"
          onClick={() => void saveTakeaway()}
          disabled={savingTakeaway || takeawayDraft.trim().length === 0}
          className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium disabled:opacity-40"
        >
          {savingTakeaway ? 'Saving…' : 'Save and see my summary'}
        </button>
        {error !== null && (
          <p className="text-muted-foreground text-sm" role="status">
            {error} You can try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <SummaryView summary={summary} />

      {/*
        The warm close. A coach turn rather than fixed copy because it is the part that varies: by
        whether they already work with Rashmir, by whether they have done this before, and by what
        they just said they were taking away.
      */}
      <div className="border-border/70 border-t pt-8 print:hidden">
        {/*
          An explicit height, because this one is not the frame's own column: the summary scrolls
          above it and the sharing choices sit below, so the chat has to be a bounded box of its own
          or its transcript pushes the composer down the page (see `CoachChat`'s `className`).
        */}
        <CoachChat
          runId={runId}
          conversationId={conversationId}
          openMoment={coachOpenings.includes('phase-6-close') ? null : 'phase-6-close'}
          onTurnComplete={onAdvanced}
          className="border-border/60 h-[26rem] rounded-2xl border"
        />
      </div>

      <div className="border-border/70 flex flex-wrap gap-3 border-t pt-6 print:hidden">
        {/* F15. This used to be one button labelled "Download / print", which did neither: it opened
            the browser's print dialogue, from which a leader could reach "Save as PDF" if they knew
            to. There is no print stylesheet in the repository, so what came out carried whatever the
            screen had. The two are now separate and each does what it says. */}
        <DownloadReport runId={runId} />
        <button
          type="button"
          onClick={() => window.print()}
          className="border-border text-foreground hover:bg-muted rounded-full border px-6 py-2.5 text-sm"
        >
          Print this page
        </button>
        <button
          type="button"
          onClick={() => setWantShare((v) => !v)}
          className="border-border text-foreground hover:bg-muted rounded-full border px-6 py-2.5 text-sm"
        >
          {wantShare ? 'Hide sharing' : 'Share your results'}
        </button>
      </div>

      {wantShare && (
        <div className="border-border/70 bg-muted/30 space-y-5 rounded-2xl border px-6 py-5 print:hidden">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Sharing is entirely optional, and everything below is too. It helps Rashmir understand
            patterns across leaders, never used to identify you.
          </p>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publicLink}
              onChange={(e) => setPublicLink(e.target.checked)}
            />
            Create a link I can share
          </label>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withCoach}
              onChange={(e) => setWithCoach(e.target.checked)}
            />
            Share my results with Rashmir
          </label>
          <SelectField
            id="age-band"
            label="Age range (optional)"
            value={ageBand}
            onChange={setAgeBand}
            options={AGE_BANDS.map((b) => ({ value: b, label: b }))}
          />
          <div className="border-border/70 bg-muted/20 space-y-2 rounded-lg border p-4">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              What you said you were taking away
            </p>
            <p className="text-foreground text-[0.98rem] leading-relaxed">{takeawayValue}</p>
          </div>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={quotable}
              onChange={(e) => setQuotable(e.target.checked)}
            />
            Happy for this to be quoted anonymously
          </label>
          <button
            type="button"
            onClick={() => void saveShare()}
            disabled={busy}
            className="bg-primary text-primary-foreground rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save these choices'}
          </button>
          {shareLink && (
            <p className="text-muted-foreground text-sm">
              Your link:{' '}
              <a href={shareLink} className="text-primary underline underline-offset-4">
                {shareLink}
              </a>
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-muted-foreground text-sm" role="status">
          {error} You can try again.
        </p>
      )}

      {/* F8 t-3. Placed after the sharing choice and before finishing: the one moment the leader has
          just seen what the audit gave them. Collapsed by default — an invitation, not a nag (I16). */}
      <ReferralInvite />

      <div className="print:hidden">
        <button
          type="button"
          onClick={() => void finish()}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium disabled:opacity-50"
        >
          {busy ? 'Finishing…' : 'Finish my audit'}
        </button>
      </div>
    </div>
  );
}
