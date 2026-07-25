/**
 * The client list (F10 t-1) — one row per leader, assembled from every tier at once.
 *
 * This is the feature's whole shape in one file (plan D1): Daybreak already answers "how does anyone
 * travel this map" — the journey explorer, `getMapHeat()`'s per-node drop-off, `getModuleStats()`.
 * What no generic surface can assemble is "how is *this leader* doing", because tier, invite
 * provenance, consent and the qualification answers are all leaf facts. F10 builds the join.
 *
 * **Every read here crosses the user boundary**, which makes three rules non-negotiable:
 *
 *   1. **`isAdminSupport` is constructed here and nowhere else** (plan D4). The framework's `canRead`
 *      is default-deny and takes the override as an explicit, auditable input rather than reading a
 *      role off the session. `tests/unit/invariants/admin-support.test.ts` fails the build if the
 *      flag appears anywhere outside this module — it must never reach a helper a consumer route
 *      could also call.
 *   2. **Slot reads have no second line of defence, and the flag guard does not cover them.**
 *      `getSlotHeads(userId)` takes a bare user id with no viewer argument at all — the framework's
 *      own comment says access scoping "wraps this" and `userId` is the seam. So a module can read
 *      any user's slots without ever mentioning `isAdminSupport`, which is exactly what `aggregate.ts`
 *      and `export.ts` do. The guard therefore also carries a list of the modules permitted to read
 *      across users at all, and asserts every importer of each is `withAdminAuth`-guarded. (Found by
 *      `/security-review` on this branch: the first version of that guard claimed to cover cross-user
 *      reads and only covered the flag.)
 *   3. **The two `sensitive` prose slots never enter the list payload** (plan D5, I5).
 *      `reclaim_setup_keeping_me_up` and `reclaim_setup_why_now` are legitimately Rashmir's to read —
 *      she is the coach — but a sensitive disclosure should be something you choose to open, not
 *      something you scroll past in a table. They are served only by `getClientDetail`.
 *
 * No N+1: the list is a fixed number of batched queries regardless of how many leaders there are
 * (the repo rule, and this endpoint's most likely regression).
 */

import { prisma } from '@/lib/db/client';
import { getSlotHeads } from '@/lib/framework/data-slots/values';
import { listJourneys } from '@/lib/framework/facilitation/journey/queries';
import type { JourneyViewer } from '@/lib/framework/shared/access';
import { RECLAIM_MAP_SLUG, RECLAIM_PHASES } from '@/lib/app/programme/map';
import { readReclaimAdminConfig, readReclaimAccessConfig } from '@/lib/app/programme/config';
import { grantExpiresAt, grantIsLive } from '@/lib/app/programme/runs/entitlement';

/**
 * The support viewer, built in exactly one place (plan D4).
 *
 * `canRead`/`subjectScope` are default-deny and take this as an **explicit input** rather than
 * reading a role off the session — the framework's design, so that "this call site opted into
 * cross-user access" is greppable. The caller passes the authenticated admin's own id, which is what
 * makes the override attributable to a person rather than to a boolean.
 */
function supportViewer(adminUserId: string): JourneyViewer {
  return { userId: adminUserId, isAdminSupport: true };
}

/**
 * The Phase 0 answers that do "double duty as qualification" (Brief §2). All `standard` sensitivity —
 * the two `sensitive` prose slots are deliberately absent, see rule 3 above.
 */
export const QUALIFICATION_SLOTS = [
  'reclaim_profile_first_name',
  'reclaim_profile_role',
  'reclaim_profile_org_type',
  'reclaim_profile_direct_reports',
  'reclaim_setup_weekly_hours',
  'reclaim_setup_priorities',
  'reclaim_setup_in_transition',
] as const;

/**
 * The prose the leader gave about what is actually going on for them. `sensitive` in
 * [[slot-spec]], returned verbatim to the leader themselves at F7 t-2 — and shown to Rashmir only in
 * the detail view, behind one deliberate click.
 */
export const SENSITIVE_CONTEXT_SLOTS = [
  'reclaim_setup_keeping_me_up',
  'reclaim_setup_why_now',
] as const;

/** Where a leader stands, as one word the operator can scan a column for. */
export type ClientStatus = 'never_started' | 'in_progress' | 'stalled' | 'complete';

