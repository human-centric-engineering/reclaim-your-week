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
export const RECLAIM_GOVERNING_FRAME =
  'This is not a productivity exercise. It is an invitation for the leader to step into their next level of leadership. That may require some letting go, e.g. of doing too much, of being indispensable, of an identity built around individual achievement, effort and output. Hold that possibility with care throughout.';

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
 * The operator-set consultation contact (§10). Seeded to Rashmir's published address; an operator
 * can change it from the config form. The consultation invitation appears once, at the end.
 */
export const RECLAIM_CONSULTATION_EMAIL = 'rashmir@rashmir.net';
