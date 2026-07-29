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
 * ## Three readings, and the eye has to be able to tell them apart
 *
 * Every slot this phase captures is on the list whether or not it has been answered, which is what
 * makes the list a *worklist* rather than a receipt. But that only helps if the three states — not yet
 * asked, recorded and settled, recorded but only guessed at — are separable at a glance. They were
 * not: an unanswered slot was a dimmer line of the same shape, and the whole list ran together as one
 * grey column. So each reading is now a row with a hairline between it and the next, a two-pixel rail
 * whose colour carries its state, and — for the ones the coach guessed — a soft band and a word.
 *
 * `Inferred` and `Unsure` are two different admissions and are labelled as two. Inferred means the
 * coach was never told this and read it between the lines. Unsure means it *was* told, and did not
 * trust its own hearing. A leader deciding whether to bother correcting something needs to know which.
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

import { useCallback, useState } from 'react';
import {
  phaseCaptureSlots,
  slotApplies,
  type PhaseSlot,
} from '@/lib/app/programme/coach/phase-slots';
import { reflectionSlugForPhase } from '@/lib/app/programme/runs/phases';
import { saveAnswer, type RunAnswers } from '@/components/app/reclaim/phase/actions';
import { truthy } from '@/lib/app/programme/chart/series';
import { inputClass } from '@/components/app/reclaim/phase/fields';
// The shared "there is no value here" mark, so I2's em-dash ban stays zero-tolerance: an unanswered
// row needs a placeholder, and a guard cannot tell a typographic one from a dash in a sentence.
import { NO_VALUE } from '@/components/app/reclaim/format';

/** Below this, a reading is a guess worth checking rather than something the leader has settled. */
const CONFIDENCE_TO_CHECK = 7;

/** Whether a captured reading should be offered back before the audit relies on it. */
function worthChecking(answer: RunAnswers[string]): boolean {
  return answer.sourceType === 'inferred' || answer.confidence < CONFIDENCE_TO_CHECK;
}

/**
 * How a reading stands, which is the one thing the rows are drawn from.
 *
 * `open` — nothing recorded, so the question has not been reached yet.
 * `settled` — the leader said it, and the coach believed them.
 * `checking` — recorded, but on a guess: either inferred or heard without confidence.
 * `na` — this reading was never for this leader, so nobody is going to ask it.
 *
 * **`na` is the one that had to be added, and the reason is what a blank row means.** Some readings
 * only apply given an earlier answer: "Development team, or you" is asked only of a leader whose role
 * includes fundraising. The coach is told so on its own list, and the move-onward button already
 * excludes them from what it waits for (`phase-conversation.tsx`) — but this panel drew them exactly
 * like a question nobody had reached yet, a dimmed label over a dash, and counted them in the total.
 * So a leader who answered no to fundraising watched "13 of 15" sit there beside two blanks and read
 * it, correctly by everything they could see, as two questions the coach had skipped. The state is
 * derived from the same `slotApplies` the coach and the button read, so all three now say the same
 * thing about the same reading.
 */
type ReadingState = 'open' | 'settled' | 'checking' | 'na';

function readingState(
  slot: PhaseSlot,
  answers: RunAnswers,
  answer: RunAnswers[string] | undefined
): ReadingState {
  if (answer !== undefined) return worthChecking(answer) ? 'checking' : 'settled';
  // Only ever `false` decides it. An unanswered condition is `undefined` — nobody has asked the
  // question this one hangs off yet, so it stays open, which is what it is.
  return slotApplies(slot.askOnlyIf, answers) === false ? 'na' : 'open';
}

/**
 * The rail down the left of each row — the whole of the filled/unfilled signal, in two pixels.
 *
 * Colour rather than presence, so every row keeps the same indent and the list stays a column instead
 * of a ragged edge. Teal for what is settled (the brand's one confident accent), cream for what is
 * being checked (where this palette puts emphasis), and the hairline border tone for what has not
 * been asked — which reads as an empty slot in a track rather than as a thing gone wrong.
 */
const RAIL: Record<ReadingState, string> = {
  open: 'bg-border',
  settled: 'bg-primary/45',
  checking: 'bg-secondary',
  // Fainter than open, because it is less than an empty slot in the track: it is a slot that was
  // never going to be filled, and the eye should pass over it rather than stop.
  na: 'bg-border/40',
};

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
   * Hand a guessed reading back to the conversation, rather than settling it here.
   *
   * The third move on an uncertain reading, and the only one that is not a write: confirming and
   * correcting both end the question, and some readings are not ready to be ended — a leader who
   * cannot tell whether "20 hours of oversight" is right needs to be asked about it properly, not
   * given a box. Omitted (the finished audit, a test) simply drops the offer.
   */
  onDiscuss?: (slot: PhaseSlot) => void;
  /**
   * A finished audit, read back rather than worked on.
   *
   * The confirm and correct affordances come off, because the server refuses a write to a run that is
   * not in progress (`assertActiveOwnedRun`) and an offer that can only fail is worse than no offer.
   * What stays is every reading, exactly as it was left — including the badge saying which of them the
   * coach guessed, because that is a fact about the audit and not an invitation to change it.
   */
  readOnly?: boolean;
}

