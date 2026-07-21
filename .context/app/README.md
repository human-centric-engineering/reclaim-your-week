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

## Where the app code lives

| Concern      | Location                             |
| ------------ | ------------------------------------ |
| Domain logic | `lib/app/programme/**`               |
| Boot wiring  | `lib/app/leaf-bootstrap.ts`          |
| Admin nav    | `lib/app/leaf-admin-nav.ts`          |
| HTTP API     | `app/api/v1/app/**`                  |
| Admin UI     | `app/admin/programme/**`             |
| End-user UI  | `app/(protected)/programme/**`       |
| Models       | `prisma/schema/app-programme.prisma` |
| Migrations   | `<timestamp>_app_<feature>`          |

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
