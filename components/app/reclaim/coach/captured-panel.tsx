'use client';

/**
 * What the coach has heard, beside the conversation.
 *
 * A form makes its state visible for free: the leader can see every field and what is in it. A
 * conversation makes none of it visible, and a conversation that is *writing an audit* has to, for two
 * reasons that are not the same.
 *
 * The first is progress. A leader in phase 3 has no way to know whether they are nearly through or
 * have barely started, and "how long is this" is the question the signpost line exists to answer.
 *
 * The second is the one that matters. The coach records inferences: a leader who says "most of my week
 * is meetings I did not call" has told it something about oversight hours without stating a figure, and
 * the capture tool takes that at lower confidence with `sourceType: 'inferred'`. An inference nobody
 * sees is a number in the leader's audit that they never said and cannot correct. So a reading that
 * came from between the lines is shown *as* an inference and offered back: confirming it records
 * `user_confirmed`, and correcting it writes the leader's own figure over the top. Every other reading
 * sits quietly, because a panel that shouts about a name it was told plainly is noise.
 *
 * The groups the coach may never write (sharing consent, the computed calendar lanes) are absent here
 * by construction: this panel renders `phaseCaptureSlots`, which is derived from the coach-writable
 * groups (I6).
 *
 * **The reflection has its own section, and it is the reason this panel now matters more.** The coach
 * records the reflection that closes a phase, which is a real transfer of authorship: a sentence that
 * gates the phase is being typed by something that is not the leader. What makes that honest is that
 * the leader can see the sentence, in their own words, at all times. So it sits apart from the
 * readings, always shown, whether or not the coach was confident.
 *
 * **It is shown, not edited.** This panel offers no box to type in — one route asks the question and
 * one route types it, and the leader chooses which. In the conversation the coach asks and the leader
 * answers; a leader who would rather write it themselves takes "I would rather fill this in myself"
 * and gets the phase panel's own reflection field. Putting a second textarea here would be the form
 * creeping back in beside the conversation the leader chose instead.
 */

import { useState } from 'react';
import { phaseCaptureSlots } from '@/lib/app/programme/coach/phase-slots';
import { reflectionSlugForPhase } from '@/lib/app/programme/runs/phases';
import { saveAnswer, type RunAnswers } from '@/components/app/reclaim/phase/actions';
import { truthy } from '@/lib/app/programme/chart/series';
import { inputClass } from '@/components/app/reclaim/phase/fields';

/** Below this, a reading is a guess worth checking rather than something the leader has settled. */
const CONFIDENCE_TO_CHECK = 7;

/** Whether a captured reading should be offered back before the audit relies on it. */
function worthChecking(answer: RunAnswers[string]): boolean {
  return answer.sourceType === 'inferred' || answer.confidence < CONFIDENCE_TO_CHECK;
}

export interface CapturedPanelProps {
  runId: string;
  phaseKey: string;
  /** The run's answers, as read by the parent. */
  answers: RunAnswers;
  /** The leader's own bucket labels, keyed by token (I7). */
  bucketLabels?: Record<string, string>;
  /** Re-read the run after a confirmation or correction lands. */
  onSaved: () => void;
  /**
   * A finished audit, read back rather than worked on.
   *
   * The confirm and correct affordances come off, because the server refuses a write to a run that is
   * not in progress (`assertActiveOwnedRun`) and an offer that can only fail is worse than no offer.
   * What stays is every reading, exactly as it was left.
   */
  readOnly?: boolean;
}

export function CapturedPanel({
  runId,
  phaseKey,
  answers,
  bucketLabels = {},
  onSaved,
  readOnly = false,
}: CapturedPanelProps) {
  const slots = phaseCaptureSlots(phaseKey, {
    fundraisingRelevant: truthy(answers['reclaim_setup_fundraising_relevant']),
    bucketLabels,
  });
  const reflectionSlug = reflectionSlugForPhase(phaseKey);
  if (slots.length === 0 && reflectionSlug === null) return null;

  const captured = slots.filter((s) => answers[s.slug] !== undefined);
  const toCheck = captured.filter((s) => worthChecking(answers[s.slug]));

  return (
    <aside
      className="border-border/60 space-y-5 rounded-2xl border px-5 py-5"
      aria-label="What the coach has recorded"
    >
      <div>
        <h2 className="text-foreground text-sm font-medium">What the coach has noted</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {captured.length} of {slots.length} in this phase.{' '}
          {readOnly
            ? 'This audit is finished, so these are as you left them.'
            : toCheck.length > 0
              ? 'A couple are worth a second look before we rely on them.'
              : 'You can change any of these by saying so.'}
        </p>
      </div>

      <ul className="space-y-4">
        {slots.map((slot) => {
          const answer = answers[slot.slug];
          if (answer === undefined) {
            return (
              <li key={slot.slug} className="text-muted-foreground/70 text-xs leading-relaxed">
                {slot.label}
              </li>
            );
          }
          return (
            <li key={slot.slug} className="space-y-1.5">
              <p className="text-muted-foreground text-xs">{slot.label}</p>
              {worthChecking(answer) && !readOnly ? (
                <UncertainReading
                  runId={runId}
                  slug={slot.slug}
                  dataType={slot.dataType}
                  value={answer.value}
                  onSaved={onSaved}
                />
              ) : (
                <p className="text-foreground text-sm leading-relaxed">{answer.value}</p>
              )}
            </li>
          );
        })}
      </ul>

      {reflectionSlug !== null && (
        <ReflectionCard value={answers[reflectionSlug]?.value ?? null} readOnly={readOnly} />
      )}
    </aside>
  );
}