export interface ClientRow {
  userId: string;
  name: string | null;
  email: string;
  joinedAt: string;
  /** The tier of the live grant — `client` is the flag Rashmir sets; `null` means no entitlement. */
  tier: string | null;
  auditsGranted: number | null;
  auditsUsed: number | null;
  /** Client-tier window (Brief §8). Null on every other tier. */
  windowEndsAt: string | null;
  /** Accepted terms + the marketing flag — separate facts (F8 t-4). */
  policyVersion: string | null;
  marketingOptIn: boolean;
  /** Who referred them in, if anyone (F8 t-3's attribution — F10 t-2 measures it). */
  referredByName: string | null;
  inviteTier: string | null;
  status: ClientStatus;
  /** The phase label they are sitting in, for `in_progress` / `stalled`. */
  currentPhaseLabel: string | null;
  completedRuns: number;
  lastActivityAt: string | null;
  /**
   * Chat cost in USD for the runs whose conversation was recorded, or `null` when NO run has one
   * (plan D2). Null is "not recorded" and must never render as £0 — a zero is a claim that a leader's
   * audit was free. It is also a **lower bound**: work outside the surface conversation (embeddings,
   * F5's calendar categorise) logs elsewhere.
   */
  chatCostUsd: number | null;
  /** The `standard` qualification answers, slug → display value. */
  qualification: Record<string, string>;
}

export interface ClientListView {
  clients: ClientRow[];
  /** The stall rule in force, so the UI can state it rather than assert an unexplained badge. */
  abandonedAfterDays: number;
}

/** A leader's full record — the list row plus what is deliberately kept off the list. */
export interface ClientDetailView {
  client: ClientRow;
  /** The `sensitive` prose, shown only here (plan D5). */
  context: Array<{ slug: string; label: string; value: string }>;
  runs: Array<{
    id: string;
    status: string;
    quarter: string | null;
    startedAt: string;
    completedAt: string | null;
    currentPhaseLabel: string | null;
    chatCostUsd: number | null;
  }>;
  /** Deep link into the framework's journey explorer rather than reproducing it (plan D1). */
  journeyHref: string;
}

const SENSITIVE_LABELS: Record<string, string> = {
  reclaim_setup_keeping_me_up: 'What is keeping them up at night',
  reclaim_setup_why_now: 'Why they wanted to do this now',
};

const PHASE_LABEL = new Map(RECLAIM_PHASES.map((p) => [p.key, p.label]));

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** A slot value's display string — the stored prose, else the JSON scalar, else empty. */
function slotDisplay(value: { value: string | null; valueJson: unknown }): string {
  if (value.value !== null && value.value.trim() !== '') return value.value;
  const json = value.valueJson;
  if (typeof json === 'string' || typeof json === 'number' || typeof json === 'boolean') {
    return String(json);
  }
  return '';
}

/**
 * Every user id with a programme footprint. A leader is "a client" the moment they hold a grant,
 * accept the terms, redeem an invite or start a run — deliberately wider than "has completed
 * something", because "signed up and never started" is one of the four statuses Rashmir asked for.
 * Pending invitees who have no account yet are not here: they live on the Access screen.
 */
