'use client';

/**
 * The composer, for a question that has answers.
 *
 * Most of this audit is answered in the leader's own words, and the text box is right for that. Some
 * of it is not: which period is being audited, whether fundraising is part of the role, whether there
 * is a protected block in the day. Those have a fixed set of answers, the form panel has always shown
 * them, and the conversation used to put the same question above an empty box and leave the leader to
 * guess the wording. This is what stands in the box's place when the coach has said the question is
 * one of those.
 *
 * ## It wears the composer's own frame, and that is the design
 *
 * The first cut drew the answers bare, directly onto the footer. They landed in the gap under the
 * "continue" button and read as a third row of chrome rather than as the place to answer: three
 * competing things in one band, none of them obviously the one being asked for. So the control keeps
 * **the same bordered frame, radius and width as the text box it replaces**. The eye never loses the
 * place where answering happens; what changes inside it is only whether the answer is written or
 * taken. A leader watching the swap sees one object change state, not a box disappear and some
 * buttons appear somewhere near where it was.
 *
 * Three things follow from that frame, and each fixes something the bare row got wrong:
 *
 *  - **An eyebrow says what to do.** "Choose one", in the small tracked capitals this app already
 *    uses to label a section (the signpost, phase 4, the calendar review). Native vocabulary, so it
 *    reads as part of the product rather than as an instruction bolted to a widget.
 *  - **The way out sits opposite it**, on the same line, where the text box keeps its Send button. The
 *    two states then balance the same way: what you are doing on the left, what else you could do on
 *    the right.
 *  - **The answers are centred and given room.** Four short pills left-aligned in a column this wide
 *    trail off and leave the right half empty. Centred, with the frame around them, they read as a
 *    set being offered.
 *
 * ## Answering is one tap, and what it sends is a turn
 *
 * The choice goes into the transcript in the leader's own column exactly as though they had typed it,
 * and the coach records it from what they said, through the path every other answer takes (I3).
 * Nothing is written to a slot because a button was drawn: the button is a way of speaking, not a way
 * of storing.
 *
 * ## And it never closes the question
 *
 * Pills, not a dropdown with a submit: the answers are short, there are rarely more than four, and a
 * leader should be able to see all of them and the way past them at once. "Say it in your own words"
 * puts the text box back, because the set is what the audit expects and not what the leader is
 * allowed. Someone auditing the last six weeks says so. Taking that way out is also **reversible** —
 * the offer is not discarded, and the parent keeps a way back to it, because a leader who opens the
 * text box to reconsider and then decides "last quarter" was right after all should not have to ask
 * the coach to offer the answers again.
 */

import { useEffect, useState } from 'react';
import type { ChoiceOffer } from '@/components/app/reclaim/coach/choices';

/**
 * How far apart the answers arrive, in milliseconds.
 *
 * Small enough to be over before anyone could call it a delay, large enough that the set reads as
 * being laid out rather than snapping into place. It is the one moment of motion this control has,
 * and it earns its place: the answers appear *after* the coach's question has finished being spoken,
 * so arriving in sequence is what makes them read as an offer following the question rather than as
 * chrome that was there all along.
 */
const STAGGER_MS = 45;

export interface ChoiceComposerProps {
  offer: ChoiceOffer;
  /** Send this answer as a leader turn. */
  onPick: (answer: string) => void;
  /** Put the text box back for this turn, without discarding the offer. */
  onDismiss: () => void;
  /** True while a turn is in flight, so a second answer cannot be sent on top of the first. */
  disabled?: boolean;
}

export function ChoiceComposer({
  offer,
  onPick,
  onDismiss,
  disabled = false,
}: ChoiceComposerProps) {
  /**
   * Whether the answers have been let in yet.
   *
   * Flipped on the frame after mount so the transition has two states to move between; a value that
   * started true would render the finished position and animate nothing. Under
   * `prefers-reduced-motion` the transition is off and this flip simply reveals them at once, which
   * is the correct reading of that preference rather than a degraded one.
   */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    // The text box's own frame: same radius, same hairline, same width. See the header for why the
    // control keeps it rather than drawing the answers bare onto the footer.
    <div className="border-border bg-background rounded-2xl border px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-4">
        {/* The advisory. Small tracked capitals are how this app labels a section, so "choose one"
            arrives in the product's own voice instead of as a widget's caption. */}
        <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
          Choose one
        </p>
        {/* Opposite the advisory, where the text box keeps its Send: the other thing you could do. */}
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-4 transition-colors disabled:opacity-40"
        >
          Say it in your own words
        </button>
      </div>

      {/* `group` rather than `radiogroup`: nothing here holds a selected state, because a press is
          the answer being sent. A radio group would promise a choice the leader could revise before
          committing, and this one goes the moment it is touched. The label names the reading in the
          words the panel uses, so a screen reader hears what is being answered rather than four bare
          options under a paragraph it has already read. */}
      <div
        role="group"
        aria-label={`${offer.label}: choose an answer, or say it in your own words`}
        className="mt-4 flex flex-wrap justify-center gap-2.5"
      >
        {offer.options.map((option, index) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option)}
            // Delay by position, so the set is laid out left to right. Inline because the count is
            // not known until the offer arrives, and a class per index would be four arbitrary
            // utilities that exist only to hold a number.
            style={{ transitionDelay: settled ? `${index * STAGGER_MS}ms` : '0ms' }}
            // The pill the form panel's own Yes/No wears, at the composer's size, so a leader who
            // switches between the two paths mid-audit does not meet two vocabularies for the same
            // choice. The hover is `accent`, the token this palette defines as barely-there teal for
            // exactly this: the brand shows as a touch rather than a wash.
            className={`border-border hover:border-primary/50 hover:bg-accent hover:text-primary focus-visible:ring-ring/40 focus-visible:ring-offset-background rounded-full border px-5 py-2.5 text-[0.95rem] transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] disabled:opacity-40 motion-reduce:transition-none ${
              settled ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
