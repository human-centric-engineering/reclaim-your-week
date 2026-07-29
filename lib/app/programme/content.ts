/**
 * Rashmir's content — the verbatim `reclaim-audit` config defaults (F2 t-3).
 *
 * **Load, don't author (I11).** Every string here is taken *verbatim* from a blockquote in
 * `.context/app/content-source.md` — no paraphrase, no tightening, no "improvement". Em dashes,
 * en dashes, straight apostrophes, and the © are reproduced exactly as she wrote them; the em-dash
 * ban (I2) governs the *agent's* generated voice, not this descriptive content.
 *
 * These become the `.default(...)` values of `reclaimConfigSchema` (`module.ts`), so an operator can
 * reword any of them from the admin config form without a deploy — but the *shipped* default is
 * Rashmir's exact language. The I11 guard is two hops, both required:
 *   - hop 1 (`npm run leaf:content-diff`, already in `leaf:checks`): every blockquote in
 *     `content-source.md` appears verbatim in `.context/app/sources/`, and the sources still match
 *     their SHA-256 manifest.
 *   - hop 2 (`content.test.ts`): the nine bucket `description`s and the `footnote` here are
 *     character-identical to the blockquotes parsed out of `content-source.md`.
 *   Neither substitutes for the other — hop 1 proves the extract matches Rashmir; hop 2 proves the
 *   code matches the extract. Nine altered blockquotes survived to 2026-07-23 for want of hop 1.
 *
 * Isolating the IP in one file makes it auditable: a reviewer diffs this against the source, and the
 * "not one word of this is ours" claim has a single place to hold.
 */

/** The governing frame (§0, the I-frame). The tool's thesis; governs everything downstream. */
/** Slot-token form of a canonical bucket slug (`delivery-operations` → `delivery_operations`, I7). */
export const bucketToken = (slug: string): string => slug.replace(/-/g, '_');

export const RECLAIM_GOVERNING_FRAME =
  'This is not a productivity exercise. It is an invitation for the leader to step into their next level of leadership. That may require some letting go, e.g. of doing too much, of being indispensable, of an identity built around individual achievement, effort and output. Hold that possibility with care throughout.';

/**
 * The Phase 0 process outline (§4a) — the first thing a leader reads, shown before the setup form.
 * Verbatim (I11), re-pointed to third person so it reads as the tool's process. Contains an em dash —
 * verbatim descriptive content. Guarded character-identical in hop 2.
 */
export const RECLAIM_PROCESS_OUTLINE =
  'Before we begin, here is what we will cover together. We will start with a little context about you and your role. Then we will explore how you are currently spending your time across up to nine key areas of leadership, with the option to reality-check your estimates against your actual calendar data if you would like. We will look at your energy and when you do your best work. We will identify the gaps between where you are and where you want to be. We will finish by designing your ideal week and building a clear, prioritised action plan — one or two things you can start right away. The whole process takes around 30-60 minutes. Ready to begin?';

/**
 * The Phase 4 under-delegation invitation (§8) — offered where the gap points to it. An invitation,
 * not a diagnosis (I16). Rashmir's verbatim IP (I11, hop-2 guarded); contains an em dash, like the
 * deep-work note — verbatim content, not the coach's authored voice.
 */
export const RECLAIM_UNDER_DELEGATION_INVITATION =
  "'What you are seeing here is common for leaders at your stage. And it often points to something worth looking at — not just about your calendar, but about what it might mean to lead differently. What would it take to let go of some of this, and lead more through others?'";

/** The Phase 5 journey framing (§8) — a journey, not a makeover. Verbatim (I11, hop-2 guarded). */
export const RECLAIM_JOURNEY_FRAMING =
  '"Your calendar is a reflection of habits, commitments, and patterns built over time. It will not change overnight, and it does not need to. What matters is choosing one or two things to shift right now, making them stick, and then building from there. Small changes, consistently held, compound into transformation. That is how sustainable leadership change actually works."';

/** The Phase 5 forward-leaning close (§8). Verbatim (I11, hop-2 guarded). */
export const RECLAIM_FORWARD_CLOSE =
  "'This is the beginning of leading in a way that is more sustainable, more impactful, and more true to what you are here to do.'";

/** The Phase 6 closing affirmation (§8) — "vary the language each time", so this is one voice of it. Verbatim (I11). */
export const RECLAIM_CLOSING_AFFIRMATION =
  '"What you have done here takes courage. Most leaders never look this honestly at how they are spending their time. The fact that you have is already the beginning of a new level of performance and impact."';

/** The strategy-mirror prompt (§8, Brief §5) — used once where it lands. Config-gated (open item 10). Verbatim. */
export const RECLAIM_STRATEGY_MIRROR =
  '"If a stranger read your calendar, what would they say your priorities are?"';

