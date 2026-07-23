# Reclaim Your Week — slot definition spec

**Every slot slug is fixed here.** Do not invent, rename, or "improve" a slug. Downstream features
depend on exact names: F7 t-2's refer-back reads `reclaim_setup_keeping_me_up` and
`reclaim_setup_why_now` by slug, and F9 t-1's trend lines read `reclaim_current_hours__*` by slug.

Declared on the `ModuleDefinition` in F2 t-2 as `slotDefinitions`, synced at boot by
`syncRegisteredSlotDefinitions()`, `scope` auto-stamped `module:reclaim-audit`.

---

## Rules that apply to every slot

- **Sensitivity is `standard` or `sensitive`. Never `special_category`.** `slotMaskingPolicy`
  (`lib/framework/data-slots/capabilities/masking.ts:28-39`) replaces the prose value with a
  redaction marker at `special_category`. `reclaim_setup_keeping_me_up` classified that way would
  destroy the exact sentence F7 t-2 must quote back verbatim. `sensitive` is currently a no-op in the
  masking policy, which is what we want, but we still route every write through `slotMaskingPolicy`
  so a later reclassification cannot bypass it.
- **Only `reclaim_profile_*` slots may be written by the agent.** Everything else is written by the
  leaf via `saveAnswer()` with a `provenance.runId`. Enforced by the exposure allowlist in
  `AiAgentCapability.customConfig` and tested in F2 t-4.
- **Per-bucket slots use the canonical `bucketSlug`** from `content-source.md` §1, with hyphens
  converted to underscores. A user relabelling a bucket does **not** change the slug.

---

## Group: `reclaim_profile` — run-independent, agent-writable

The only group the agent may write. Carries across runs, so no `runId` is required.

| Slug                                 | dataType  | Sensitivity | Meaning                                                               |
| ------------------------------------ | --------- | ----------- | --------------------------------------------------------------------- |
| `reclaim_profile_first_name`         | `text`    | `standard`  | First name. Last name not collected (Brief §3).                       |
| `reclaim_profile_role`               | `text`    | `standard`  | CEO / Founder / Programme Officer / Philanthropist / Director / other |
| `reclaim_profile_org_type`           | `text`    | `standard`  | nonprofit / startup / established business / other                    |
| `reclaim_profile_direct_reports`     | `number`  | `standard`  | Count of direct reports                                               |
| `reclaim_profile_distributed_team`   | `boolean` | `standard`  | Team across locations / timezones / countries                         |
| `reclaim_profile_distributed_impact` | `text`    | `standard`  | How distribution affects how they lead and communicate                |

---

## Group: `reclaim_setup` — Phase 0, per run

| Slug                                 | dataType  | Sensitivity     | Meaning                                                                             |
| ------------------------------------ | --------- | --------------- | ----------------------------------------------------------------------------------- |
| `reclaim_setup_in_transition`        | `boolean` | `standard`      | Restructure, leadership change, pivot, rapid growth. Feeds the oversight exemption. |
| `reclaim_setup_transition_detail`    | `text`    | `standard`      | What the transition is                                                              |
| `reclaim_setup_fundraising_relevant` | `boolean` | `standard`      | **Gates whether bucket 6 appears at all**                                           |
| `reclaim_setup_fundraising_support`  | `text`    | `standard`      | Has a development team, or carrying it alone. Changes the benchmark.                |
| `reclaim_setup_weekly_hours`         | `number`  | `standard`      | Current average weekly hours. Feeds the bands.                                      |
| `reclaim_setup_priorities`           | `text`    | `standard`      | Top 3–5 priorities for the rest of this year                                        |
| `reclaim_setup_keeping_me_up`        | `text`    | **`sensitive`** | **Returned verbatim at F7 t-2. Never `special_category`.**                          |
| `reclaim_setup_why_now`              | `text`    | `sensitive`     | What made them want to do this now (Brief §3)                                       |
| `reclaim_setup_audit_period`         | `text`    | `standard`      | last week / last month / last quarter / last year                                   |

---

## Group: `reclaim_current` — Phase 1, per run

Two slots per bucket. Nine buckets, so eighteen slots — but `fundraising_capital` is written only
when `reclaim_setup_fundraising_relevant` is true.

| Slug pattern                       | dataType | Sensitivity |
| ---------------------------------- | -------- | ----------- |
| `reclaim_current_hours__<bucket>`  | `number` | `standard`  |
| `reclaim_current_detail__<bucket>` | `text`   | `sensitive` |

Bucket tokens, in display order:

```
deep_work
learning_development
strategic_planning
team_development
organisational_oversight
fundraising_capital        ← conditional
relationship_building
delivery_operations
recovery_white_space
```

Giving, in full:

`reclaim_current_hours__deep_work`, `reclaim_current_detail__deep_work`,
`reclaim_current_hours__learning_development`, `reclaim_current_detail__learning_development`,
`reclaim_current_hours__strategic_planning`, `reclaim_current_detail__strategic_planning`,
`reclaim_current_hours__team_development`, `reclaim_current_detail__team_development`,
`reclaim_current_hours__organisational_oversight`, `reclaim_current_detail__organisational_oversight`,
`reclaim_current_hours__fundraising_capital`, `reclaim_current_detail__fundraising_capital`,
`reclaim_current_hours__relationship_building`, `reclaim_current_detail__relationship_building`,
`reclaim_current_hours__delivery_operations`, `reclaim_current_detail__delivery_operations`,
`reclaim_current_hours__recovery_white_space`, `reclaim_current_detail__recovery_white_space`

Plus the deep-work specifics from the system prompt:

| Slug                                 | dataType  | Sensitivity | Meaning                                               |
| ------------------------------------ | --------- | ----------- | ----------------------------------------------------- |
| `reclaim_current_deep_block_exists`  | `boolean` | `standard`  | At least one protected 60–90 min block per day        |
| `reclaim_current_deep_block_when`    | `text`    | `standard`  | Where it sits, and whether it is in their peak window |
| `reclaim_current_deep_block_blocker` | `text`    | `sensitive` | If no: what gets in the way                           |

---

## Group: `reclaim_calendar` — Phase 1 optional branch, per run

**No meeting titles, ever.** Per-bucket totals only. This group is the reason there is no calendar
table: nothing per-event is persisted anywhere.

| Slug                                | dataType  | Sensitivity | Meaning                                                                                                   |
| ----------------------------------- | --------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `reclaim_calendar_uploaded`         | `boolean` | `standard`  | Whether the branch was taken                                                                              |
| `reclaim_calendar_completeness`     | `text`    | `standard`  | How much their calendar reflects their working life                                                       |
| `reclaim_calendar_period`           | `text`    | `standard`  | Period analysed                                                                                           |
| `reclaim_calendar_hours__<bucket>`  | `number`  | `standard`  | Calendar-derived hours per bucket. Same nine tokens.                                                      |
| `reclaim_calendar_total_hours`      | `number`  | `standard`  | Total calendar-visible hours                                                                              |
| `reclaim_calendar_events_per_day`   | `number`  | `standard`  | Task-switching profile                                                                                    |
| `reclaim_calendar_switch_frequency` | `text`    | `standard`  | The fifth structural metric: how often they switch between fundamentally different types of work in a day |
| `reclaim_calendar_back_to_back`     | `number`  | `standard`  | Back-to-back meetings with no transition                                                                  |
| `reclaim_calendar_longest_block`    | `number`  | `standard`  | Longest uninterrupted block, minutes                                                                      |
| `reclaim_calendar_reactive_time`    | `text`    | `sensitive` | Whether unscheduled time stays protected or gets consumed by reactive work                                |
| `reclaim_calendar_ambiguous_items`  | `json`    | `standard`  | Generic-titled events flagged for the user to confirm, with the tool's best guess + reasoning             |
| `reclaim_calendar_offcal_work`      | `text`    | `sensitive` | What fills the unaccounted hours                                                                          |
| `reclaim_calendar_messaging_load`   | `text`    | `sensitive` | Email / Slack that never hits the calendar                                                                |

---

## Group: `reclaim_energy` — Phase 2, per run

| Slug                              | dataType | Sensitivity | Meaning                                               |
| --------------------------------- | -------- | ----------- | ----------------------------------------------------- |
| `reclaim_energy_peak_windows`     | `json`   | `standard`  | Selected peak windows from the week grid              |
| `reclaim_energy_peak_description` | `text`   | `standard`  | When they are at their best, in their words           |
| `reclaim_energy_protected`        | `text`   | `sensitive` | Whether the schedule protects or consumes that window |

---

## Group: `reclaim_ideal` — Phase 3, per run

| Slug                                 | dataType | Sensitivity | Meaning                                                   |
| ------------------------------------ | -------- | ----------- | --------------------------------------------------------- |
| `reclaim_ideal_total_hours`          | `number` | `standard`  | Sustainable weekly total                                  |
| `reclaim_ideal_hours__<bucket>`      | `number` | `standard`  | Target hours per bucket. Same nine tokens.                |
| `reclaim_ideal_deep_block_when`      | `text`   | `standard`  | Where the daily deep work block would sit                 |
| `reclaim_ideal_protected_commitment` | `text`   | `sensitive` | The one commitment that would make the biggest difference |

---

## Group: `reclaim_gap` — Phase 4, per run

