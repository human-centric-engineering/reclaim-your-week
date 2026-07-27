/**
 * The `reclaim-audit` module definition (F2 t-1).
 *
 * This is the leaf's one registered `ModuleDefinition` — the code half of the
 * framework module (`lib/framework/modules/definition.ts`). It declares the module's
 * stable identity, its admin-tunable `configSchema` (the coach-editable content
 * Rashmir can reword without a deploy — I11), and the agent *seat* an `AiAgent` is
 * bound into. It is registered from `initLeafApp()` (`lib/app/leaf-bootstrap.ts`),
 * before the boot-time `syncFramework()`.
 *
 * Scope grew across F2's tasks, so no half-built surface landed early:
 *   - t-1: identity + `configSchema` *shape* + the `coach` agent seat.
 *   - t-2: `slotDefinitions` — the 105 slots from `slot-spec.md` (`./slots.ts`).
 *   - t-3 (here): the `configSchema` `.default(...)` values, Rashmir's content *verbatim*
 *     from `content-source.md` via `./content.ts` (guarded character-identical, I11 hop 2).
 *
 * `programme` is the surface, `reclaim` is the module: this file is module identity,
 * so it is `reclaim`-named; there is no per-module subfolder until a second module
 * exists (`.context/app/README.md`).
 */

import { z } from 'zod';
import type { ModuleDefinition } from '@/lib/framework/modules';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { RECLAIM_MODULE_SLUG, RECLAIM_COACH_ROLE } from '@/lib/app/programme/identity';
import { ReclaimRecordAnswersCapability } from '@/lib/app/programme/coach/capabilities/record-answers';
import { RECLAIM_PHASE_SIGNPOSTS } from '@/lib/app/programme/runs/signposts';
import {
  RECLAIM_GOVERNING_FRAME,
  RECLAIM_DEEP_WORK_NOTE,
  RECLAIM_FOOTNOTE,
  RECLAIM_RECENT_AUDIT_CONFIRM,
  RECLAIM_BUCKETS,
  RECLAIM_HOUR_BANDS,
  RECLAIM_CONSULTATION_EMAIL,
} from '@/lib/app/programme/content';

/**
 * The stable identifiers, defined in `./identity.ts` and re-exported here so every existing import
 * site is unchanged. They live in their own file because `slots/write.ts` needs the slug, and the
 * coach's capabilities are declared on the module below, which would otherwise be a cycle.
 */
export { RECLAIM_MODULE_SLUG, RECLAIM_COACH_ROLE } from '@/lib/app/programme/identity';

/**
 * One of the nine buckets (`content-source.md` §1). The `slug` is the canonical
 * `bucketSlug` — the storage key that never changes even when a user relabels a
 * bucket for their own audit (I7). `description` is Rashmir's diagnostic prose and
 * is filled **verbatim** in t-3 (empty here). `benchmark.note` is the human range
 * text; the optional percentages feed F6 t-3's chart markers where a bucket has one.
 */
const bucketConfigSchema = z.object({
  slug: z.string(),
  title: z.string(),
  /** Verbatim diagnostic prose from §1 — filled and guarded in t-3 (I11). */
  description: z.string(),
  /** Chart colour (hex) from §1. */
  colour: z.string(),
  benchmark: z.object({
    /** Free-text range as Rashmir wrote it (e.g. "15–20%", "ceiling 10–15%", "no percentage range"). */
    note: z.string(),
    /** Lower bound as a percentage of working time, or null where the bucket has no percentage range. */
    lowPercent: z.number().nullable(),
    /** Upper bound as a percentage of working time, or null (e.g. an open-ended floor/minimum). */
    highPercent: z.number().nullable(),
  }),
  /** Fundraising is the one conditional bucket — shown only when Phase 0 marks it relevant. */
  conditional: z.boolean(),
});