/** The Phase 2 coaching signal (§8) — depth-of-topic, config-gated (open item 11, default off). Verbatim. */
export const RECLAIM_PHASE2_COACHING_SIGNAL =
  'Note: this is a rich topic worth exploring more deeply. Where useful, signal that a dedicated coaching conversation with Rashmir can go much further here.';

/**
 * The Phase 3 framing (§8) — a realistic target, not a fantasy. Verbatim (I11, hop-2 guarded).
 *
 * Instruction to the coach rather than copy for the leader, and a constant anyway. Paraphrased into
 * `phase-context.ts` it would be Rashmir's wording reproduced outside the guarded set, which is the
 * exact drift I11 exists to stop; and "a realistic target, not a fantasy" is good enough copy that
 * somebody would have reached for it.
 */
export const RECLAIM_IDEAL_WEEK_FRAMING =
  'Frame this as a realistic target, not a fantasy — grounded in what they now know about their energy, their priorities, and where the gaps are.';

/**
 * The Phase 3 challenge (§8) — the ideal week that has not moved. Verbatim (I11, hop-2 guarded).
 *
 * Names its own two cases: delivery and operations staying high, recovery staying near zero. The
 * arithmetic that decides when it fires reads those two by name (`coach/ideal-week.ts`).
 */
export const RECLAIM_IDEAL_WEEK_CHALLENGE =
  'Gently challenge any ideal week that looks suspiciously similar to their current reality — especially if delivery and operations remains high, or recovery remains near zero.';

/**
 * The Phase 4 hours question at a high weekly total (§8). Verbatim (I11, hop-2 guarded).
 *
 * The threshold is **not** in this string: it comes from `hourBands`, which is already config, so
 * moving the line at which a total counts as unsustainable does not mean editing code.
 */
export const RECLAIM_HOURS_55_NOTE =
  'For leaders running at 55+ hours, name the hours question clearly: the goal is not just to reallocate time but to reclaim a sustainable way of working. Sometimes the most strategic thing a leader can do is stop.';

/**
 * The permission-based challenge (Brief §5). Verbatim (I11, hop-2 guarded).
 *
 * **Once per audit, and that phrase is part of the quote rather than a note beside it**, because the
 * scarcity is the mechanism: a coach with one challenge to spend has to spend it on the observation
 * that is worth it. The permission is the other half — the tool asks, and waits, and only then says
 * the direct thing. That gate is what buys it the licence to be blunt at all.
 */
export const RECLAIM_PERMISSION_CHALLENGE =
  'Once per audit, no more: "May I offer a challenge?" followed by one clean, direct observation where it might have most value.';

/**
 * The wanted-not-dutiful question that closes the action plan (Brief §5). Verbatim (I11, hop-2 guarded).
 *
 * The second genuine challenge in the audit, and the one that decides whether the commitment survives
 * contact with the leader's week. Also the source of Phase 5's fourth question, "how will you know",
 * which the older system prompt does not have.
 */
export const RECLAIM_WANTED_NOT_DUTIFUL =
  'The close asks: what, by when, how will you know, and crucially, "is this something you actually want to do, or something you think you should?"';

/**
 * The Phase 5 specificity calibration (§8). Verbatim (I11, hop-2 guarded).
 *
 * The one piece of the action phase that cannot be paraphrased without losing what it is for. "Be
 * specific" is advice every model already agrees with and none of them act on; the worked pair is
 * what makes the difference between the two legible.
 */
export const RECLAIM_ACTION_SPECIFICITY =
  "Options should be specific and realistic — not 'do more deep work' but 'protect 7-8am on Monday, Wednesday and Friday as a non-negotiable deep work block, starting this week.'";

/**
 * The recent-audit shortcut's confirm line (§4, F9 t-2). Verbatim, and **interpolated, not rewritten**:
 * the bracketed placeholders are filled from the leader's own previous answers.
 *
 * The surrounding source instruction is written for the Claude-Project era ("either in the project
 * files or pasted in") and is retired by the product having a database. What carries is the sentence
 * itself — a confirmation that ASKS rather than assumes, which is the §4 register and the reason not
 * to paraphrase it into "Is this still right?".
 *
 * Guarded in hop 2 as a substring of the §4 blockquote rather than as a whole-quote identity, because
 * only this sentence is user-facing. See `tests/unit/app/programme/content.test.ts`.
 */
export const RECLAIM_RECENT_AUDIT_CONFIRM =
  '"I can see from your recent audit that you are [role] at [organisation], working around [hours] per week, with [priorities]. Is all of that still accurate, or has anything changed?"';