| Slug                              | dataType  | Sensitivity | Meaning                                                                                 |
| --------------------------------- | --------- | ----------- | --------------------------------------------------------------------------------------- |
| `reclaim_gap_summary`             | `json`    | `standard`  | Per-bucket deltas, computed                                                             |
| `reclaim_gap_hours_to_remove`     | `number`  | `standard`  | Total hours that need to come out, if any                                               |
| `reclaim_gap_unfunded_priorities` | `text`    | `sensitive` | Priorities with no protected time                                                       |
| `reclaim_gap_challenge_offered`   | `boolean` | `standard`  | **Once per audit, no more.** Guards the permission-based challenge.                     |
| `reclaim_gap_challenge_response`  | `text`    | `sensitive` | Their response to it                                                                    |
| `reclaim_gap_strategy_mirror`     | `text`    | `sensitive` | "If a stranger read your calendar, what would they say your priorities are?" (Brief §5) |

---

## Group: `reclaim_action` — Phase 5, per run

| Slug                                | dataType | Sensitivity | Meaning                                         |
| ----------------------------------- | -------- | ----------- | ----------------------------------------------- |
| `reclaim_action_options`            | `json`   | `standard`  | The three entry points offered                  |
| `reclaim_action_chosen`             | `text`   | `standard`  | What they will do                               |
| `reclaim_action_when`               | `text`   | `standard`  | When they will start                            |
| `reclaim_action_stopping`           | `text`   | `sensitive` | What they will say no to or stop                |
| `reclaim_action_how_known`          | `text`   | `standard`  | How they will know it worked                    |
| `reclaim_action_wanted_not_dutiful` | `text`   | `sensitive` | **Brief §5.** Want to do, or think they should? |

---

## Group: `reclaim_reflection` — the required pauses, per run

**These are the enforcement point for the unskippable reflection.** The phase transition route
returns `422 REFLECTION_REQUIRED` when the slot for the phase being left is absent.

| Slug                    | dataType | Sensitivity | Pause after                                                |
| ----------------------- | -------- | ----------- | ---------------------------------------------------------- |
| `reclaim_reflection_p1` | `text`   | `sensitive` | Phase 1 visual. "What stands out to you here?"             |
| `reclaim_reflection_p2` | `text`   | `sensitive` | Phase 2 energy                                             |
| `reclaim_reflection_p3` | `text`   | `sensitive` | Phase 3 ideal week                                         |
| `reclaim_reflection_p4` | `text`   | `sensitive` | Phase 4 gap analysis. "What are you noticing?"             |
| `reclaim_reflection_p5` | `text`   | `sensitive` | Phase 5 action plan. "What are you taking away from this?" |

There is deliberately no `reclaim_reflection_p0`. Phase 0 is a form, not a reveal.

---

## Group: `reclaim_share` — Phase 6, per run. All optional.

Brief §3: these appear **only if** the user chooses to share. Framed as contributing to the
aggregate picture, not as profiling. Every one carries a "prefer not to say" option.

| Slug                          | dataType  | Sensitivity | Meaning                                       |
| ----------------------------- | --------- | ----------- | --------------------------------------------- |
| `reclaim_share_with_coach`    | `boolean` | `standard`  | Chose to share results with Rashmir           |
| `reclaim_share_age_band`      | `text`    | `sensitive` | Broad bands, optional                         |
| `reclaim_share_demographic_1` | `text`    | `sensitive` | TBC — Rashmir owes the question               |
| `reclaim_share_demographic_2` | `text`    | `sensitive` | TBC — Rashmir owes the question               |
| `reclaim_share_takeaway`      | `text`    | `sensitive` | "In a sentence: what did you take from this?" |
| `reclaim_share_quotable`      | `boolean` | `standard`  | "Happy for this to be quoted anonymously"     |

---

## Count

| Group                | Slots                            |
| -------------------- | -------------------------------- |
| `reclaim_profile`    | 6                                |
| `reclaim_setup`      | 9                                |
| `reclaim_current`    | 21 (18 per-bucket + 3 deep-work) |
| `reclaim_calendar`   | 21 (9 per-bucket + 12 fixed)     |
| `reclaim_energy`     | 3                                |
| `reclaim_ideal`      | 12 (9 per-bucket + 3 fixed)      |
| `reclaim_gap`        | 6                                |
| `reclaim_action`     | 6                                |
| `reclaim_reflection` | 5                                |
| `reclaim_share`      | 6                                |
| **Total**            | **95**                           |

The earlier estimate of "~45" undercounted because it did not expand the per-bucket slots. The count
rose from 91 to **95** when the coverage audit added four slots: `reclaim_calendar_switch_frequency`,
`reclaim_calendar_reactive_time`, `reclaim_calendar_ambiguous_items`, and `reclaim_gap_strategy_mirror`.
Most slots are generated from the bucket list rather than hand-written.
