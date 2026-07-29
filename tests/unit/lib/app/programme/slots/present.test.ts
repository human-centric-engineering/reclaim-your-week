/**
 * Which of a reading's two strings a surface shows (`slots/present.ts`).
 *
 * Pure — no mocks, no Prisma. Three things are load-bearing and each has its own test below:
 *
 * 1. **A per-slot override beats the global lean.** That is the whole reason the policy is a pair
 *    rather than a single setting: the refer-back slugs have to lean verbatim whatever the operator
 *    has chosen for everything else, because the gap phase quotes them at the leader.
 * 2. **`verbatim` lean is a preference, never a requirement.** Every form-path row and every row
 *    written before the coach could record a quote has no verbatim, and the leader's typing is already
 *    in `value`. Falling back is the common case forever, not an error path.
 * 3. **`isLeadersOwnWords` is stricter than `presentAnswer`.** A surface that says "quote this
 *    verbatim" may only say so when a real quote is being served; the fallback must not be allowed to
 *    pass itself off as one.
 */

import { describe, it, expect } from 'vitest';
import {
  presentAnswer,
  isLeadersOwnWords,
  leanFor,
  DEFAULT_PRESENTATION,
  type PresentationPolicy,
} from '@/lib/app/programme/slots/present';

/** A reading the coach took a real quote for: the tidy reading, and the sentence the leader said. */
const both = {
  value: 'They are worried the team cannot cope.',
  verbatim: "I don't think they'd cope.",
};
/** A reading with no quote — a form-path row, where `value` is the leader's own typing already. */
const paraphraseOnly = { value: 'They are worried the team cannot cope.' };

const allVerbatim: PresentationPolicy = { lean: 'verbatim', overrides: {} };
const allParaphrase: PresentationPolicy = { lean: 'paraphrase', overrides: {} };

describe('leanFor', () => {
  it('takes the global lean when the slug has no opinion', () => {
    expect(leanFor('reclaim_energy_protected', allVerbatim)).toBe('verbatim');
    expect(leanFor('reclaim_energy_protected', allParaphrase)).toBe('paraphrase');
  });

  it('lets a per-slot override beat the global lean, in both directions', () => {
    const mixed: PresentationPolicy = {
      lean: 'paraphrase',
      overrides: { reclaim_setup_why_now: 'verbatim', reclaim_action_chosen: 'paraphrase' },
    };
    expect(leanFor('reclaim_setup_why_now', mixed)).toBe('verbatim');
    expect(leanFor('reclaim_energy_protected', mixed)).toBe('paraphrase');

    const inverted: PresentationPolicy = {
      lean: 'verbatim',
      overrides: { reclaim_action_chosen: 'paraphrase' },
    };
    expect(leanFor('reclaim_action_chosen', inverted)).toBe('paraphrase');
    expect(leanFor('reclaim_energy_protected', inverted)).toBe('verbatim');
  });

  it('ships leaning paraphrase, with the two refer-back slugs overridden to verbatim', () => {
    // The default is what every caller gets when nothing has been configured, and it has to match
    // `reclaimConfigSchema`'s own defaults or the two disagree the moment an operator saves once.
    expect(DEFAULT_PRESENTATION.lean).toBe('paraphrase');
    expect(leanFor('reclaim_setup_keeping_me_up')).toBe('verbatim');
    expect(leanFor('reclaim_setup_why_now')).toBe('verbatim');
    expect(leanFor('reclaim_current_detail__deep_work')).toBe('paraphrase');
  });
});

describe('presentAnswer', () => {
  it("serves the leader's sentence under a verbatim lean, and the reading under a paraphrase one", () => {
    expect(presentAnswer('reclaim_setup_why_now', both, allVerbatim)).toBe(
      "I don't think they'd cope."
    );
    expect(presentAnswer('reclaim_setup_why_now', both, allParaphrase)).toBe(
      'They are worried the team cannot cope.'
    );
  });

  it('falls back to the reading when there is no quote to serve, under either lean', () => {
    // The common case, and permanently so: a form-path row has no verbatim because it does not need
    // one. This must never return an empty string where a reading exists.
    expect(presentAnswer('reclaim_setup_why_now', paraphraseOnly, allVerbatim)).toBe(
      'They are worried the team cannot cope.'
    );
    expect(presentAnswer('reclaim_setup_why_now', paraphraseOnly, allParaphrase)).toBe(
      'They are worried the team cannot cope.'
    );
  });

  it('applies the shipped default when no policy is passed', () => {
    expect(presentAnswer('reclaim_setup_keeping_me_up', both)).toBe("I don't think they'd cope.");
    expect(presentAnswer('reclaim_energy_protected', both)).toBe(
      'They are worried the team cannot cope.'
    );
  });
});

describe('isLeadersOwnWords', () => {
  it('is true only when a verbatim lean is actually being served a verbatim', () => {
    expect(isLeadersOwnWords('reclaim_setup_why_now', both, allVerbatim)).toBe(true);
  });

  it('is false when the lean is verbatim but the fallback is what got served', () => {
    // The distinction the refer-back rests on. Without it the block tells the coach to quote the
    // leader word for word over a string that is the coach's own rendering.
    expect(isLeadersOwnWords('reclaim_setup_why_now', paraphraseOnly, allVerbatim)).toBe(false);
  });

  it('is false when the policy asked for the paraphrase, even though a quote exists', () => {
    expect(isLeadersOwnWords('reclaim_setup_why_now', both, allParaphrase)).toBe(false);
  });
});