/** One total-hours band (`content-source.md` §3). `upperHours` is null for the open-ended 55+ band. */
const hourBandSchema = z.object({
  slug: z.string(),
  lowerHours: z.number(),
  upperHours: z.number().nullable(),
  label: z.string(),
});

/**
 * One phase's signpost — the card that opens the phase before anyone speaks
 * (`sources/Time_Audit_Tool_Prompt_Text.md:31`).
 *
 * `opening` is an **array of paragraphs, not one string**, and that shape is load-bearing rather than
 * stylistic. Phase 0's default is `[RECLAIM_WARM_OPEN, RECLAIM_PROCESS_OUTLINE]`, and the second of
 * those is Rashmir's, pinned character-identical to a `content-source.md` blockquote by I11 hop 2.
 * One concatenated string would fuse a guarded field into an unguarded one and hop 2 could no longer
 * compare it against the source at all. Keeping the beats separate also matches the source, which
 * scripts phase 0 as a warm open **then** an outline ending on a question.
 */
const phaseSignpostSchema = z.object({
  phaseKey: z.string(),
  involves: z.string(),
  duration: z.string(),
  opening: z.array(z.string()),
});

/**
 * The coach-editable content, as a Zod schema (decision A4). The generic admin config
 * form renders from it (F10 t-4) and the API validates operator input against it, so
 * Rashmir rewords a bucket description or the footnote without a deploy (I11). Every
 * field defaults so `reclaimConfigSchema.parse({})` yields a valid config; t-3 filled the
 * defaults with Rashmir's verbatim content from `./content.ts` (§0 frame, nine buckets,
 * deep-work note, hour bands, footnote), guarded character-identical to `content-source.md`.
 */