/** The cross-cutting deep-work note (§2). Contains an em dash — verbatim descriptive content. */
export const RECLAIM_DEEP_WORK_NOTE =
  'Deep work cuts across all buckets — it is the quality of focused, uninterrupted attention brought to the most important work. The research-informed recommendation for leaders is at least one protected block of 60-90 minutes per day, ideally during their peak energy window for high performance. Even one hour of genuine deep work daily is a significant win for most leaders. Four hours a day would be absolutely phenomenal, but is unlikely for most leaders.';

/** The summary footnote (§9) — must not be reworded (I11). Guarded character-identical in hop 2. */
export const RECLAIM_FOOTNOTE =
  "This time audit was facilitated using a tool designed by Rashmir Balasubramaniam / Nsansa Ltd. Results shared with Rashmir may be used anonymously and in aggregate to identify patterns across purpose-driven leaders and inform future thinking and writing. This method has been evolved for purpose-driven leaders from Eric Partaker's CEO time management framework and is informed by research on CEO time use, peak performance, and flow science. © Rashmir Balasubramaniam / Nsansa Ltd.";

/**
 * The nine buckets in display order (§1). `slug` is the canonical `bucketSlug` (hyphens; slots
 * convert to underscores). `description` is Rashmir's verbatim diagnostic prose (hop-2 guarded);
 * `colour` and `benchmark` are the per-bucket bullets beneath each §1 heading. `benchmark.note` is
 * her free-text range; the `lowPercent`/`highPercent` are the machine-readable bounds for F6 t-3's
 * chart markers, `null` where a bucket has no percentage range.
 */
export const RECLAIM_BUCKETS = [
  {
    slug: 'deep-work',
    title: 'Deep work',
    description:
      'Protected time for thinking, decision-making, writing, and IP creation. Cross-cutting: the quality of focused attention brought to advancing top priorities. The question is not how much time, but whether protected daily blocks exist. Ideally there should be 1 or 2 of these a day, even if only for 60 minutes.',
    colour: '#2D6A4F',
    benchmark: {
      note: 'no percentage range. Measured by presence of protected blocks.',
      lowPercent: null,
      highPercent: null,
    },
    conditional: false,
  },
  {
    slug: 'learning-development',
    title: 'Learning & development',
    description:
      'Reading, courses, self-development and time with mentors, coaches and advisors. Research suggests a minimum of 2-3 hours per week (approx. 5% of working time) for sustained leadership effectiveness. This is usually the first thing to disappear under pressure.',
    colour: '#52B788',
    benchmark: {
      note: 'minimum 2–3 hours per week (approx. 5%)',
      lowPercent: 5,
      highPercent: null,
    },
    conditional: false,
  },
  {
    slug: 'strategic-planning',
    title: 'Strategic planning & review',
    description:
      'Strategic thinking, roadmaps, priorities, resource allocation, board preparation. Recommended range: 15-20% of working time.',
    colour: '#1B4965',
    benchmark: {
      note: '15–20%',
      lowPercent: 15,
      highPercent: 20,
    },
    conditional: false,
  },
  {
    slug: 'team-development',
    title: 'Team development',
    description:
      '1:1s, coaching conversations, culture, organisational development, succession planning. Recommended range: 15-20%. Great people leadership takes more time than most leaders allocate.',
    colour: '#5FA8D3',
    benchmark: {
      note: '15–20%',
      lowPercent: 15,
      highPercent: 20,
    },
    conditional: false,
  },
  {
    slug: 'organisational-oversight',
    title: 'Organisational oversight',
    description:
      "Operational reviews, staff meetings, reporting, governance. The legitimate pulse-checking work. Recommended range: 10-15%. Below this and you are flying blind; above it and you may be doing your team's job for them. Note that 20%+ may be appropriate for early stage or transitioning organisations, and that the key question is whether it is intentional and time-bounded.",
    colour: '#7B6D8D',
    benchmark: {
      note: '10–15%, with the early-stage/transition exemption above',
      lowPercent: 10,
      highPercent: 15,
    },
    conditional: false,
  },
  {
    slug: 'fundraising-capital',
    title: 'Fundraising & capital',
    description:
      'For nonprofit leaders and growth-stage founders for whom capital raising is a significant part of the role. Highly season-dependent. Should be intentional and time-bounded. Only include this bucket if relevant to the client.',
    colour: '#C77DFF',
    benchmark: {
      note: 'season-dependent, no fixed range',
      lowPercent: null,
      highPercent: null,
    },
    conditional: true,
  },
  {
    slug: 'relationship-building',
    title: 'Relationship building',
    description:
      'External relationships: current funders, key partners, customers/beneficiaries, governments (if relevant), media, board members as individuals, and other key stakeholders. Recommended range: 15-25%.',
    colour: '#E07A5F',
    benchmark: {
      note: '15–25%',
      lowPercent: 15,
      highPercent: 25,
    },
    conditional: false,
  },
  {
    slug: 'delivery-operations',
    title: 'Delivery & operations',
    description:
      'Direct hands-on execution, programme delivery, doing work that could be delegated. Recommended ceiling: 10-15% for a senior leader. Above this is often a signal of under-delegation or difficulty letting go of an earlier identity as a practitioner.',
    colour: '#F4A261',
    benchmark: {
      note: 'ceiling 10–15%',
      lowPercent: 10,
      highPercent: 15,
    },
    conditional: false,
  },
  {
    slug: 'recovery-white-space',
    title: 'Recovery & white space',
    description:
      'Breaks, rest, unscheduled thinking time, transitions between meetings. Not optional — this is performance infrastructure. Recommended floor: 10-15% of working time. Leaders running at over 100% typically have this near zero, which compounds every other challenge.',
    colour: '#A8DADC',
    benchmark: {
      note: 'floor 10–15%',
      lowPercent: 10,
      highPercent: 15,
    },
    conditional: false,
  },
];

