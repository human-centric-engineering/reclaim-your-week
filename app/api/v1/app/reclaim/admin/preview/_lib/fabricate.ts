/**
 * Preview-account fabrication (F19) — provision a test participant, and drive one through the audit.
 *
 * ## Why this lives under `app/` and not `lib/app/`
 *
 * It drives `app/api/v1/app/reclaim/runs/service.ts`, and a `lib/app` module reaching up into a route
 * tree is backwards. `_`-prefixed folders are private to the App Router and never routed, which is the
 * same arrangement `runs/[runId]/_lib/` uses.
 *
 * ## The rule this module is built on
 *
 * **Everything goes through the real service layer.** `createRun`, `saveRunAnswers`, `transitionRun` —
 * the same functions the leader's own routes call, so a fabricated audit is not a
 * second definition of what an audit is. That matters more here than anywhere else in the app: the
 * entire value of a preview account is that what an operator sees is what a leader would see, and a
 * fabricator built from raw writes would drift from the engine silently, producing states no leader
 * can reach and hiding exactly the regressions it was built to catch.
 *
 * Two consequences follow, and both are deliberate:
 *   - `createRun` runs `assertEntitled`, so I14's one door is exercised rather than bypassed. A
 *     fabrication for an account with no grant fails the same way a leader would.
 *   - A refused `transitionRun` is **rethrown**, naming the phase. `smoke/reclaim-analyst.ts` swallows
 *     these with `.catch(() => undefined)`; copying that here would let a facilitation-policy change
 *     produce an account labelled "mid-audit" whose journey is still sitting at phase 0, and the
 *     operator would have no way to know.
 *
 * ## Why nothing here finishes an audit
 *
 * `summary` stops **at** the last phase and leaves the run in progress, which is the state the operator
 * actually asked for. The summary, the report download and every sharing choice live in the phase-6
 * panel *before* the leader presses "finish my audit"; completion moves the summary into the history
 * read-back, where sharing no longer exists at all. So a fabricator that called `completeRun` drove
 * straight past the three screens it was built to show, and landed the operator on the entry screen —
 * because `loadCurrentRunState` looks for an in-progress run and a finished one is not it.
 *
 * Finishing is left to the operator, on the account, by the button a leader presses. That is one click
 * more and it is the honest one: it is also the only way to see what completion really does, including
 * the email it sends.
 *
 * ## What is faked
 *
 * Only `analystReading`, which is the sole part of a finished summary a model produces. Pre-writing it
 * makes the write-once `ensureAnalystReading` a no-op when the operator does press finish, so neither
 * the summary nor the completion costs a provider call. The content is derived in
 * `lib/app/programme/preview/fixtures.ts`.
 *
 * **No `AiConversation` is fabricated.** A leader who used the forms and never opened the coach is a
 * real, reachable state; inventing `AiMessage` rows would put words in the coach's mouth that no model
 * said, and an operator reading them through `admin/transcript.ts` would have no way to tell.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { auth } from '@/lib/auth/config';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { RECLAIM_PHASE_KEYS, phaseNumber } from '@/lib/app/programme/runs/phases';
import { grantIsLive } from '@/lib/app/programme/runs/entitlement';
import { CHART_REVEAL_MOMENT } from '@/lib/app/programme/chart/reveal';
import { readReclaimAccessConfig, type ReclaimAccessConfig } from '@/lib/app/programme/config';
import { mintGrant, grantAnotherAudit } from '@/lib/app/programme/access/grants';
import { recordConsent, readConsent } from '@/lib/app/programme/access/consent';
import { isPreviewAccount, registerPreviewAccount } from '@/lib/app/programme/preview/accounts';
import { previewAnalystReading } from '@/lib/app/programme/preview/fixtures';
import {
  createRun,
  saveRunAnswers,
  transitionRun,
  claimCoachOpening,
  type RunAnswerInput,
} from '@/app/api/v1/app/reclaim/runs/service';

/** What state a test account should be left in. */
export type PreviewState = 'fresh' | 'mid-audit' | 'summary';

