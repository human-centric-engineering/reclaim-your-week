/**
 * Which of a reading's two strings a surface shows.
 *
 * Conversational capture records a reading twice. `value` is the coach's rendering — the tool tells it
 * to write "the reading in plain language, close to the leader's own words", which makes it a
 * paraphrase by design and a good one: it is tidy, it is consistent between leaders, and it is what a
 * list of readings wants. `provenance.verbatim` is the sentence the leader actually said, kept because
 * a paraphrase is the wrong thing to quote. The Phase 4 refer-back instructs the coach to return their
 * words "verbatim, do not paraphrase" (I13), and until both were stored that instruction was being
 * served the tidy version, so the audit quoted a sentence nobody had said.
 *
 * The choice is per surface and per slot rather than global, and neither answer is right everywhere: a
 * capture list of nineteen readings is easier to work from in the coach's clean prose, while the one
 * line read back to a leader at the gap has to be theirs. So the policy is data, resolved here, and
 * every consumer asks this function rather than reaching for `.value` and deciding for itself.
 *
 * Pure, no Prisma, no framework reads — the client panels import it as happily as the prompt builder.
 */

import type { RunAnswer } from '@/lib/app/programme/runs/answers';

/** Which string a surface leans towards when a reading has both. */
export type AnswerLean = 'verbatim' | 'paraphrase';

/**
 * The resolved presentation policy: a default lean plus the slugs that disagree with it.
 *
 * Shaped to be read straight off `Module.config` (`answerPresentation` +
 * `answerPresentationOverrides`) without a translation step, so there is one vocabulary from the
 * config form to the rendered line.
 */
export interface PresentationPolicy {
  lean: AnswerLean;
  overrides: Readonly<Record<string, AnswerLean>>;
}

/** The policy applied when nothing has been configured — what `reclaimConfigSchema` also defaults to. */
export const DEFAULT_PRESENTATION: PresentationPolicy = {
  lean: 'paraphrase',
  overrides: {
    reclaim_setup_keeping_me_up: 'verbatim',
    reclaim_setup_why_now: 'verbatim',
  },
};

/** Which way this slug leans: its own override if it has one, otherwise the global lean. */
export function leanFor(
  slug: string,
  policy: PresentationPolicy = DEFAULT_PRESENTATION
): AnswerLean {
  return policy.overrides[slug] ?? policy.lean;
}

/**
 * The string to show for one reading.
 *
 * Falls back to `value` whenever there is no verbatim to show, which is the common case and always
 * will be: every form-path row has the leader's own typing in `value` already, and every row written
 * before the coach could record a quote has nothing else to offer. So `verbatim` lean is a preference,
 * never a requirement, and this can never return an empty string where a reading exists.
 */
export function presentAnswer(
  slug: string,
  answer: Pick<RunAnswer, 'value' | 'verbatim'>,
  policy: PresentationPolicy = DEFAULT_PRESENTATION
): string {
  if (leanFor(slug, policy) === 'paraphrase') return answer.value;
  return answer.verbatim ?? answer.value;
}

/**
 * Whether the string `presentAnswer` returned is the leader's own sentence.
 *
 * The refer-back needs this rather than inferring it: it instructs the coach to quote the leader
 * verbatim, and it may only say so when it is actually serving a quote. Telling a model that a
 * paraphrase is verbatim is how the tool ends up presenting its own words as the leader's.
 */
export function isLeadersOwnWords(
  slug: string,
  answer: Pick<RunAnswer, 'value' | 'verbatim'>,
  policy: PresentationPolicy = DEFAULT_PRESENTATION
): boolean {
  return leanFor(slug, policy) === 'verbatim' && answer.verbatim !== undefined;
}
