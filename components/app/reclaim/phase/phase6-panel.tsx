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
import { ReferralInvite } from '@/components/app/reclaim/referral-invite';
import { TextAreaField, SelectField } from '@/components/app/reclaim/phase/fields';
import {
  fetchSummary,
  shareSummary,
  completeAudit,
  type ShareInput,
} from '@/components/app/reclaim/phase/actions';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';

const AGE_BANDS = ['Prefer not to say', 'Under 35', '35–44', '45–54', '55–64', '65+'];

export function Phase6Panel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [wantShare, setWantShare] = useState(false);
  const [withCoach, setWithCoach] = useState(false);
  const [publicLink, setPublicLink] = useState(false);
  const [ageBand, setAgeBand] = useState('');
  const [takeaway, setTakeaway] = useState('');
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

  const saveShare = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: ShareInput = {
        publicLink,
        withCoach,
        ageBand: ageBand && ageBand !== 'Prefer not to say' ? ageBand : undefined,
        takeaway: takeaway.trim() || undefined,
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
          . No pressure — the work is yours.
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

  return (
    <div className="space-y-10">
      <SummaryView summary={summary} />

      <div className="border-border/70 flex flex-wrap gap-3 border-t pt-6 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="border-border text-foreground hover:bg-muted rounded-full border px-6 py-2.5 text-sm"
        >
          Download / print
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
            patterns across leaders — never used to identify you.
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
          <TextAreaField
            id="takeaway"
            label="In a sentence: what did you take from this? (optional)"
            value={takeaway}
            onChange={setTakeaway}
            rows={2}
          />
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