/**
 * Where `mid-audit` stops by default.
 *
 * Phase 4 because it is where the refer-back lands (I13), which makes it the state most worth looking
 * at: earlier phases show a form, and this one shows the audit reasoning about what it was told.
 */
const DEFAULT_MID_PHASE = 'phase-4-gap';

/**
 * The hours a fabricated audit reports, by bucket token. Chosen to produce a chart worth looking at —
 * a clear overspend on delivery, a clear underspend on deep work, and a couple of areas roughly where
 * the leader wanted them — rather than a flat line that would render correctly and show nothing.
 */
const CURRENT_HOURS: Record<string, number> = {
  deep_work: 4,
  learning_development: 1,
  strategic_planning: 3,
  team_development: 6,
  organisational_oversight: 9,
  relationship_building: 5,
  delivery_operations: 22,
  recovery_white_space: 2,
};

const IDEAL_HOURS: Record<string, number> = {
  deep_work: 12,
  learning_development: 3,
  strategic_planning: 7,
  team_development: 8,
  organisational_oversight: 6,
  relationship_building: 6,
  delivery_operations: 10,
  recovery_white_space: 5,
};

export interface ProvisionInput {
  /** What this account is for, in the operator's words. Shown on the badge wherever it appears. */
  label: string;
  email: string;
  name: string;
  /** The admin doing this. Recorded on the registry row. */
  actorUserId: string;
}

export interface ProvisionResult {
  userId: string;
  email: string;
  /** Generated, shown to the operator **once**, and never stored or logged. */
  password: string;
}

export interface FastForwardResult {
  runId: string;
  reachedPhaseKey: string;
  /** Whether the run is sitting at the last phase, with the summary, report and sharing on screen. */
  atSummary: boolean;
}

/**
 * A password that satisfies `passwordSchema` by construction, from the platform's own randomness.
 *
 * **base64url of the raw bytes, not an index into an alphabet.** Folding a byte onto a 25-letter
 * alphabet with `%` makes the first six letters fractionally likelier, because 256 is not a multiple
 * of 25 — a small bias, but a real one in a credential, and CodeQL flags it as
 * `js/biased-cryptographic-random`. The two fixes are rejection sampling or not doing the arithmetic
 * at all; `mintToken` in `invite-links.ts` already established the second here, so this follows it.
 * Nine bytes is twelve base64url characters with no padding to strip, and 72 bits rather than the 55
 * the modulo version carried.
 */
function generatePassword(): string {
  // `globalThis.crypto` rather than a bare `crypto`, matching `invite-links.ts` — the explicit form
  // is the one that reads unambiguously in a file that also imports from Node's `crypto` elsewhere.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(9));
  const body = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  // Upper, lower, digit and symbol are each guaranteed rather than hoped for: base64url is not
  // obliged to contain any one of them, and a generator that fails the schema one time in fifty is a
  // bug an operator meets at random and cannot reproduce.
  return `Rw${body}7!`;
}

/**
 * Create a test account, entitled but not yet consented.
 *
 * Follows `app/api/auth/accept-invite/route.ts` minus the cookie forwarding — sign up, then force
 * `emailVerified`, which is required rather than cosmetic: with `REQUIRE_EMAIL_VERIFICATION` on, an
 * unverified account cannot sign in and the operator would be handed a password that does not work.
 *
 * **Consent is deliberately not recorded.** The consent gate is the first thing a leader meets after
 * signing in, and a test account that skipped it would be a test account that cannot show you the one
 * screen every single leader sees.
 */
