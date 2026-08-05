/**
 * The report's chapters: what they are, what order they come in, and what they are called.
 *
 * ## Why this is its own module
 *
 * Two reasons, and the second is the one that would have bitten.
 *
 * **It is the product's vocabulary, not the model's.** The report agent chooses which chapters an
 * audit earned and what goes in them. It never chooses what a chapter *is*, where it sits, or what it
 * is called. A model that could name a section would eventually write "Areas for improvement"; one
 * that could sequence them would build to a finding. Both are the advice engine I16 exists to
 * prevent, and neither is stopped by asking nicely — so the names and the order live here, in code,
 * and `reading.ts` refuses anything that is not one of them.
 *
 * **It has to be client-safe.** `SummaryView` is a `'use client'` component and it needs the
 * headings. `reading.ts` imports Prisma and the provider manager, so a heading imported from there
 * would drag the database client into the browser bundle. This module imports nothing.
 *
 * ## The order is the arc
 *
 * It is the shape of the conversation the leader just had: where they began, what the week holds,
 * what their energy said, the week they wanted, the distance between, what has been holding that
 * distance in place, what they chose, what they take. A report that told that story in any other
 * order would be telling a different one.
 *
 * ## Why `what_holds_it` was added, and why it is the only analytic chapter
 *
 * Seven chapters retold the audit in the order it happened, and a retelling is not a reading. A
 * leader who has just spent forty minutes saying these things does not need them said back; what
 * they cannot do from inside those forty minutes is see the whole shape at once and ask why it is
 * that shape. That question has an answer, and it is almost never a discipline problem: it is the
 * work only they are allowed to do, the thing that escalates to them by default, the stage their
 * organisation is at, and an identity built on being the person who delivers (I-frame, in as many
 * words).
 *
 * It sits after `the_distance` because it is a reading **of** the distance and never a substitute
 * for it, and before `what_you_chose` because a leader meets what they decided last, on their own
 * terms. It is one chapter and not three: a report with a whole analytic section stops being a
 * mirror and starts being a diagnosis, which is the line I16 draws.
 */

/** The chapters, in the order the report renders them. */
export const CHAPTER_ORDER = [
  'why_now',
  'the_week',
  'energy',
  'the_week_you_want',
  'the_distance',
  'what_holds_it',
  'what_you_chose',
  'what_you_take',
] as const;

export type ChapterSection = (typeof CHAPTER_ORDER)[number];

/**
 * The heading each chapter renders under, in the product's voice.
 *
 * Guarded as coach-voiced copy by `product-voice.test.ts`: a heading is the most quoted sentence in
 * any document and the one a model is most likely to make sound like a consultancy deck. Second
 * person, plain, and never a verdict about the thing underneath it.
 */
export const CHAPTER_TITLES: Readonly<Record<ChapterSection, string>> = {
  why_now: 'Where you began',
  the_week: 'What your week actually holds',
  energy: 'What your energy was telling you',
  the_week_you_want: 'The week you described wanting',
  the_distance: 'What sits between them',
  // Deliberately about the week and not about the leader. "What has been holding you back" is a
  // sentence about a person and would have been the easy heading to write; this one points at the
  // arrangement they are inside, which is where the answer usually is.
  what_holds_it: 'What has been holding it in place',
  what_you_chose: 'What you have chosen',
  what_you_take: 'What you are taking away',
};
