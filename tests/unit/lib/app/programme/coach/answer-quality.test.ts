/**
 * Telling a reading that landed from one that is owed another turn (`coach/answer-quality.ts`).
 *
 * Pure — no mocks. The four rules, their ordering, and the exhaustiveness guard that stops the two
 * hand-written lists rotting.
 *
 * The thing worth being careful about here is that this is a **trigger and not a verdict**. Word
 * count does not measure whether an answer is any good, and the tests below are as much about what
 * must NOT be flagged as about what must.
 */

import { describe, it, expect } from 'vitest';
import {
  answerFlag,
  answerFlagNote,
  coachWritableTextSlugs,
  SHORT_ANSWER_SLOTS,
  NOT_TEXTURE,
} from '@/lib/app/programme/coach/answer-quality';

const said = (value: string) => ({ value, sourceType: 'direct', confidence: 10 });
const guessed = (value: string, confidence: number) => ({
  value,
  sourceType: 'inferred',
  confidence,
});

describe('answerFlag — typed readings are exempt', () => {
  it.each([
    ['number', '20'],
    ['boolean', 'Yes'],
    ['json', '{"mornings":true}'],
    ['date', '2026-07-28'],
  ])('never flags a %s reading, whatever it says', (dataType, value) => {
    // A number is already guarded by the typed-value rule, a boolean's value is the word "Yes", and a
    // json slot's prose is a serialised object that would be flagged on every single turn.
    expect(answerFlag('reclaim_current_hours__deep_work', dataType, said(value))).toBeNull();
    expect(answerFlag('reclaim_energy_peak_windows', dataType, guessed(value, 3))).toBeNull();
  });
});

describe('answerFlag — a reading the coach worked out and is not sure of', () => {
  it('marks a low-confidence inference as unconfirmed', () => {
    expect(answerFlag('reclaim_energy_protected', 'text', guessed('It gets eaten.', 5))).toBe(
      'unconfirmed'
    );
  });

  it('leaves a confident inference alone', () => {
    // Long enough that `short` cannot fire either, so this isolates the confidence rule.
    const account =
      'Their mornings go on standups and the inbox, so the good hours are gone by ten.';

    expect(answerFlag('reclaim_energy_protected', 'text', guessed(account, 8))).toBeNull();
  });

  it('leaves anything the leader actually said alone, however sure the coach was', () => {
    // `user_confirmed` is the leader verifying something offered back, which is the resolution this
    // flag exists to prompt — flagging it again would loop.
    const account =
      'Their mornings go on standups and the inbox, so the good hours are gone by ten.';

    expect(
      answerFlag('reclaim_energy_protected', 'text', {
        value: account,
        sourceType: 'user_confirmed',
        confidence: 4,
      })
    ).toBeNull();
  });

  it('takes precedence over short, so no line carries two flags', () => {
    // An inference the leader has not seen is owed a check more urgently than a short answer is owed
    // depth, and one flag per line keeps the list scannable.
    expect(answerFlag('reclaim_current_detail__deep_work', 'text', guessed('Meetings.', 4))).toBe(
      'unconfirmed'
    );
  });
});

describe('answerFlag — a texture reading that came back as a note', () => {
  it('marks a handful of words on a reading whose purpose is prose', () => {
    expect(answerFlag('reclaim_current_detail__deep_work', 'text', said('Meetings mostly.'))).toBe(
      'short'
    );
  });

  it('leaves a real account alone', () => {
    expect(
      answerFlag(
        'reclaim_current_detail__deep_work',
        'text',
        said('Mostly board papers, and it always slides to the evening because the day fills up.')
      )
    ).toBeNull();
  });

  it('flags the source specificity test where it actually lives', () => {
    // "do more deep work" is four words. The worked example the source gives is sixteen.
    expect(answerFlag('reclaim_action_chosen', 'text', said('Do more deep work'))).toBe('short');
    expect(
      answerFlag(
        'reclaim_action_chosen',
        'text',
        said(
          'Protect 7 to 8am on Monday, Wednesday and Friday as a non-negotiable deep work block, starting this week.'
        )
      )
    ).toBeNull();
  });

  it('never flags a reading a short answer completes', () => {
    // The failure this whole mechanism exists to avoid, in its most obvious form: a coach trained to
    // press for a longer version of somebody's first name.
    expect(answerFlag('reclaim_profile_first_name', 'text', said('Rashmir'))).toBeNull();
    expect(answerFlag('reclaim_action_when', 'text', said('Next Tuesday'))).toBeNull();
    expect(answerFlag('reclaim_profile_role', 'text', said('CEO'))).toBeNull();
  });

  it('holds the boundary at seven words', () => {
    expect(answerFlag('reclaim_setup_why_now', 'text', said('one two three four five six'))).toBe(
      'short'
    );
    expect(
      answerFlag('reclaim_setup_why_now', 'text', said('one two three four five six seven'))
    ).toBeNull();
  });
});

describe('answerFlagNote', () => {
  it('reads as a fact about the string, never as a judgement of the leader', () => {
    // The model writes like its context. "Thin", "weak" or "poor" here would come back out in the
    // coach's manner on the next turn, and nothing a leader meets is framed as a failure (I17).
    expect(answerFlagNote('short')).toBe(', and short');
    expect(answerFlagNote('unconfirmed')).toBe(', not yet confirmed');
    expect(answerFlagNote(null)).toBe('');
    for (const note of [answerFlagNote('short'), answerFlagNote('unconfirmed')]) {
      expect(note).not.toMatch(/thin|weak|poor|vague|inadequate|low quality/i);
    }
  });
});

describe('the two lists account for every coach-writable text reading', () => {
  it('classifies every one of them, so a new slot cannot join unclassified', () => {
    // The idiom `product-voice.test.ts` and `agent-caps.test.ts` already use. A hand-written list
    // rots; this is what makes it fail loudly instead of silently. A new slot fails here until
    // somebody decides whether a short answer completes it.
    const classified = new Set([...SHORT_ANSWER_SLOTS, ...NOT_TEXTURE]);
    const unclassified = coachWritableTextSlugs().filter((slug) => !classified.has(slug));

    expect(unclassified).toEqual([]);
  });

  it('never puts a slug in both lists', () => {
    const overlap = SHORT_ANSWER_SLOTS.filter((slug) => NOT_TEXTURE.includes(slug));

    expect(overlap).toEqual([]);
  });

  it('names no slug that is not a real coach-writable text reading', () => {
    // The other direction: a typo, or a slug retired from `slots.ts`, would otherwise sit here
    // forever doing nothing.
    const real = new Set(coachWritableTextSlugs());
    const phantom = [...SHORT_ANSWER_SLOTS, ...NOT_TEXTURE].filter((slug) => !real.has(slug));

    expect(phantom).toEqual([]);
  });
});
