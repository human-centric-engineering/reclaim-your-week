# Reclaim Your Week — app docs (`.context/app/`)

Entry point for the **app tier's** documentation. This namespace holds everything
specific to Reclaim Your Week — the facilitated programme built on Daybreak. The
tiers below are documented separately: the **framework** at
[`../framework/README.md`](../framework/README.md), the **platform** at
[`../substrate.md`](../substrate.md).

> **Why a separate root.** Each tier reserves the `app` namespace for the tier
> above it — `lib/app/`, `app/api/v1/app/`, `prisma/schema/app-*.prisma`,
> `prisma/seeds/app-*/`. Mirroring that in the docs gives one clean "this is the
> app, not the framework or the platform" boundary across code _and_ docs. We own
> `.context/app/**`; everything else merges through on each upstream sync.

## The three tiers

| Tier                  | Is                      | Owns                                                                  | Docs                  |
| --------------------- | ----------------------- | --------------------------------------------------------------------- | --------------------- |
| **Sunrise**           | the platform            | core `lib/`, `components/`, `app/api/v1` core                         | `.context/<domain>/`  |
| **Daybreak**          | the framework, upstream | `lib/framework/`, `framework-*.prisma`, the three `lib/app/*` bridges | `.context/framework/` |
| **Reclaim Your Week** | this app, the leaf      | `lib/app/*` scaffolds + `leaf-*` hooks, `app-*.prisma`, own routes/UI | **`.context/app/`**   |

**The load-bearing rule, applied twice** (Sunrise→Daybreak, Daybreak→us): a tier
extends the tier below through seams; it never occupies the surface reserved for
its own forks. We are the leaf — nothing forks us, so we reserve nothing and the
`lib/app/*` surface is ours to fill.

### The bridge trap

Daybreak fills three `lib/app/*` files — `bootstrap.ts`, `admin-nav.ts`,
`db-drift.ts` — because those registrations must run in a realm `initFramework()`
cannot reach. Each one runs Daybreak's registration and **then calls our hook**:

| Daybreak's bridge (do NOT edit) | Delegates to (ours) | Our export                  |
| ------------------------------- | ------------------- | --------------------------- |
| `lib/app/bootstrap.ts`          | `leaf-bootstrap.ts` | `initLeafApp()`             |
| `lib/app/admin-nav.ts`          | `leaf-admin-nav.ts` | `initLeafAdminNav()`        |
| `lib/app/db-drift.ts`           | `leaf-db-drift.ts`  | `registerLeafDriftProbes()` |

Editing a bridge conflicts on every Daybreak upgrade. Always edit the `leaf-*` file.

## What is in this folder

| Doc                                        | Is                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [`sources/`](./sources/README.md)          | **The authority.** Rashmir's five originals, byte-identical and **read-only**  |
| [`invariants.md`](./invariants.md)         | **Read before writing any code.** I1–I18 + I-frame + I-composite               |
| [`content-source.md`](./content-source.md) | Working extract of `sources/`, verbatim. Loads into `Module.config` (I11)      |
| [`slot-spec.md`](./slot-spec.md)           | The 105 slot definitions — exact slugs, dataType, sensitivity                  |
| [`coverage-audit.md`](./coverage-audit.md) | The source-instruction audit: carries / becomes UI / retired / gap             |
| [`daybreak-asks.md`](./daybreak-asks.md)   | Framework changes we carry + defects we find, so a sync knows what to delegate |
| [`planning/`](./planning/README.md)        | The feature board, the execution rhythm, and the retro                         |

The first four are the **system of record** for content, data shape, and rules. `planning/plan.md` is
the build breakdown that consumes them. Start a feature at
[`planning/building-a-feature.md`](./planning/building-a-feature.md).

## Where the app code lives