/**
 * The leader's own noticing, as the coach recorded it — shown, never typed here.
 *
 * Not an `UncertainReading`: a reflection is never offered back with "have we got it right?", because
 * the leader has just said it out loud and being asked to verify their own sentence is the form
 * creeping back in. It is simply shown, in their words. Changing it belongs to the route that took it
 * — the coach, by being told, or the phase panel's reflection field for a leader who switched — so
 * this panel carries no box and no button. Before it exists, the panel says what is coming rather
 * than leaving a blank the leader has to interpret.
 */
function ReflectionCard({
  value,
  readOnly,
}: {
  value: string | null;
  /** A finished audit, so the empty case is a fact about the past rather than a question still coming. */
  readOnly: boolean;
}) {
  return (
    <div className="border-border/60 space-y-2 border-t pt-5">
      <p className="text-foreground text-sm font-medium">In your words</p>
      {value === null ? (
        <p className="text-muted-foreground/70 text-xs leading-relaxed">
          {readOnly
            ? 'Nothing was written here.'
            : 'What stands out to you here. The coach will ask before this phase closes, and what you say is kept here.'}
        </p>
      ) : (
        <p className="text-foreground text-sm leading-relaxed">{value}</p>
      )}
    </div>
  );
}

/**
 * One reading the coach took rather than was given, offered back.
 *
 * Confirming and correcting are two different facts, and the write keeps them apart: `confirming`
 * records `user_confirmed`, while a corrected value is the leader stating it, which is `direct`. A
 * structured reading (the energy windows, the gap summary) can be confirmed but not edited here —
 * there is no honest single-field editor for it, and the leader can simply say what is wrong.
 */
function UncertainReading({
  runId,
  slug,
  dataType,
  value,
  onSaved,
}: {
  runId: string;
  slug: string;
  dataType: string;
  value: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const commit = async (input: { value: string; valueJson?: unknown; confirming?: boolean }) => {
    setBusy(true);
    setFailed(false);
    try {
      await saveAnswer(runId, { slotSlug: slug, ...input });
      setEditing(false);
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  /** A corrected value carries its typed form, or the write is refused for a typed slot (I6). */
  const typed = (text: string): unknown => {
    if (dataType === 'number') {
      const n = Number(text.trim());
      return Number.isFinite(n) ? n : undefined;
    }
    if (dataType === 'boolean') return text.trim().toLowerCase() === 'yes';
    return undefined;
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <input
          type={dataType === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Your correction"
          className={inputClass}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy || draft.trim().length === 0}
            onClick={() => void commit({ value: draft.trim(), valueJson: typed(draft) })}
            className="text-primary text-xs underline underline-offset-4 disabled:opacity-40"
          >
            Save this instead
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            className="text-muted-foreground text-xs"
          >
            Leave it
          </button>
        </div>
        {failed && (
          <p className="text-muted-foreground text-xs" role="status">
            That did not save. You can try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border-primary/40 space-y-2 border-l-2 pl-3">
      <p className="text-foreground text-sm leading-relaxed">{value}</p>
      <p className="text-muted-foreground text-xs">
        Taken from what you said. Have we got it right?
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void commit({ value, confirming: true })}
          className="text-primary text-xs underline underline-offset-4 disabled:opacity-40"
        >
          Yes, that is right
        </button>
        {dataType !== 'json' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
          >
            Not quite
          </button>
        )}
      </div>
      {failed && (
        <p className="text-muted-foreground text-xs" role="status">
          That did not save. You can try again.
        </p>
      )}
    </div>
  );
}