/**
 * The three total-hours bands (§3), from the structured form beneath the blockquote. `upperHours`
 * is `null` for the open-ended 55+ band; the labels are her band descriptions.
 */
export const RECLAIM_HOUR_BANDS = [
  {
    slug: 'sustainable',
    lowerHours: 45,
    upperHours: 50,
    label: 'the evidence-based sustainable ceiling for most leaders',
  },
  {
    slug: 'elevated',
    lowerHours: 50,
    upperHours: 55,
    label: 'elevated but manageable in defined seasons, with active recovery',
  },
  {
    slug: 'unsustainable',
    lowerHours: 55,
    upperHours: null,
    label:
      'unsustainable as a baseline; decision quality degrades even when productivity feels high',
  },
];

/**
 * The calendar branch offer (§ "Phase 1 — the calendar branch offer"), verbatim.
 *
 * Offered by the coach after every area has a figure, and offered **once**. The wording carries its
 * own guardrails: "optional but can be very revealing" and a closing question rather than a nudge.
 * Brief §3 asks that the optionality be unmissable, because several testers were anxious here.
 */
export const RECLAIM_CALENDAR_OFFER =
  '"You now have a picture of where you think your time is going, based on your own reflection. Would you like to reality-check this against your actual calendar data? If you have access to your Google Calendar, Outlook, or Apple Calendar, you can export and upload your calendar file and we will compare what you have estimated against what your calendar actually shows. This is optional but can be very revealing. Would you like to do that?"';

/**
 * The three calendar export walkthroughs (§ "Phase 1 — the calendar export walkthroughs"), verbatim.
 *
 * **On the screen, not in the conversation, and the extract says so** — "shown at the upload step",
 * "users need these at the moment they choose to upload". The source prompt has the coach recite them
 * because a Claude Project had nowhere else to put them; an app does, and a list of steps is
 * something you scan while tabbing to another window rather than something you want narrated one
 * message at a time.
 *
 * There is a sharper reason too. The transcription audit found the Outlook walkthrough had been
 * **fabricated** at some point, with "Save Calendar" and "Full Details" steps appearing in no source
 * document. Steps that send someone into a menu that does not exist are worse than no help at all,
 * and a model asked to recall them is exactly how that happens again. Held as data, guarded verbatim
 * by I11 hop 2, and rendered.
 */
export const RECLAIM_CALENDAR_EXPORT_STEPS = [
  {
    service: 'Google Calendar',
    steps: [
      'Open Google Calendar in a web browser (not the mobile app)',
      'Click the gear icon (Settings) in the top right',
      'Click Settings',
      'In the left sidebar, click Import & export',
      'Click Export',
      'A .zip file will download. Unzip it to find one or more .ics files',
      'Upload the .ics file for your main work calendar here',
    ],
  },
  {
    service: 'Outlook / Microsoft 365',
    steps: [
      'Open Outlook on the web or desktop',
      'Go to Calendar',
      'Click File (desktop) or Settings gear (web)',
      'Look for Export or Share calendar',
      'Choose the date range and save as .ics file',
      'Upload the .ics file here',
    ],
  },
  {
    service: 'Apple Calendar',
    steps: [
      'Open the Calendar app on Mac',
      'In the left sidebar, right-click the calendar you want to export',
      'Click Export',
      'Save the .ics file',
      'Upload it here',
    ],
  },
];

/**
 * The hand-off line that closes the export help (§ "Phase 1 — the calendar export walkthroughs").
 * A pause with no question in it, holding the thread open across a task the leader leaves to do.
 */
export const RECLAIM_CALENDAR_HANDOFF =
  'Take your time. When you have the file, upload it here and we will continue.';

/**
 * The operator-set consultation contact (§10). Seeded to Rashmir's published address; an operator
 * can change it from the config form. The consultation invitation appears once, at the end.
 */
export const RECLAIM_CONSULTATION_EMAIL = 'rashmir@rashmir.net';