export const reclaimConfigSchema = z.object({
  /** The governing frame — "this is not a productivity exercise" (§0, I-frame). Verbatim. */
  governingFrame: z.string().default(RECLAIM_GOVERNING_FRAME),
  /** The nine buckets, in display order (§1). Descriptions verbatim (I11 hop-2 guarded). */
  buckets: z.array(bucketConfigSchema).default(RECLAIM_BUCKETS),
  /** The cross-cutting deep-work note (§2). Verbatim. */
  deepWorkNote: z.string().default(RECLAIM_DEEP_WORK_NOTE),
  /** The three total-hours bands (§3). */
  hourBands: z.array(hourBandSchema).default(RECLAIM_HOUR_BANDS),
  /** The summary footnote (§9) — must not be reworded (I11 hop-2 guarded). Verbatim. */
  footnote: z.string().default(RECLAIM_FOOTNOTE),

  /**
   * The per-phase signpost cards, which are how a phase opens itself.
   *
   * Config rather than constants because a signpost is the first thing a leader reads in a phase and
   * Brief §7 puts the register of the whole product on the same footing as any single page. Rashmir
   * should be able to change how a phase greets someone without a deploy, exactly as she can change a
   * bucket description. Mostly **our** orientation copy rather than hers, which is why the content
   * editor marks these fields differently (`sourceKind: 'authored'`): "differs from source" is a
   * sentence about a source document, and this copy has none.
   */
  phaseSignposts: z.array(phaseSignpostSchema).default(RECLAIM_PHASE_SIGNPOSTS),

  /**
   * F9 t-2 — the recent-audit shortcut's confirm line (§4). Verbatim, interpolated at render.
   * Coach-editable like the rest of her words, and guarded against paraphrase in hop 2.
   */
  recentAuditConfirm: z.string().default(RECLAIM_RECENT_AUDIT_CONFIRM),

  /**
   * F9 t-2 — how recently an audit must have finished for the shortcut to apply, in days.
   *
   * §4 says "within the last month". That is a policy rather than a constant, and F8 established the
   * pattern for Rashmir's "or something like that" numbers: they live in `Module.config` so she can
   * change them without a deploy.
   */
  recentAuditWithinDays: z.number().int().min(1).max(365).default(31),

  /**
   * F9 t-3 — the quarterly nudge's window, in days after a completed audit.
   *
   * Brief §2: "the natural cadence is quarterly … gentle and quarterly rather than frequent". Both
   * ends are Rashmir's to move, and the upper one matters as much as the lower: past it the product
   * says nothing, rather than mailing a dormant cohort a note claiming their audit was "about three
   * months ago".
   */
  nudgeAfterDays: z.number().int().min(7).max(365).default(90),
  nudgeUntilDays: z.number().int().min(14).max(730).default(200),
  /** Where the once-at-the-end consultation invitation points. Operator-set; seeded from §10. */
  consultationEmail: z.string().default(RECLAIM_CONSULTATION_EMAIL),
  /**
   * **Where the strategy mirror sits** (plan.md open item 10, decided 2026-07-26).
   *
   * Brief §5 asks for it "somewhere in the audit when useful", then hedges: "though this could be in
   * a follow up audit". Three placements follow from that, and the shipped `boolean` could express
   * only two of them — so the question the plan actually asked ("run 1, repeat audits only, or
   * both?") was unanswerable without a deploy. An enum makes all three hers to pick, and the
   * framework's generic config form renders it as a select.
   *
   * `always` is the default because the hedge is a "could", not a preference, and because nearly
   * everyone at launch is on their first audit: `repeat_only` would hide the feature at exactly the
   * moment it is being reviewed.
   *
   * **Why this is a new key rather than a retyped one.** `saveModuleConfig` replaces the whole config
   * row and `saveStoredContent` writes a fully-parsed `ReclaimConfig`, so the moment Rashmir saves
   * the content editor once, `strategyMirror: false` is persisted as a boolean. `readReclaimConfig`
   * parses all-or-nothing and falls back to `parse({})` on failure — so retyping the key in place
   * would fail that parse and silently revert **every** value she had edited, content strings
   * included. `z.object` strips unknown keys, so the retired boolean is now simply ignored. No
   * migration, no risk.
   */
  strategyMirrorMode: z.enum(['off', 'always', 'repeat_only']).default('always'),

  /**
   * **The Phase 2 coaching signal is gone, deliberately** (plan.md open item 11, decided 2026-07-26).
   *
   * `phase2CoachingSignal` used to live here, default off, pending Rashmir's ruling on a conflict:
   * the older system prompt tells the facilitator to signal that coaching goes deeper in Phase 2,
   * while Brief §2 says consultation offers appear "at the end and in follow-up, never mid-process".
   * `sources/README.md`'s precedence rule says the Brief wins, and Phase 6 already carries the one
   * offer.
   *
   * The flag is **removed** rather than left off because the string behind it is facilitator
   * instruction voice, not leader-facing copy ("Where useful, signal that a dedicated coaching
   * conversation with Rashmir can go much further here"). Rendered to a leader it reads as leaked
   * prompt, so there is no state in which flipping it is correct, and a checkbox in the generic
   * config form is not a safe place to keep that. Her sentence is untouched in `./content.ts` and
   * still guarded verbatim; reinstating the signal means authoring a leader-facing line with her,
   * which was always the real work.
   */

  /**
   * F8 access policy (Brief §8). Coach-editable for the same reason as the toggles above — she wrote
   * "a 12 month usage option … initiation must happen within a month of being given access (**or
   * something like that**)", and "or something like that" is a policy she should be able to change
   * without a deploy.
   */
  clientWindowMonths: z.number().int().min(1).max(60).default(12),
  clientMustStartWithinDays: z.number().int().min(1).max(365).default(30),

  /**
   * F8 t-4 — **open-signup readiness** (reconciliation 7). v1 ships invite-only, so this is `false`:
   * an account with no invite cannot start an audit. Turning it on mints a standard-tier grant for
   * any account instead, which is how the door opens **without a code change** when Rashmir is ready.
   * Brief §1 names list growth as the tool's first job; Brief §2 says "we open the doors deliberately
   * rather than by default".
   */
  openSignup: z.boolean().default(false),

  /**
   * F11 — **group invite links**: the defaults a new link is minted with, and the ceiling it may
   * never exceed.
   *
   * Coach-editable for the same reason the client window is: how many people are in the room, and
   * how long a link should stay live afterwards, are facts about how Rashmir runs a session and not
   * decisions an engineer should be re-deploying for.
   *
   * The ceiling is the one that is doing safety work rather than convenience work. A link is a bearer
   * capability — whoever holds the URL can claim a standard-tier audit — so `joinLinkMaxClaims`
   * bounds the blast radius of a link that gets forwarded, screenshotted, or posted somewhere it was
   * never meant to go. It is deliberately a *ceiling on the form*, not a suggestion: the mint path
   * refuses a larger number rather than clamping to it, because a silently reduced cap is how you end
   * up with a room of thirty people where ten can get in.
   */
  joinLinkDefaultMaxClaims: z.number().int().min(1).max(500).default(10),
  joinLinkDefaultDays: z.number().int().min(1).max(90).default(7),
  joinLinkMaxClaims: z.number().int().min(1).max(500).default(50),

  /**
   * F8 t-4 — the version of terms + privacy a leader must have accepted before starting an audit.
   * Bumping this string requires everyone to accept again, which is the point: consent is to a
   * *version*. The clauses themselves are Rashmir's to supply (plan.md open item 7); this default is a
   * placeholder so the mechanism is testable before the text exists.
   */
  policyVersion: z.string().min(1).default('draft-1'),

  /**
   * F10 t-1 — **when an unfinished audit counts as stalled**, in days since the last answer.
   *
   * "Abandoned at which phase" (Brief §2) is a definition before it is a query: an audit is designed
   * to be left and resumed, so silence is not abandonment until it has gone on long enough to be
   * worth a note. Coach-editable because only Rashmir knows how long is too long for her cohort, and
   * the admin surface states the current rule wherever it shows the column — an unexplained
   * "abandoned" badge is a judgement about a person, which is the one thing these screens must not be.
   */
  abandonedAfterDays: z.number().int().min(1).max(365).default(21),

  /**
   * F10 t-3 — **the minimum cohort behind any aggregate figure.** Below this, a cell renders
   * suppressed rather than as a number. Brief §2 promises individual data stays confidential, and in
   * a private beta "the average across nonprofit CEOs" can quietly be one identifiable person.
   */
  aggregateMinimumCohort: z.number().int().min(2).max(100).default(5),
});