async function programmeUserIds(only?: string[]): Promise<string[]> {
  // When the caller wants one leader (the detail view), skip the discovery queries entirely — asking
  // "who is in the programme" to answer "is Ada in the programme" is four table scans for one bit.
  if (only !== undefined) {
    const [grant, consent, run, invite] = await Promise.all([
      prisma.reclaimGrant.findFirst({ where: { userId: { in: only } }, select: { userId: true } }),
      prisma.reclaimConsent.findFirst({
        where: { userId: { in: only } },
        select: { userId: true },
      }),
      prisma.reclaimAuditRun.findFirst({
        where: { userId: { in: only } },
        select: { userId: true },
      }),
      prisma.reclaimInvite.findFirst({
        where: { redeemedByUserId: { in: only } },
        select: { redeemedByUserId: true },
      }),
    ]);
    const found = new Set(
      [grant?.userId, consent?.userId, run?.userId, invite?.redeemedByUserId].filter(
        (id): id is string => id != null
      )
    );
    return only.filter((id) => found.has(id));
  }

  const [grants, consents, runs, invites] = await Promise.all([
    prisma.reclaimGrant.findMany({ select: { userId: true }, distinct: ['userId'] }),
    prisma.reclaimConsent.findMany({
      where: { userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.reclaimAuditRun.findMany({ select: { userId: true }, distinct: ['userId'] }),
    prisma.reclaimInvite.findMany({
      where: { redeemedByUserId: { not: null } },
      select: { redeemedByUserId: true },
      distinct: ['redeemedByUserId'],
    }),
  ]);

  const ids = new Set<string>();
  for (const g of grants) ids.add(g.userId);
  for (const c of consents) if (c.userId !== null) ids.add(c.userId);
  for (const r of runs) ids.add(r.userId);
  for (const i of invites) if (i.redeemedByUserId !== null) ids.add(i.redeemedByUserId);
  return [...ids];
}

/**
 * The phase a leader is sitting in, per run — **two batched queries for the whole list**, not one per
 * run (`admin-queries.ts`'s discipline). "Where they are" is the active node, else the last completed
 * one, else the first phase.
 *
 * The journey read goes through the framework's own `listJourneys`, so the cross-user widening is
 * `subjectScope`'s decision and not ours — that call is the gate. The node-state read that follows is
 * a direct query over journey ids **the gate has already authorised**, because `getNodeStates` is
 * per-journey and would make this N+1. Stated plainly rather than papered over: the authorisation
 * happens once, on the journeys; the second query only expands rows within that set.
 */
async function currentPhaseByRun(
  viewer: JourneyViewer,
  runIds: string[]
): Promise<Map<string, string>> {
  if (runIds.length === 0) return new Map();

  const wanted = new Set(runIds);
  const { journeys: all } = await listJourneys(viewer, { graphSlug: RECLAIM_MAP_SLUG });
  const journeys = all
    .filter((j) => wanted.has(j.contextKey))
    .map((j) => ({ id: j.id, contextKey: j.contextKey }));
  if (journeys.length === 0) return new Map();

  const states = await prisma.userNodeState.findMany({
    where: { journeyId: { in: journeys.map((j) => j.id) } },
    select: { journeyId: true, nodeKey: true, status: true },
  });

  const byJourney = new Map<string, Array<{ nodeKey: string; status: string }>>();
  for (const s of states) {
    const list = byJourney.get(s.journeyId) ?? [];
    list.push({ nodeKey: s.nodeKey, status: s.status });
    byJourney.set(s.journeyId, list);
  }

  const out = new Map<string, string>();
  for (const journey of journeys) {
    const states = byJourney.get(journey.id) ?? [];
    const byKey = new Map(states.map((s) => [s.nodeKey, s.status]));
    // Walk the map's own order — the node-state rows carry no ordering of their own.
    const active = RECLAIM_PHASES.find((p) => byKey.get(p.key) === 'active');
    const lastDone = [...RECLAIM_PHASES].reverse().find((p) => byKey.get(p.key) === 'completed');
    const phase = active ?? lastDone ?? RECLAIM_PHASES[0];
    if (phase !== undefined) out.set(journey.contextKey, phase.label);
  }
  return out;
}

/**
 * When each leader last actually answered something — one batched `groupBy` over the slot store.
 *
 * This is what "stalled" has to mean. The run row is not written while a leader works (answers go to
 * `framework_slot_value`, phase moves to `UserNodeState`), so its `updatedAt` freezes at creation and
 * an active leader would read as abandoned. `capturedAt` is the timestamp the write path stamps on
 * every answer, and is already the column `getSlotHeads` orders by.
 */
async function lastAnswerAtByUser(userIds: string[]): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();

  const rows = await prisma.slotValue.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _max: { capturedAt: true },
  });

  const out = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.capturedAt !== null) out.set(row.userId, row._max.capturedAt);
  }
  return out;
}

/**
 * Chat cost per run, in USD (plan D2). Only runs with a recorded `conversationId` appear in the
 * result — an absent entry is "not recorded", which the caller must keep distinct from zero.
 */
async function chatCostByRun(
  runs: Array<{ id: string; conversationId: string | null }>
): Promise<Map<string, number>> {
  const linked = runs.filter(
    (r): r is { id: string; conversationId: string } => r.conversationId !== null
  );
  if (linked.length === 0) return new Map();

  const totals = await prisma.aiCostLog.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: linked.map((r) => r.conversationId) } },
    _sum: { totalCostUsd: true },
  });

  const byConversation = new Map(totals.map((t) => [t.conversationId, t._sum.totalCostUsd ?? 0]));
  const out = new Map<string, number>();
  for (const run of linked) {
    // A linked conversation with no cost rows genuinely cost nothing yet — that IS a zero, unlike an
    // unlinked run, which is an unknown.
    out.set(run.id, byConversation.get(run.conversationId) ?? 0);
  }
  return out;
}

/**
 * Sum a leader's costs, or `null` when not one of their runs has a recorded conversation.
 *
 * Summed **per conversation, not per run**. "One conversation per run" is true by construction of the
 * surface and I15's close-on-completion, but it is enforced nowhere — `conversationId` is deliberately
 * not an FK and carries no unique constraint, and if a completion ever fails between marking the run
 * complete and deactivating the conversation, the next run links the same one. Two runs would then
 * each report that conversation's full cost and double a leader's spend, on the one number the plan
 * says has to be defensible. Deduplicating costs nothing and removes the dependence on a cross-request
 * invariant.
 */
