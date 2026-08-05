/**
 * The coach-opening moments and the synthetic trigger.
 *
 * Small pure module, but two of these assertions are load-bearing in a way the code cannot express on
 * its own: the moment-to-phase map is what the route refuses on, and the trigger list is what keeps a
 * message the leader never wrote out of their own transcript.
 */

import { describe, it, expect } from 'vitest';
import {
  ARRIVAL_MOMENTS,
  COACH_ARRIVAL_TRIGGER,
  COACH_OPENING_MOMENTS,
  COACH_OPENING_PHASES,
  COACH_OPENING_TRIGGER,
  COACH_RESUME_TRIGGER,
  COACH_SYNTHETIC_MESSAGES,
  arrivalMomentFor,
  isArrivalMoment,
  isCoachSyntheticMessage,
  openingBelongsToPhase,
  openingTriggerFor,
} from '@/lib/app/programme/coach/opening';
import { FINAL_PHASE_KEY, RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';

describe('the moments', () => {
  it('every moment names a phase the map actually has', () => {
    // A moment pointing at a phase key that does not exist would be unreachable: the route compares
    // it against the journey's phase and would refuse it forever, silently.
    for (const moment of COACH_OPENING_MOMENTS) {
      expect(RECLAIM_PHASE_KEYS).toContain(COACH_OPENING_PHASES[moment]);
    }
  });

  it('matches a moment only to its own phase', () => {
    expect(openingBelongsToPhase('phase-4-gap', 'phase-4-gap')).toBe(true);
    expect(openingBelongsToPhase('phase-4-gap', 'phase-1-current')).toBe(false);
    expect(openingBelongsToPhase('phase-1-chart-reveal', 'phase-1-current')).toBe(true);
    expect(openingBelongsToPhase('phase-1-chart-reveal', 'phase-4-gap')).toBe(false);
  });

  it('has no duplicate moment names', () => {
    expect(new Set(COACH_OPENING_MOMENTS).size).toBe(COACH_OPENING_MOMENTS.length);
  });
});

describe('the phase arrivals', () => {
  it('gives every phase a moment that opens it, phase 6 included', () => {
    // The point of the change: nothing waits for the leader to say hello.
    //
    // **Phase 6 was the exception until F16 t-3**, on the reasoning that its takeaway is asked on
    // the screen because a reflection is the leader's to write. P19 reversed that refusal on
    // 2026-07-27 and the exception outlived it, leaving one textarea in a tool that had been rebuilt
    // as a conversation. Every phase now opens by being spoken to.
    expect(RECLAIM_PHASE_KEYS.filter((key) => arrivalMomentFor(key) === null)).toEqual([]);
    expect(arrivalMomentFor(FINAL_PHASE_KEY)).toBe('phase-6-open');
  });

  it('points each arrival at the phase it opens, so the route can never refuse one', () => {
    // An arrival mapped to a phase other than its own would be claimed and then rejected forever:
    // the route checks the moment against the journey's phase, and the claim happens first.
    for (const [phaseKey, moment] of Object.entries(ARRIVAL_MOMENTS)) {
      expect(openingBelongsToPhase(moment, phaseKey)).toBe(true);
    }
  });

  it('treats the two beats that are also arrivals as arrivals', () => {
    // Phases 4 and 5 open on figures the leader has already produced, so one moment does both jobs.
    expect(isArrivalMoment('phase-4-gap')).toBe(true);
    expect(isArrivalMoment('phase-5-action')).toBe(true);
    // The reveal is not one. It fires mid-phase, when the leader asks to look (I12).
    expect(isArrivalMoment('phase-1-chart-reveal')).toBe(false);
    expect(isArrivalMoment('phase-1-calendar-return')).toBe(false);
  });

  it('opens an arrival with the trigger that introduces the phase, and a beat with the other', () => {
    expect(openingTriggerFor('phase-2-open')).toBe(COACH_ARRIVAL_TRIGGER);
    expect(openingTriggerFor('phase-1-chart-reveal')).toBe(COACH_OPENING_TRIGGER);
  });

  it('tells the coach to speak first and to ask rather than to wait', () => {
    // The trigger is the only instruction the model gets on an arrival turn that the cached phase
    // block cannot carry, so these three are the whole of the behaviour change in one string.
    expect(COACH_ARRIVAL_TRIGGER).toContain('You speak first');
    expect(COACH_ARRIVAL_TRIGGER).toContain('worth their time');
    expect(COACH_ARRIVAL_TRIGGER).toContain('end on your first question');
    expect(COACH_ARRIVAL_TRIGGER).toContain('Do not wait for them to begin');
  });
});

describe('the synthetic trigger', () => {
  it('is in the list of everything we have ever sent, and so is every other trigger', () => {
    // The list is what the filters read. A trigger changed without being appended here would start
    // appearing in leaders' transcripts as though they had written it.
    expect(COACH_SYNTHETIC_MESSAGES).toContain(COACH_OPENING_TRIGGER);
    expect(COACH_SYNTHETIC_MESSAGES).toContain(COACH_ARRIVAL_TRIGGER);
    for (const moment of COACH_OPENING_MOMENTS) {
      expect(COACH_SYNTHETIC_MESSAGES).toContain(openingTriggerFor(moment));
    }
  });

  it('reads as a stage direction rather than as something a leader would type', () => {
    // It stays in the model's history for the rest of the run, so it has to make sense to a model
    // reading back over the conversation, and to anyone who finds it in a database row.
    for (const trigger of [COACH_OPENING_TRIGGER, COACH_ARRIVAL_TRIGGER]) {
      expect(trigger.startsWith('(')).toBe(true);
      expect(trigger).toContain('has not spoken yet');
    }
    // The resume trigger is a stage direction too, but about a different silence: not a leader who
    // has yet to speak, one who spoke and was not answered.
    expect(COACH_RESUME_TRIGGER.startsWith('(')).toBe(true);
    expect(COACH_RESUME_TRIGGER).toContain('have not spoken again');
  });

  it('tells the coach to take the lost turn without apologising for it', () => {
    // The screen has already told the leader what happened, in the app's own voice. A coach opening
    // with an apology for a provider error is the audit talking about itself at the exact moment the
    // leader is waiting to be answered — and asking them to repeat themselves would undo the whole
    // point, which is that their words were kept.
    expect(COACH_RESUME_TRIGGER).toContain('from their last message');
    expect(COACH_RESUME_TRIGGER).toContain('Do not apologise');
    expect(COACH_RESUME_TRIGGER).toContain('do not ask them to repeat themselves');
  });

  it('keeps the resumed turn out of the leader’s own transcript', () => {
    // The whole reason it can be a message at all. It is sent as `role: 'user'` because `streamChat`
    // has no other way to make the coach speak, so both surfaces have to filter it back out.
    expect(COACH_SYNTHETIC_MESSAGES).toContain(COACH_RESUME_TRIGGER);
    expect(isCoachSyntheticMessage('user', COACH_RESUME_TRIGGER)).toBe(true);
    expect(isCoachSyntheticMessage('user', `\n${COACH_RESUME_TRIGGER}  `)).toBe(true);
    expect(isCoachSyntheticMessage('assistant', COACH_RESUME_TRIGGER)).toBe(false);
  });

  it('never sends the same trigger for two different jobs', () => {
    // A duplicate would make `openingTriggerFor` and the resume path indistinguishable in a
    // transcript, and the filters would still pass — so nothing else would ever catch it.
    const all = [COACH_OPENING_TRIGGER, COACH_ARRIVAL_TRIGGER, COACH_RESUME_TRIGGER];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(COACH_SYNTHETIC_MESSAGES).size).toBe(COACH_SYNTHETIC_MESSAGES.length);
  });

  it('keeps a leader’s own transcript clear of every trigger, not only the first one', () => {
    expect(isCoachSyntheticMessage('user', COACH_ARRIVAL_TRIGGER)).toBe(true);
    expect(isCoachSyntheticMessage('user', ` ${COACH_ARRIVAL_TRIGGER} `)).toBe(true);
    expect(isCoachSyntheticMessage('assistant', COACH_ARRIVAL_TRIGGER)).toBe(false);
  });

  it('is recognised only on a user row, and tolerates surrounding whitespace', () => {
    expect(isCoachSyntheticMessage('user', COACH_OPENING_TRIGGER)).toBe(true);
    expect(isCoachSyntheticMessage('user', `  ${COACH_OPENING_TRIGGER}\n`)).toBe(true);
    expect(isCoachSyntheticMessage('assistant', COACH_OPENING_TRIGGER)).toBe(false);
  });

  it('does not swallow a leader who happens to write something similar', () => {
    expect(isCoachSyntheticMessage('user', 'The leader has not spoken yet')).toBe(false);
    expect(isCoachSyntheticMessage('user', 'I have not spoken yet')).toBe(false);
    expect(isCoachSyntheticMessage('user', '')).toBe(false);
  });
});
