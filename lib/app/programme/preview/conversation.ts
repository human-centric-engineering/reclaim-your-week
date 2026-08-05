/**
 * The transcript a fabricated preview audit carries, phase by phase (F19). Pure — no Prisma.
 *
 * ## Why there is a fabricated conversation at all
 *
 * There was not one, deliberately, and the reasoning is worth keeping because this replaces it rather
 * than forgets it: inventing `AiMessage` rows puts words in the coach's mouth that no model said, and
 * an operator reading them back through `admin/transcript.ts` had no way to tell. A leader who used
 * the forms and never opened the coach is a real, reachable state, so the empty transcript was at
 * least honest.
 *
 * What it was not was useful. **The audit is the conversation now.** Every phase opens with the coach
 * speaking, the phase panels sit beside a live transcript, and the one screen an operator most needs
 * to look at was the one a test account could never show them. A preview account whose chat is empty
 * cannot answer the question the operator actually has, which is whether the thing reads well.
 *
 * The honesty problem is solved rather than accepted:
 *   - every conversation and every message this fabricator writes carries `metadata.fabricated`, and
 *   - `readSharedTranscript` reports that flag, so the admin transcript view says plainly that the
 *     exchange was written by the preview fabricator and not by a model.
 *
 * ## The prose rules this has to clear
 *
 * These are the coach's own turns, so I1 and I2 bind them exactly as they bind the agent's authored
 * fields. `tests/unit/invariants/product-voice.test.ts` lists this file.
 *
 *   - **No U+2014 anywhere.** Use a comma, a semicolon, or a full stop.
 *   - **The tool is not Rashmir** (I1). It is an instrument she designed, named in the third person,
 *     sparingly. It appears once here, in the opening turn, which is where the real coach places it.
 *   - **Never judged** (I17). The phase-4 turn is where a fabricated transcript would most easily slip
 *     into telling somebody off about their own diary, so it names the gap as a description and says
 *     so outright.
 *   - **Slow down on emotion** (I18), and **possibility, not failure**: the leader's line in phase 4
 *     is uncomfortable, and the coach's reply meets it rather than moving on.
 *
 * The exchange is the same person `answers.ts` describes, saying the same things in the same order.
 * Two fixtures telling different stories would be worse than one story told badly: an operator reading
 * the panel and the transcript side by side is checking exactly that they agree.
 *
 * ## What is not written here
 *
 * **No synthetic trigger rows.** A real run persists `COACH_SYNTHETIC_MESSAGES` as `role:'user'` to
 * make the coach speak first, and both surfaces filter them back out. Writing them would add rows
 * that every reader is built to hide, to reproduce a framework limitation rather than a leader's
 * experience of it.
 */

/** One turn, in the roles this product names rather than the model's. */
export interface PreviewTurn {
  role: 'leader' | 'coach';
  text: string;
}

/**
 * The mark every fabricated conversation and message carries.
 *
 * On both the conversation and each message, rather than the conversation alone. The conversation is
 * what a reader has in hand, so that is where the flag has to be for the banner; the messages carry it
 * too because a row that outlives its parent, in an export or a support query, must still be able to
 * say where it came from. `metadata` is a `Json?` column on both tables, so this needs no schema
 * change and touches nothing Sunrise owns.
 */
export const FABRICATED_METADATA = { fabricated: true } as const;

/**
 * Whether a `metadata` value came from the preview fabricator.
 *
 * Takes `unknown` and narrows without a cast, because the argument is a Prisma `Json` column: its
 * runtime shape is whatever was written, which by now includes rows written by versions of this code
 * that no longer exist. Anything that is not an object with `fabricated: true` reads as real, which is
 * the safe direction to fail: a genuine transcript wrongly badged as fabricated would tell an operator
 * to disregard a leader's actual words.
 */
export function isFabricatedConversation(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const fields: Record<string, unknown> = { ...metadata };
  return fields.fabricated === true;
}

/**
 * The exchange for each phase, in order. Indexed by phase number so the fabricator can write a
 * phase's turns as it arrives, which is what puts the phase marks in the right places: the mark for a
 * phase is the id of the last message that existed when it was entered, so a transcript written all at
 * once at the end would file the whole conversation under the final phase.
 */