export function CapturedPanel({
  runId,
  phaseKey,
  answers,
  bucketLabels = {},
  onSaved,
  onDiscuss,
  readOnly = false,
}: CapturedPanelProps) {
  const slots = phaseCaptureSlots(phaseKey, {
    fundraisingRelevant: truthy(answers['reclaim_setup_fundraising_relevant']),
    bucketLabels,
  });
  const reflectionSlug = reflectionSlugForPhase(phaseKey);
  if (slots.length === 0 && reflectionSlug === null) return null;

  const states = slots.map((slot) => readingState(slot, answers, answers[slot.slug]));
  const captured = states.filter((s) => s === 'settled' || s === 'checking').length;
  const checking = states.filter((s) => s === 'checking').length;
  // The count is out of what this leader will actually be asked. A denominator that includes readings
  // nobody is going to ask can never be reached, and a progress line that cannot reach its own total
  // is telling them something is outstanding when nothing is.
  const asked = states.filter((s) => s !== 'na').length;

  return (
    <aside
      className="border-border/60 bg-background overflow-hidden rounded-2xl border"
      aria-label="What the coach has recorded"
    >
      <div className="border-border/60 space-y-3 border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-medium">What the coach has noted</h2>

        {/* The phase as a track: one segment per reading, in the order they are asked. It answers
            "how much of this is left" before a word is read, which is the question the panel exists
            for, and it puts the guessed readings somewhere the eye lands rather than leaving them to
            be found by scrolling. */}
        {slots.length > 0 && (
          <div className="flex gap-px" aria-hidden="true">
            {states.map((state, i) => (
              <span key={slots[i].slug} className={`h-1 flex-1 rounded-full ${RAIL[state]}`} />
            ))}
          </div>
        )}

        <p className="text-muted-foreground text-xs leading-relaxed">
          {captured} of {asked} in this section.{' '}
          {readOnly
            ? 'This audit is finished, so these are as you left them.'
            : checking > 0
              ? `${checking === 1 ? 'One is' : `${checking} are`} marked for a second look, because the coach is not certain it has ${checking === 1 ? 'it' : 'them'} right.`
              : 'You can change any of these by saying so.'}
        </p>
      </div>

      <ul className="divide-border/50 divide-y">
        {slots.map((slot) => {
          const answer = answers[slot.slug];
          const state = readingState(slot, answers, answer);
          return (
            <li
              key={slot.slug}
              className={`flex gap-3 px-5 py-3 ${state === 'checking' ? 'bg-muted/60' : ''}`}
            >
              <span aria-hidden="true" className={`w-[2px] shrink-0 rounded-full ${RAIL[state]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-xs leading-relaxed ${
                      state === 'open' || state === 'na'
                        ? 'text-muted-foreground/60'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {slot.label}
                  </p>
                  {state === 'checking' && answer !== undefined && (
                    <Provenance inferred={answer.sourceType === 'inferred'} />
                  )}
                </div>

                {state === 'na' ? (
                  // Said in words rather than left as a dash, because a dash is what an unanswered
                  // row looks like and this is not one. It reads as an answer the leader has already
                  // given — they said fundraising is not part of their role, so this one went away —
                  // rather than as something still owed.
                  <p className="text-muted-foreground/60 mt-0.5 text-sm">
                    Not needed, from what you have told us
                  </p>
                ) : answer === undefined ? (
                  // The empty state gets a mark of its own rather than nothing, so a row that has not
                  // been reached is visibly a row and not a gap in the list.
                  <p className="text-muted-foreground/40 mt-0.5 text-sm">
                    <span aria-hidden="true">{NO_VALUE}</span>
                    <span className="sr-only">Not yet noted</span>
                  </p>
                ) : state === 'checking' && !readOnly ? (
                  <UncertainReading
                    runId={runId}
                    slot={slot}
                    inferred={answer.sourceType === 'inferred'}
                    value={answer.value}
                    onSaved={onSaved}
                    onDiscuss={onDiscuss}
                  />
                ) : (
                  <p className="text-foreground mt-0.5 text-sm leading-relaxed">{answer.value}</p>
                )}
              </div>
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
 * Which kind of guess this is, in one word.
 *
 * Two states, because they are two different admissions and they call for different things from the
 * leader. **Inferred**: the coach was never told this and read it out of something the leader said
 * around it — worth a proper look, because it may be a figure they never gave. **Unsure**: it was
 * told, and did not trust that it caught it — usually right, occasionally a mishearing.
 *
 * Cream on cream-dark, which is where this palette puts emphasis: it is the only place on the panel
 * that is not teal or ink, so it reads as a flag without reading as an error. Nothing here is wrong;
 * it is just not confirmed.
 */
function Provenance({ inferred }: { inferred: boolean }) {
  return (
    <span className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium tracking-wide uppercase">
      {inferred ? 'Inferred' : 'Unsure'}
    </span>
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
    <div className="border-border/60 space-y-2 border-t px-5 py-4">
      <p className="text-foreground text-sm font-medium">In your words</p>
      {value === null ? (
        <p className="text-muted-foreground/70 text-xs leading-relaxed">
          {readOnly
            ? 'Nothing was written here.'
            : 'What stands out to you here. The coach will ask before this section closes, and what you say is kept here.'}
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
 *
 * **The third move is the new one, and it is not a write.** "Talk it over" hands the reading back
 * to the conversation. A leader who cannot tell whether the coach's guess is right does not want a
 * text box — they want to be asked about it, which is the whole reason this surface is a conversation
 * and not the form it replaced. So the panel says so in the leader's own column of the transcript and
 * lets the coach do what it is for.
 */
function UncertainReading({
  runId,
  slot,
  inferred,
  value,
  onSaved,
  onDiscuss,
}: {
  runId: string;
  slot: PhaseSlot;
  /** Read between the lines, rather than heard and doubted — it changes what we say about it. */
  inferred: boolean;
  value: string;
  onSaved: () => void;
  onDiscuss?: (slot: PhaseSlot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * Focus follows the press of "Not quite", which is the leader asking for this field — not a
   * page-load grab, which is what the `autoFocus` rule guards against. Without it the correction
   * costs two clicks, and the second is a hunt for a box that has just appeared under the cursor.
   *
   * Stable, so it fires when the field mounts and not again on every keystroke.
   */
  const takeFocus = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
  }, []);

  const commit = async (input: { value: string; valueJson?: unknown; confirming?: boolean }) => {
    setBusy(true);
    setFailed(false);
    try {
      await saveAnswer(runId, { slotSlug: slot.slug, ...input });
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
    if (slot.dataType === 'number') {
      const n = Number(text.trim());
      return Number.isFinite(n) ? n : undefined;
    }
    if (slot.dataType === 'boolean') return text.trim().toLowerCase() === 'yes';
    return undefined;
  };

  if (editing) {
    return (
      <div className="mt-1.5 space-y-2">
        <input
          ref={takeFocus}
          type={slot.dataType === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Your correction"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
            className="text-muted-foreground hover:text-foreground text-xs"
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
    <div className="mt-0.5 space-y-2">
      <p className="text-foreground text-sm leading-relaxed">{value}</p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {inferred
          ? 'Taken from what you said around it, not from something you told us. Have we got it right?'
          : 'We heard this, but were not sure of it. Have we got it right?'}
      </p>
      {/*
        The three answers, on one line at the drawer's resting width.

        They wrapped, and a wrapped row reads as two kinds of thing: "that is right / not quite" on
        one line and "talk it over" orphaned below looked like the third was a different sort of
        action rather than the third answer to the same question. There are 224px to work in at
        20rem (320 drawer, less the 12px grip, 28px of column padding, 40px of row padding and the
        14px rail-and-gap), and the old labels wanted about 250. So they are shorter — "Yes, that is
        right" loses its "Yes," to the question directly above it, which already asked, and "talk
        this through" becomes "talk it over" — and the gap is 8px rather than 12.

        `whitespace-nowrap` so a label never breaks inside itself, and `flex-wrap` stays as the
        safety net: at a larger text size this should fall to two lines rather than clip.
      */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void commit({ value, confirming: true })}
          className="text-primary text-xs whitespace-nowrap underline underline-offset-4 disabled:opacity-40"
        >
          That is right
        </button>
        {slot.dataType !== 'json' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground text-xs whitespace-nowrap underline underline-offset-4"
          >
            Not quite
          </button>
        )}
        {onDiscuss !== undefined && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDiscuss(slot)}
            aria-label={`Talk through ${slot.label} with the coach`}
            className="text-muted-foreground hover:text-foreground text-xs whitespace-nowrap underline underline-offset-4"
          >
            Talk it over
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
