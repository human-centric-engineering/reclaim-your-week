/**
 * Per-phase signpost copy — the card that opens a phase (F4 t-4, extended for the conversational
 * surface). Entering a phase names it, says what it involves, gives a rough sense of how long, and
 * then **opens the phase itself**.
 *
 * **Why the opening is here rather than in a model turn.** The source is explicit that the tool
 * speaks first: "At the start of each new phase, briefly orient the client: tell them what phase they
 * are entering, what it involves, and approximately how long it will take"
 * (`sources/Time_Audit_Tool_Prompt_Text.md:31`). That is orientation, not coaching judgement, and the
 * source scripts it — so it costs no tokens, burns none of the leader's per-minute turn budget, and
 * cannot be invented differently each time. The four moments that genuinely need figures in front of
 * them (the Phase 1 picture, the gap, the action options, the takeaway) get a real coach turn
 * instead; see `coach/opening.ts`.
 *
 * **Structural orientation, not Rashmir's verbatim IP** — with one deliberate exception. Everything
 * here is our own framing copy, so I2 binds it (`product-voice.test.ts` lists this file as
 * coach-voiced): no em dashes, no banned lexicon, "we" only as the coach and the leader together.
 * The exception is `RECLAIM_PROCESS_OUTLINE` in phase 0's second beat, which is hers and is guarded
 * character-identical in I11 hop 2. That is why `opening` is an **array of paragraphs** rather than
 * one string: concatenating her outline with our warm open would fuse a guarded field into an
 * unguarded one, and hop 2 could no longer compare it against the source at all.
 *
 * These are the schema defaults for `Module.config.phaseSignposts`. Rashmir edits the stored row
 * through `/admin/programme/content`; the code defaults stay as shipped, which is what keeps I11's
 * chain of custody provable no matter what the stored config says.
 */

import { RECLAIM_PROCESS_OUTLINE } from '@/lib/app/programme/content';

export interface PhaseSignpost {
  /** Which phase this opens. */
  phaseKey: string;
  /** What this phase involves — one calm sentence. */
  involves: string;
  /** A rough sense of how long, never a countdown. */
  duration: string;
  /**
   * The opening beats, in order, one paragraph each. Read before the leader says anything.
   * An empty array is valid and means the phase opens on `involves` alone.
   */
  opening: string[];
}

/**
 * The warm open (`Prompt_Text.md:90` instructs it; the words are ours).
 *
 * Carries the register Brief §7 asks the whole product to hold: it is fine if the week is a mess, it
 * is fine if this one is atypical, nobody is judging. Says what they walk away with, because the
 * source says to, and stops short of promising an outcome the tool does not decide (I16).
 */
export const RECLAIM_WARM_OPEN =
  'Welcome. This is a guided look at where your time and your energy actually go, and what you might want to do differently. There is nothing to prepare and nothing here is a test. It is fine if this has been an unusual week, and it is fine if your week is not where you would like it to be yet. Knowing is the useful part.';

export const RECLAIM_PHASE_SIGNPOSTS: PhaseSignpost[] = [
  {
    phaseKey: 'phase-0-setup',
    involves: 'A little context about you and the weeks this audit looks at.',
    duration: 'a few minutes',
    opening: [RECLAIM_WARM_OPEN, RECLAIM_PROCESS_OUTLINE],
  },
  {
    phaseKey: 'phase-1-current',
    involves: 'A methodical look at where your time goes now, area by area.',
    duration: 'around fifteen minutes',
    opening: [
      'Now we look at where your time actually goes, one area at a time. The areas are listed beside this conversation so you can hold the whole map while we work through them.',
      'Rough figures are what we want. Most leaders are estimating here, and an estimate you can talk about is worth more than a number you laboured over.',
    ],
  },
  {
    phaseKey: 'phase-2-energy',
    involves: 'Which of that work gives you energy, and which drains it.',
    duration: 'around ten minutes',
    opening: [
      'A short section, and a load-bearing one. When in the week you do a piece of work turns out to matter nearly as much as how long you spend on it.',
    ],
  },
  {
    phaseKey: 'phase-3-ideal',
    involves: 'The shape of a week that would let you lead with more ease.',
    duration: 'around ten minutes',
    opening: [
      'Now we design the week you would want, grounded in what you have just seen about your energy and your priorities. A realistic target rather than a fantasy: something you could actually live in.',
    ],
  },
  {
    phaseKey: 'phase-4-gap',
    involves: 'What sits between the week you have and the one you pictured.',
    duration: 'around ten minutes',
    opening: ['Now we put those two weeks side by side and look at what sits between them.'],
  },
  {
    phaseKey: 'phase-5-action',
    involves: 'A few specific places to begin, small and yours to choose.',
    duration: 'around ten minutes',
    opening: [
      'A few specific places you could begin, each a different way in. You choose which one, or none, or something else entirely.',
    ],
  },
  {
    phaseKey: 'phase-6-summary',
    involves: 'What you are taking from this, gathered in one place to keep.',
    duration: 'a few minutes',
    opening: [
      'Before the written summary, one last question, and it is the one that matters most. What are you taking away from this?',
    ],
  },
];

/**
 * The signpost for a phase, from a list that may be the stored config or the shipped defaults.
 *
 * Returns `null` for an unknown phase rather than throwing: the config is operator-editable, so a
 * phase whose entry was deleted should quietly lose its card, never break the leader's screen.
 */
export function signpostFor(
  phaseKey: string,
  signposts: PhaseSignpost[] = RECLAIM_PHASE_SIGNPOSTS
): PhaseSignpost | null {
  return signposts.find((s) => s.phaseKey === phaseKey) ?? null;
}