export async function provisionPreviewAccount(input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const password = generatePassword();

  await auth.api.signUpEmail({ body: { name: input.name.trim(), email, password } });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user === null) throw new Error('preview: the account was not created');

  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

  // Standard, never client. A client grant is bounded by a window rather than a count, so a preview
  // account on that tier could run unlimited audits for twelve months.
  await mintGrant({ id: `preview_${user.id}`, userId: user.id, tier: 'standard' });
  await registerPreviewAccount({
    userId: user.id,
    label: input.label,
    createdByUserId: input.actorUserId,
  });

  // No password in the log line, and no password on the row. It exists in the response body once.
  logger.info('Reclaim: preview account provisioned', {
    userId: user.id,
    createdByUserId: input.actorUserId,
  });

  return { userId: user.id, email, password };
}

/** Every answer a finished-looking audit carries, in the order a leader would give them. */
function auditAnswers(): RunAnswerInput[] {
  const answers: RunAnswerInput[] = [
    { slotSlug: 'reclaim_profile_first_name', value: 'Sam' },
    { slotSlug: 'reclaim_profile_role', value: 'Chief Executive' },
    {
      slotSlug: 'reclaim_profile_org_type',
      value: 'A social enterprise of about forty people',
    },
    {
      slotSlug: 'reclaim_setup_priorities',
      value: 'Get the new programme funded and off the ground',
    },
    { slotSlug: 'reclaim_setup_weekly_hours', value: '52', valueJson: 52 },
    { slotSlug: 'reclaim_setup_audit_period', value: 'last quarter' },
  ];

  for (const bucket of RECLAIM_BUCKETS.filter((b) => !b.conditional)) {
    const token = bucketToken(bucket.slug);
    const current = CURRENT_HOURS[token] ?? 0;
    const ideal = IDEAL_HOURS[token] ?? 0;
    answers.push(
      { slotSlug: `reclaim_current_hours__${token}`, value: String(current), valueJson: current },
      { slotSlug: `reclaim_ideal_hours__${token}`, value: String(ideal), valueJson: ideal }
    );
  }

  answers.push(
    { slotSlug: 'reclaim_ideal_total_hours', value: '57', valueJson: 57 },
    {
      slotSlug: 'reclaim_action_chosen',
      value: 'Two protected mornings a week for the funding bid',
    },
    { slotSlug: 'reclaim_action_when', value: 'From next Monday' }
  );

  return answers;
}

/**
 * The reflections a leader leaves behind on the way through.
 *
 * Written even though `transitionRun` does not check for them — the **route** does (I9), not the
 * service. Skipping them would be the easy thing and the wrong one: a run sitting at phase 4 with no
 * phase-1 reflection is a state no leader can reach, and the first time the operator reloads, the phase
 * rail and the run disagree.
 *
 * **Phase 6's is the takeaway, and it is written only for the last phase.** The panel holds the summary
 * back until that question is answered — deliberately, it is the beat the source asks for — so a run
 * fabricated *to* the summary and missing it would open on the question rather than on the thing the
 * operator asked to look at. Phases 1–5 stop short of it because a mid-audit run has not been asked.
 */
function reflectionsUpTo(phaseIndex: number): RunAnswerInput[] {
  const answers: RunAnswerInput[] = [];
  for (let n = 1; n <= Math.min(phaseIndex, 5); n += 1) {
    answers.push({
      slotSlug: `reclaim_reflection_p${n}`,
      value: 'Looking at it written down made the size of it obvious.',
    });
  }
  if (phaseIndex >= 6) {
    answers.push({
      slotSlug: 'reclaim_reflection_p6',
      value: 'That two mornings a week is a decision, not a wish.',
    });
  }
  return answers;
}

/**
 * Whether this account already has an audit it could start.
 *
 * The one thing standing between the fabricator and a faithful test account. `grantAnotherAudit` used
 * to run unconditionally, and a freshly provisioned account already has its one standard audit — so
 * every first fabrication left a spare, and the operator was looking at a leader who had finished an
 * audit and *still* had one in hand. Pressing "Begin" then worked, which is the opposite of what the
 * entitlement gate would have told a real leader.
 */
async function hasAuditInHand(userId: string, config: ReclaimAccessConfig): Promise<boolean> {
  const grants = await prisma.reclaimGrant.findMany({ where: { userId } });
  const now = new Date();
  return grants.some((grant) => grantIsLive(grant, now, config));
}

