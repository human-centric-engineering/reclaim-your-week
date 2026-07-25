/**
 * Per-phase signpost copy for the shell (F4 t-4, content-source §5d / G10). Entering a phase names it,
 * says what it involves, and gives a rough sense of how long — so the process never feels open-ended.
 *
 * **Structural orientation, not Rashmir's verbatim IP.** These are neutral framing lines the shell
 * shows to place the leader; the phase *content* (her voice, the questions, the wording) lands in
 * F6/F7 and is loaded verbatim (I11). F6/F7 refine these against §5d; the durations are rough bands.
 * Kept plain and unhurried — never a productivity register (I-frame), never a verdict (I16).
 */

export interface PhaseSignpost {
  /** What this phase involves — one calm sentence. */
  involves: string;
  /** A rough sense of how long, never a countdown. */
  duration: string;
}

export const PHASE_SIGNPOSTS: Readonly<Record<string, PhaseSignpost>> = {
  'phase-0-setup': {
    involves: 'A little context about you and the weeks this audit looks at.',
    duration: 'a few minutes',
  },
  'phase-1-current': {
    involves: 'An honest look at where your time goes now, area by area.',
    duration: 'around fifteen minutes',
  },
  'phase-2-energy': {
    involves: 'Which of that work gives you energy, and which quietly takes it.',
    duration: 'around ten minutes',
  },
  'phase-3-ideal': {
    involves: 'The shape of a week that would let you lead with more ease.',
    duration: 'around ten minutes',
  },
  'phase-4-gap': {
    involves: 'What sits between the week you have and the one you pictured.',
    duration: 'around ten minutes',
  },
  'phase-5-action': {
    involves: 'A few specific places to begin — small, and yours to choose.',
    duration: 'around ten minutes',
  },
  'phase-6-summary': {
    involves: 'What you are taking from this, gathered in one place to keep.',
    duration: 'a few minutes',
  },
};