const BY_PHASE: Record<number, PreviewTurn[]> = {
  0: [
    {
      role: 'coach',
      text: 'Welcome. This takes about ninety minutes, across seven phases, and it runs on the framework Rashmir Balasubramaniam uses with leaders directly. Before any of the numbers, a little about you and about the stretch of time you want to look at. What is your role, and roughly how big is the organisation?',
    },
    { role: 'leader', text: 'Chief exec. Social enterprise, about forty people.' },
    {
      role: 'coach',
      text: 'Thank you. And the period you want to audit: last week, last month, last quarter, or last year?',
    },
    { role: 'leader', text: 'Last quarter. Last week would flatter me.' },
  ],
  1: [
    {
      role: 'coach',
      text: 'This is the long phase, and everything after it rests on what you put here. Nine areas, and for each one an honest number of hours in a typical week. Estimates are fine. Nobody has these exactly right, and the shape is what matters, not the decimal.',
    },
    { role: 'leader', text: 'Delivery is going to be the ugly one.' },
    {
      role: 'coach',
      text: 'Twenty two hours on delivery and operations, and four on deep work. Those two numbers sit next to each other for the rest of the audit, so it is worth a moment with them now.',
    },
  ],
  2: [
    {
      role: 'coach',
      text: 'Two questions in this phase, and about ten minutes. The first is when you are genuinely at your best. The second is what currently happens to that time.',
    },
    { role: 'leader', text: 'Mornings. Seven until about half past ten.' },
    {
      role: 'coach',
      text: 'And the standing meetings went into the morning, because that is when everybody is free. So the three hours a week you think best in are the first three you give away.',
    },
  ],
  3: [
    {
      role: 'coach',
      text: 'Now the other week. Not a perfect one, a sustainable one: the hours you would put against each area if you were designing the week rather than inheriting it.',
    },
    { role: 'leader', text: 'Twelve hours on deep work looks greedy written down.' },
    {
      role: 'coach',
      text: 'It sits just under where the guide puts a chief executive of an organisation this size. Worth noticing that greedy and below the benchmark are the same number here.',
    },
  ],
  4: [
    {
      role: 'coach',
      text: 'Here are the two weeks together. Delivery is twelve hours above what you designed, and deep work is eight below it. In the first phase you said what keeps you up is whether the funding bid gets written at all. There are no hours against it in the week you have.',
    },
    { role: 'leader', text: 'That is uncomfortable, laid out like that.' },
    {
      role: 'coach',
      text: 'Take a moment with it. Nothing here is a failure, and none of it is a verdict on how you work. It is a description of one quarter, and a description is the kind of thing that can be changed.',
    },
  ],
  5: [
    {
      role: 'coach',
      text: 'Three ways in, and none of them is the right answer. Two protected mornings a week for the bid. The Thursday delivery stand-up handed to your delivery lead. Or a standing monthly look at where the week actually went. Which of those do you want, rather than which one you think you ought to pick?',
    },
    { role: 'leader', text: 'The two mornings. From Monday.' },
    { role: 'coach', text: 'And what comes out of the week to make room for them?' },
    { role: 'leader', text: 'The Thursday stand-up. Priya can run that without me.' },
  ],
  6: [
    {
      role: 'coach',
      text: 'Before offering you a downloadable summary, one last question. What are you taking away from this?',
    },
    { role: 'leader', text: 'That two mornings a week is a decision, not a wish.' },
    {
      role: 'coach',
      text: 'Then that is where your summary starts. Everything you have written is on this screen now, yours to keep, and yours to share or not.',
    },
  ],
};

/**
 * The turns belonging to `phaseIndex`, or an empty list for an index the fixture does not cover.
 *
 * Empty rather than a throw for the same reason `previewAnswersForPhase` returns empty: the caller has
 * already validated the phase against the map, and a fabricated audit that failed outright because a
 * transcript fixture was short would be a worse outcome than one whose chat is quiet in one phase.
 */
export function previewTurnsForPhase(phaseIndex: number): readonly PreviewTurn[] {
  return BY_PHASE[phaseIndex] ?? [];
}