/** The parsed shape of `reclaimConfigSchema` — the coach-editable config the app reads. */
export type ReclaimConfig = z.infer<typeof reclaimConfigSchema>;

/**
 * The `reclaim-audit` module definition. The verbatim config defaults (t-3) are added
 * in their own task; `slotDefinitions` (the 105 from `./slots.ts`) and the `coach` seat
 * are declared now — the slots so F3's boot sync reconciles them, the seat so F3 can bind
 * the agent into it.
 */
export const reclaimAuditModule: ModuleDefinition = {
  slug: RECLAIM_MODULE_SLUG,
  name: 'Reclaim Your Week',
  description:
    "Rashmir Balasubramaniam's guided time audit — a structured, multi-phase reflection on how a leader's week is actually spent, and what a next level of leadership might ask them to let go of.",
  configSchema: reclaimConfigSchema,
  slotDefinitions: reclaimSlotDefinitions,
  agentRoles: [RECLAIM_COACH_ROLE],
  // The coach's own tools. Declaring them here rather than through `initAppCapabilities()` is what
  // gets each one both halves at boot: the dispatcher handler and the `ai_capability` row an agent
  // must be granted against. The framework namespaces them (`reclaim_audit__record_answers`) and
  // refuses any dispatch whose scope pins a different module.
  capabilities: [new ReclaimRecordAnswersCapability()],
};
