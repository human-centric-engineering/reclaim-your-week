'use client';

/**
 * Finishing, and saying what finishing does.
 *
 * ## The button that explained nothing
 *
 * "Finish my audit" sat at the foot of the screen looking exactly like the three controls above it,
 * and it is the only one on the page that changes anything permanently: it completes the run, closes
 * the conversation (I15) and consumes the grant that let this audit happen (I14). A leader could not
 * tell from the screen whether pressing it would delete their report, end their access, or simply
 * tidy up — which is why they asked.
 *
 * So the consequences are written down, in the three sentences that are actually true:
 *
 *  1. **The report stays.** It is on their history, downloadable, for as long as they have an
 *     account. This is the fear the button's wording invites and the one worth answering first.
 *  2. **The conversation closes.** No more turns; the coach is done. Reversible only by starting a
 *     new audit, which is a different audit.
 *  3. **Sharing choices stay changeable** through the panel above until they finish, and finishing
 *     is what marks the run complete.
 *
 * ## Why it is not a confirmation dialogue
 *
 * A modal that asks "are you sure?" moves the explanation to the moment *after* the decision, which
 * is the wrong order and trains people to dismiss it. The explanation belongs beside the button,
 * where it can be read before anything is pressed. The action is also not destructive — nothing is
 * deleted — so a guard rail would be theatre.
 */

import { useState } from 'react';

import { completeAudit } from '@/components/app/reclaim/phase/actions';

export function FinishAudit({ runId, onFinished }: { runId: string; onFinished: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeAudit(runId);
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <section className="border-border/70 border-t pt-8 print:hidden">
      <h2 className="text-foreground text-xl leading-snug font-light">When you are ready</h2>
      <div className="text-muted-foreground mt-3 max-w-xl space-y-2 text-sm leading-relaxed">
        <p>
          Finishing marks this audit complete and closes the conversation with the coach, so there
          will be no more questions.
        </p>
        <p>
          <span className="text-foreground">Your report is not going anywhere.</span> It stays in
          your history, and you can come back and download it whenever you like.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void finish()}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Finishing…' : 'Finish my audit'}
        </button>
        {error && (
          <p className="text-muted-foreground text-sm" role="status">
            {error} You can try again.
          </p>
        )}
      </div>
    </section>
  );
}
