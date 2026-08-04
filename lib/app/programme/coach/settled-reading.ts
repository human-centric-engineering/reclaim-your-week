/**
 * Whether a reading is one this audit has settled: answered, and owed nothing further.
 *
 * ## The failure it closes, observed on a live audit
 *
 * The leader was asked which period the audit covers and tapped **last quarter**. In that one turn
 * the coach did three things: recorded the answer, called `offer_choices` for the very reading it had
 * just recorded, and moved on to a different question. The screen did as it was told. Underneath
 * "what stands out to you about your current situation and priorities?" it drew *last week / last
 * month / last quarter / last year*, so a leader who had answered that question a second earlier was
 * asked it again, beneath a question it has nothing to do with.
 *
 * Nothing the capability's other guards check was wrong: the reading exists, it has an answer set, it
 * belongs to the section the leader is on, and it is not half of a pair. The fifth thing, that there
 * is a live question here at all, was left to the model. And the model was holding an instruction
 * naming that exact reading, because the context block chooses the turn's question before the turn
 * runs and the leader answering it is what the turn *was*. `nextQuestionLines` covers the prose half
 * of this already ("if that one is what they have just answered ... let the turn end on this
 * instead"), and the coach obeyed it: it asked the other question. It carried the offer over anyway.
 *
 * Which is the shape of every other failure in this directory. A side effect asked of a model is a
 * hit rate, and this product does not build on hit rates, so the rule stops being an instruction and
 * becomes arithmetic.
 *
 * ## "Settled", not "answered", and the difference is the whole of the rule
 *
 * The audit does go back to readings it already holds, and on those turns the answers belong on
 * screen: a reading the coach *inferred* rather than heard is offered back for the leader to put
 * right, and `nextQuestionsFor` names those as questions to end a turn on. Refusing every answered
 * reading would take the buttons off exactly the turn where a leader is being asked to correct
 * something the audit claims they said, which is the turn they matter most on.
 *
 * So the predicate is the flag `answer-quality.ts` already computes for the capture list, read here
 * for the opposite purpose. A reading that carries a flag is owed another turn and may be offered; a
 * reading that carries none has been answered and left, and there is no question under which to draw
 * it.
 *
 * ## Why it is not in `phase-context.ts`, where this arithmetic already runs
 *
 * The same reason `compound-question.ts` is not: a capability that imports from there closes the
 * cycle capability then config then module then capability. This file imports the run, the slot
 * definitions and the flag rule, and none of the three knows a capability exists.
 *
 * ## It fails open
 *
 * `false` when the run cannot be read, exactly as the pairing guard does and for the same reason. A
 * wrong offer names the reading it is for and sits beside a way to type instead, so it is visible and
 * dismissible. An offer silently withheld from every leader for the length of a database wobble is
 * neither, and it is worse than the blank box this whole mechanism replaced.
 */

import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { answerFlag } from '@/lib/app/programme/coach/answer-quality';
import { slotDefinitionFor } from '@/lib/app/programme/coach/writable-slots';

export async function readingIsSettled(input: {
  userId: string;
  runId: string;
  slotSlug: string;
}): Promise<boolean> {
  try {
    // One slug, so the run-scoped read stays a single narrow query rather than the whole audit.
    const answers = await readRunAnswers(input.userId, input.runId, [input.slotSlug]);
    const answer = answers[input.slotSlug];
    if (answer === undefined) return false;

    // The data type decides whether a flag is possible at all: a typed reading never carries one, so
    // a boolean this run holds is settled the moment it lands, which is correct. Its two buttons
    // answer a question that has been answered.
    const dataType = slotDefinitionFor(input.slotSlug)?.dataType ?? 'text';
    return answerFlag(input.slotSlug, dataType, answer) === null;
  } catch {
    return false;
  }
}