| Concern      | Location                           |
| ------------ | ---------------------------------- |
| Domain logic | `lib/app/programme/**`             |
| Boot wiring  | `lib/app/leaf-bootstrap.ts`        |
| Admin nav    | `lib/app/leaf-admin-nav.ts`        |
| HTTP API     | `app/api/v1/app/**`                |
| Admin UI     | `app/admin/programme/**`           |
| End-user UI  | `app/(protected)/programme/**`     |
| Models       | `prisma/schema/app-reclaim.prisma` |
| Migrations   | `<timestamp>_app_<feature>`        |

### The working title is baked into the identifiers, deliberately

Brief header: _"The name is a working title. It will be tested against real audiences before launch,
so please treat it as good enough to build with rather than final branding."_

It is nonetheless the root of the module slug `reclaim-audit`, 105 `reclaim_*` slot slugs, eight
`app_reclaim_*` tables, `prisma/seeds/app-reclaim/` and `smoke:reclaim` — and I7 says canonical slugs
never change. **That is the intended outcome, not an oversight.** These identifiers are internal
storage keys that no user ever sees; renaming them on a rebrand would mean a data migration across
every slot value and audit run, for zero user-visible gain. A rebrand changes
`NEXT_PUBLIC_APP_NAME`, the brand mark, and the copy. It does not change the slugs.

The one thing to keep honest: never let the working title leak into user-facing strings via a slug.
User-facing names come from `Module.config` and brand env, both of which Rashmir can change without a
deploy.

**`programme` is the surface, `reclaim` is the module.** Routes, URLs, UI folders and shared leaf
plumbing are `programme` — they are module-agnostic, and the Parked life-wheel would live behind the
same surface. Identity and persistence are `reclaim`: the module slug `reclaim-audit`, the 95
`reclaim_*` slots, the `app_reclaim_*` tables, `prisma/seeds/app-reclaim/`, `smoke:reclaim`. Do not
introduce per-module subfolders under `lib/app/programme/` until there is a second module.

`prisma/schema/app.prisma` is **not** ours despite the name — Sunrise still keeps
`ContactSubmission`, `FeatureFlag` and `AuthBootstrap` there. Add new
`app-<domain>.prisma` files alongside it instead.

## Upstream sync log

Daybreak has no version file of its own, so we record the commit instead. To find
where we currently sit: `git merge-base HEAD upstream/main`.

| Date       | Daybreak commit | Sunrise version | Notes                                                 |
| ---------- | --------------- | --------------- | ----------------------------------------------------- |
| 2026-07-21 | `3846f4c0`      | 0.7.0           | Forked from Daybreak main                             |
| 2026-07-21 | `c9e9fa26`      | 0.7.0           | daybreak#154 — cold-lint fix, needed for our first CI |

On every sync, also check [`daybreak-asks.md`](./daybreak-asks.md) — if Daybreak has landed
something we carry, delete our copy and delegate — and re-verify the `lib/framework/**` file:line
citations in [`invariants.md`](./invariants.md) (I5, I6, I14, I15), which were exact on 2026-07-23
and drift silently.

To sync: `git fetch upstream && git merge upstream/main`, then
`npm run db:migrate:status` → `db:migrate:dev`. Resolve conflicts by keeping our
version and adding follow-ups. Expect the conflict surface to be limited to the
files we deliberately diverged: `package.json`, `README.md`, `CLAUDE.md`,
`.github/ISSUE_TEMPLATE/config.yml`.

## Local development

The app runs on **port 3001** so Daybreak can keep 3000 and both can run at once:

```bash
npm run dev -- -p 3001
```

Local database is `reclaim_your_week` (Postgres.app on :5432, pgvector). LLM
provider API keys live in the **database**, not `.env.local` — set them in
admin → orchestration → Providers.

## Related

- [`../../README.md`](../../README.md) · [`../../CLAUDE.md`](../../CLAUDE.md) — intro + AI working rules
- [`../../CUSTOMIZATION.md`](../../CUSTOMIZATION.md) — the seam model and extension points
- [`../framework/README.md`](../framework/README.md) — the Daybreak framework
- [`../substrate.md`](../substrate.md) — the Sunrise platform docs index