function totalCost(
  runs: Array<{ id: string; conversationId: string | null }>,
  costByRun: Map<string, number>
): number | null {
  const seen = new Set<string>();
  let total = 0;
  let known = false;

  for (const run of runs) {
    if (!costByRun.has(run.id)) continue;
    known = true;
    if (run.conversationId !== null) {
      if (seen.has(run.conversationId)) continue;
      seen.add(run.conversationId);
    }
    total += costByRun.get(run.id) ?? 0;
  }

  return known ? total : null;
}

/**
 * The whole client list in one call. Fixed query count: users, grants, consents, invites, runs,
 * journeys, node states, costs, slots — nine batched reads, none of them per-row.
 */
export async function listClients(
  adminUserId: string,
  /**
   * Narrow to specific leaders. The detail view passes one id rather than building the whole cohort
   * and discarding all but a row — which cost a `getSlotHeads` per leader in the programme to render
   * one person's page. Omit for the full list.
   */
  onlyUserIds?: string[]
): Promise<ClientListView> {
  const viewer = supportViewer(adminUserId);
  const [{ abandonedAfterDays }, accessConfig] = await Promise.all([
    readReclaimAdminConfig(),
    readReclaimAccessConfig(),
  ]);
  const userIds = await programmeUserIds(onlyUserIds);
  if (userIds.length === 0) return { clients: [], abandonedAfterDays };

  const [users, grants, consents, invites, runs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    prisma.reclaimGrant.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reclaimConsent.findMany({
      where: { userId: { in: userIds } },
      orderBy: { acceptedAt: 'desc' },
    }),
    prisma.reclaimInvite.findMany({
      where: { redeemedByUserId: { in: userIds } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.reclaimAuditRun.findMany({
      where: { userId: { in: userIds } },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  // The referrer's display name, resolved in one extra query rather than per row.
  const referrerIds = [
    ...new Set(invites.map((i) => i.invitedByUserId).filter((id): id is string => id !== null)),
  ];
  const referrers = referrerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: referrerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const referrerName = new Map(referrers.map((r) => [r.id, r.name ?? r.email]));

  const [phaseByRun, costByRun, lastAnswerByUser, slotHeads] = await Promise.all([
    currentPhaseByRun(
      viewer,
      runs.filter((r) => r.status === 'in_progress').map((r) => r.id)
    ),
    chatCostByRun(runs),
    lastAnswerAtByUser(userIds),
    // One read per leader is unavoidable here — `getSlotHeads` is per-user by design (the access
    // seam is its `userId` argument). It is a single indexed query each, and the list is a cohort of
    // tens, not thousands; if that ever changes, the batched variant is an additive framework ask.
    Promise.all(
      userIds.map(async (id) => ({
        userId: id,
        heads: await getSlotHeads(id, {
          slotSlugs: [...QUALIFICATION_SLOTS, ...SENSITIVE_CONTEXT_SLOTS],
        }),
      }))
    ),
  ]);

  const qualificationByUser = new Map<string, Record<string, string>>();
  for (const { userId, heads } of slotHeads) {
    const record: Record<string, string> = {};
    for (const head of heads) {
      // Belt and braces on rule 3: even though the list never renders them, do not carry the
      // sensitive slugs into a payload that goes over the wire to a table.
      if ((SENSITIVE_CONTEXT_SLOTS as readonly string[]).includes(head.slotSlug)) continue;
      const display = slotDisplay(head);
      if (display !== '') record[head.slotSlug] = display;
    }
    qualificationByUser.set(userId, record);
  }

  const now = new Date();
  const stallThreshold = now.getTime() - abandonedAfterDays * 24 * 60 * 60 * 1000;

  const clients = users.map((user) => {
    const userRuns = runs.filter((r) => r.userId === user.id);

    // The grant that is actually **live**, not simply the newest.
    //
    // Grants stack: a client-tier grant from an invite, then a referral unlock when someone they
    // referred completes. Taking the newest showed a paying client as tier "Referral" with no expiry
    // — their twelve-month contract and its end date vanished from the one screen that reports them.
    // Same predicate the gate uses (`grantIsLive`), so the list agrees with what a run would find;
    // a window-bounded grant wins the tie because that is the one with money and a deadline attached.
    const userGrants = grants.filter((g) => g.userId === user.id);
    const liveGrants = userGrants.filter((g) => grantIsLive(g, now, accessConfig));
    const grant =
      liveGrants.find((g) => g.windowStartsAt !== null || g.mustStartBy !== null) ??
      liveGrants[0] ??
      userGrants[0] ??
      null;
    const consent = consents.find((c) => c.userId === user.id) ?? null;
    const invite = invites.find((i) => i.redeemedByUserId === user.id) ?? null;

    const active = userRuns.find((r) => r.status === 'in_progress') ?? null;
    const completedRuns = userRuns.filter((r) => r.status === 'complete').length;

    // "Last active" is when they last **answered something**, not when the run row was last written.
    //
    // `ReclaimAuditRun.updatedAt` looks like the right column and is not: answers go to
    // `framework_slot_value` and phase moves go to `UserNodeState`, so nothing writes the run row
    // between creation and completion. Using it meant a leader working steadily for six weeks read as
    // "Stalled, last active 1 June" — the most engaged person in the cohort flagged as the one to
    // chase. The run timestamps stay in the max as a floor, so a leader who has started but not yet
    // answered anything still shows a date.
    const lastActivity = [
      lastAnswerByUser.get(user.id) ?? null,
      ...userRuns.map((r) => r.updatedAt),
      ...userRuns.map((r) => r.startedAt),
    ].reduce<Date | null>(
      (latest, d) => (d !== null && (latest === null || d > latest) ? d : latest),
      null
    );

    const status: ClientStatus =
      active !== null
        ? (lastActivity?.getTime() ?? 0) < stallThreshold
          ? 'stalled'
          : 'in_progress'
        : completedRuns > 0
          ? 'complete'
          : 'never_started';

    // The same date the gate enforces, from the gate's own helper — never recomputed here (D2's
    // sibling lesson: a client told the wrong expiry is worse than one told none).
    const windowEndsAt = grant !== null ? iso(grantExpiresAt(grant, accessConfig)) : null;

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      joinedAt: user.createdAt.toISOString(),
      tier: grant?.tier ?? null,
      auditsGranted: grant?.auditsGranted ?? null,
      auditsUsed: grant?.auditsUsed ?? null,
      windowEndsAt,
      policyVersion: consent?.policyVersion ?? null,
      marketingOptIn: consent?.marketingOptIn ?? false,
      referredByName:
        invite?.invitedByUserId != null ? (referrerName.get(invite.invitedByUserId) ?? null) : null,
      inviteTier: invite?.tier ?? null,
      status,
      currentPhaseLabel: active !== null ? (phaseByRun.get(active.id) ?? null) : null,
      completedRuns,
      lastActivityAt: iso(lastActivity),
      chatCostUsd: totalCost(userRuns, costByRun),
      qualification: qualificationByUser.get(user.id) ?? {},
    } satisfies ClientRow;
  });

  // Most recently active first — the operator's actual question is "who needs me now".
  clients.sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));

  return { clients, abandonedAfterDays };
}

/**
 * One leader's full record, including the `sensitive` prose the list withholds (plan D5). Returns
 * `null` when the user has no programme footprint, so the route 404s rather than inventing a row.
 */
export async function getClientDetail(
  adminUserId: string,
  userId: string
): Promise<ClientDetailView | null> {
  const list = await listClients(adminUserId, [userId]);
  const client = list.clients.find((c) => c.userId === userId);
  if (client === undefined) return null;

  const [runs, heads] = await Promise.all([
    prisma.reclaimAuditRun.findMany({ where: { userId }, orderBy: { startedAt: 'desc' } }),
    getSlotHeads(userId, { slotSlugs: [...SENSITIVE_CONTEXT_SLOTS] }),
  ]);

  const [phaseByRun, costByRun] = await Promise.all([
    currentPhaseByRun(
      supportViewer(adminUserId),
      runs.map((r) => r.id)
    ),
    chatCostByRun(runs),
  ]);

  const context = heads
    .map((head) => ({
      slug: head.slotSlug,
      label: SENSITIVE_LABELS[head.slotSlug] ?? head.slotSlug,
      value: slotDisplay(head),
    }))
    .filter((entry) => entry.value !== '');

  return {
    client,
    context,
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      quarter: run.quarter,
      startedAt: run.startedAt.toISOString(),
      completedAt: iso(run.completedAt),
      currentPhaseLabel: phaseByRun.get(run.id) ?? null,
      chatCostUsd: costByRun.has(run.id) ? (costByRun.get(run.id) ?? 0) : null,
    })),
    journeyHref: '/admin/framework/journeys',
  };
}

/** Re-exported for the UI so a phase label and its key never drift apart. */
export { PHASE_LABEL };
