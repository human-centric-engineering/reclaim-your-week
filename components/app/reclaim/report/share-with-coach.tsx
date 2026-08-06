'use client';

/**
 * Sharing the report with Rashmir — the only sharing this product does.
 *
 * ## What this used to be
 *
 * A collapsed panel called "Share your results" holding four unexplained tickboxes, the first of
 * which minted an **unrevokable public link** to the most personal document the product makes. That
 * link is gone (`share.ts` says why), and what is left is one question about one person: may she
 * read this.
 *
 * ## Consent needs the consequence attached
 *
 * Every choice here states what happens if it is ticked, in the same sentence, in plain words. Brief
 * §3 asks for sharing to be invited and never required; an invitation with the consequence left off
 * is not an invitation, it is a form. So:
 *
 *  - **The report** — she can read it and talk it through with you.
 *  - **The conversation** (F17) — its own question, indented under its parent, because a summary is
 *    not the exchange that produced it. Unticking the parent withdraws it, here and on the server.
 *  - **The quote consent** — separate again, and only asked when there is a sentence to quote.
 *
 * Nothing is ticked by default and nothing here is required to finish.
 *
 * ## Why the age band is still asked, and asked last
 *
 * It is the one thing on this panel that is not for the leader: it helps Rashmir see patterns across
 * leaders. It sits at the bottom, marked optional, after the choices that are actually theirs.
 */

import { useState } from 'react';

import { SelectField } from '@/components/app/reclaim/phase/fields';
import { shareSummary, type ShareInput } from '@/components/app/reclaim/phase/actions';

const AGE_BANDS = ['Prefer not to say', 'Under 35', '35–44', '45–54', '55–64', '65+'];

export interface ShareWithCoachProps {
  runId: string;
  /** Their takeaway, where the coach recorded one. Governs whether quoting is even asked about. */
  takeaway: string;
}

export function ShareWithCoach({ runId, takeaway }: ShareWithCoachProps) {
  const [withCoach, setWithCoach] = useState(false);
  const [shareTranscript, setShareTranscript] = useState(false);
  const [ageBand, setAgeBand] = useState('');
  const [quotable, setQuotable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: ShareInput = {
        withCoach,
        // Withdrawn with its parent: letting her read the exchange but not the report it produced is
        // a state nobody asked for, and the server enforces the same rule.
        shareTranscript: withCoach && shareTranscript,
        ageBand: ageBand && ageBand !== 'Prefer not to say' ? ageBand : undefined,
        // Reuses what they already wrote rather than asking a near-identical question twice. The
        // audit asks the takeaway of everyone before the report; Brief §3 asks sharers for "in a
        // sentence, what did you take from this?" afterwards. Asking both verbatim reads as a
        // repeat, so this panel carries their saved answer and asks only for permission to quote it.
        takeaway: takeaway.trim() || undefined,
        quotable,
      };
      await shareSummary(runId, input);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-border/70 bg-card rounded-2xl border px-7 py-6 print:hidden">
      <h2 className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.22em] uppercase">
        If you would like her to see it
      </h2>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        Sharing is entirely optional and nothing below is required to finish. Your report is yours
        either way, and there is no public link to it anywhere.
      </p>

      <div className="mt-6 space-y-5">
        {/*
          The consequence sits *outside* the label rather than inside it, and that is deliberate
          twice over: a paragraph this long should not be a click target for a consent tickbox, and
          the label's own text stays one short line, which is what a screen reader announces.
        */}
        <div>
          <label htmlFor="share-with-coach" className="flex cursor-pointer items-start gap-3">
            <input
              id="share-with-coach"
              type="checkbox"
              checked={withCoach}
              onChange={(e) => {
                setWithCoach(e.target.checked);
                setSaved(false);
              }}
              className="accent-primary mt-1 h-4 w-4"
            />
            <span className="text-foreground text-[0.98rem]">Share my report with Rashmir</span>
          </label>
          <p className="text-muted-foreground mt-1.5 ml-7 text-sm leading-relaxed">
            She will be able to read this report and talk it through with you. It appears in her
            client list, alongside your name, so she knows the week she is looking at is yours.
          </p>
        </div>

        {withCoach && (
          <div className="ml-7">
            <label htmlFor="share-transcript" className="flex cursor-pointer items-start gap-3">
              <input
                id="share-transcript"
                type="checkbox"
                checked={shareTranscript}
                onChange={(e) => {
                  setShareTranscript(e.target.checked);
                  setSaved(false);
                }}
                className="accent-primary mt-1 h-4 w-4"
              />
              <span className="text-foreground text-[0.98rem]">
                She may also read our conversation, not only the report
              </span>
            </label>
            <p className="text-muted-foreground mt-1.5 ml-7 text-sm leading-relaxed">
              Everything you typed, in the order you typed it, including the parts you went back on.
              Leave this unticked and she sees the report only. You can change your mind here at any
              time.
            </p>
          </div>
        )}

        {takeaway.trim().length > 0 && (
          <div className="space-y-3 pt-1">
            <div className="border-border/70 bg-muted/50 rounded-xl border px-5 py-4">
              <p className="text-muted-foreground text-[0.65rem] font-medium tracking-[0.18em] uppercase">
                What you said you were taking away
              </p>
              <p className="text-foreground mt-2 leading-relaxed">{takeaway}</p>
            </div>
            <div>
              <label htmlFor="share-quotable" className="flex cursor-pointer items-start gap-3">
                <input
                  id="share-quotable"
                  type="checkbox"
                  checked={quotable}
                  onChange={(e) => {
                    setQuotable(e.target.checked);
                    setSaved(false);
                  }}
                  className="accent-primary mt-1 h-4 w-4"
                />
                <span className="text-foreground text-[0.98rem]">
                  This sentence may be quoted anonymously
                </span>
              </label>
              <p className="text-muted-foreground mt-1.5 ml-7 text-sm leading-relaxed">
                Just this line, never your name and never anything else from your audit.
              </p>
            </div>
          </div>
        )}

        <div className="border-border/60 border-t pt-5">
          <SelectField
            id="age-band"
            label="Age range (optional)"
            value={ageBand}
            onChange={(v) => {
              setAgeBand(v);
              setSaved(false);
            }}
            options={AGE_BANDS.map((b) => ({ value: b, label: b }))}
          />
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Only used to understand patterns across leaders, never to identify you.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save these choices'}
        </button>
        {/* The fact, not a cheer. A leader who ticks nothing and saves has also made a choice, and
            telling them it is recorded is the honest answer to the button they just pressed. */}
        {saved && !busy && (
          <p className="text-muted-foreground text-sm" role="status">
            {withCoach
              ? 'Saved. Rashmir can see this report.'
              : 'Saved. This report has not been shared.'}
          </p>
        )}
        {error && (
          <p className="text-muted-foreground text-sm" role="status">
            {error} You can try again.
          </p>
        )}
      </div>
    </section>
  );
}