/**
 * Drive a test account through the audit to `state`, using the real engine at every step.
 *
 * Refuses anything that is not a registered preview account. That check is the interlock which makes
 * this module structurally incapable of writing into a real leader's audit: a mistyped id fails here
 * rather than rewriting somebody's week.
 */
export async function fastForwardPreviewAccount(
  userId: string,
  state: Exclude<PreviewState, 'fresh'>,
  opts?: { quarter?: string; toPhase?: string }
): Promise<FastForwardResult> {
  if (!(await isPreviewAccount(userId))) {
    throw new Error(
      'preview: refusing to fabricate an audit for an account that is not a test account'
    );
  }

  const config = await readReclaimAccessConfig();

  // The consent gate runs before entitlement inside `assertEntitled`, so this has to come first.
  const consent = await readConsent(userId, config.policyVersion);
  if (!consent.accepted) await recordConsent(userId, config.policyVersion, false);

  // An audit the operator finished on a previous pass consumed the account's single standard audit, so
  // a further fabrication needs another one. **Only then** — see `hasAuditInHand`. Deterministic per
  // day, so a retry within the day is free.
  if (!(await hasAuditInHand(userId, config))) {
    const today = new Date().toISOString().slice(0, 10);
    await grantAnotherAudit(userId, 'standard', today, config);
  }

  const run = await createRun(userId, opts?.quarter ?? '2026 Q3');

  const targetKey =
    state === 'summary'
      ? RECLAIM_PHASE_KEYS[RECLAIM_PHASE_KEYS.length - 1]
      : (opts?.toPhase ?? DEFAULT_MID_PHASE);
  const targetIndex = phaseNumber(targetKey ?? '');
  if (targetIndex === null) throw new Error(`preview: unknown phase ${String(targetKey)}`);

  await saveRunAnswers(userId, run.id, [...auditAnswers(), ...reflectionsUpTo(targetIndex)]);

  // The chart reveal is a moment the coach claims once per run. Without it the phase-1 surface would
  // offer to reveal a chart the leader has already been shown, which no real run does.
  await claimCoachOpening(userId, run.id, CHART_REVEAL_MOMENT);

  let reached = RECLAIM_PHASE_KEYS[0] ?? 'phase-0-setup';
  for (const key of RECLAIM_PHASE_KEYS.slice(0, targetIndex)) {
    try {
      const { enteredPhaseKey } = await transitionRun(userId, run.id, key);
      reached = enteredPhaseKey;
    } catch (error) {
      // Named, and rethrown. A swallowed refusal here produces an account the API called "mid-audit"
      // whose journey never left phase 0 — a lie the operator cannot see and would report as a bug in
      // whatever screen they looked at next.
      throw new Error(
        `preview: the engine refused to leave ${key} (${error instanceof Error ? error.message : 'unknown'})`
      );
    }
  }

  if (state === 'mid-audit') {
    logger.info('Reclaim: preview run fabricated', { userId, runId: run.id, reached });
    return { runId: run.id, reachedPhaseKey: reached, atSummary: false };
  }

  // Written before the operator ever opens the phase, which is the whole trick: the summary reads this
  // column, and `ensureAnalystReading` returns early when it is already set — so neither looking at the
  // summary nor finishing the audit afterwards spends anything on a provider.
  const reading = previewAnalystReading(
    Object.fromEntries(
      Object.keys(CURRENT_HOURS).map((token) => [
        token,
        { current: CURRENT_HOURS[token] ?? 0, ideal: IDEAL_HOURS[token] ?? 0 },
      ])
    )
  );
  if (reading !== null) {
    await prisma.reclaimAuditRun.update({
      where: { id: run.id },
      data: { analystReading: reading as unknown as Prisma.InputJsonValue },
    });
  }

  logger.info('Reclaim: preview run fabricated to the summary', { userId, runId: run.id });
  return { runId: run.id, reachedPhaseKey: reached, atSummary: true };
}
