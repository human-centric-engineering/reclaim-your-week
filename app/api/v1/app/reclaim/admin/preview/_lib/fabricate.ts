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
 *   - A refused `transitionRun` is **rethrown**, naming the phase. `smoke/reclaim-report-agent.ts` swallows
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
 * ## Any phase, not three states
 *
 * `toPhase` names where the walk stops, and every phase of the map is a legal answer. The three-state
 * shape this replaced (`fresh` / `mid-audit` / `completed`) could only ever show an operator two of the
 * seven screens, and `mid-audit` always meant phase 4 because nothing sent the phase it already
 * accepted. `summary` survives as the name for "the last phase", because stopping there is different
 * in kind: it is the only target that writes the report agent's reading.
 *
 * ## What is faked
 *
 * `analystReading`, which is the sole part of a finished summary a model produces. Pre-writing it
 * makes the write-once `ensureReportReading` a no-op when the operator does press finish, so neither
 * the summary nor the completion costs a provider call. The content is derived in
 * `lib/app/programme/preview/fixtures.ts`.
 *
 * The answers themselves come from `preview/answers.ts`, **one phase at a time as the walk reaches
 * it**, so a run stopped at phase 2 holds what a leader at phase 2 would hold and nothing from further
 * on. Writing the lot up front, which is what this used to do, made every stopping point identical
 * underneath and put a finished action plan inside a run that had not been asked for one.
 *
 * ## The transcript, and why it is now written
 *
 * **An `AiConversation` is fabricated**, from `preview/conversation.ts`. This used to be refused, on
 * the grounds that invented `AiMessage` rows put words in the coach's mouth that no model said and an
 * operator reading them back had no way to tell. The objection was right and the conclusion was not:
 * the audit is the conversation now, so a test account with an empty chat cannot show the operator the
 * screen they most need to look at.
 *
 * The honesty problem is answered directly instead. Every row this writes carries
 * `metadata.fabricated`, and `readSharedTranscript` reports the flag, so the admin transcript view
 * states plainly that the exchange came from here.
 *
 * Turns are written **as each phase is reached**, before the transition out of it. That is not tidiness:
 * a phase mark is the id of the last message that existed when the phase was entered, so a transcript
 * written in one go at the end would file the whole conversation under the final phase and every
 * phase-scoped read-back would be wrong.
 *
 * A test account whose module surface has no bound public agent gets no transcript rather than a
 * failure. That is a real deployment state (nothing seeded yet), and refusing the whole fabrication
 * over it would take away the phase walk as well.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { auth } from '@/lib/auth/config';
import {
  MODULE_SURFACE_CONTEXT_TYPE,
  resolveModuleSurface,
} from '@/lib/framework/guidance/surface';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';
import { RECLAIM_PHASE_KEYS, phaseNumber } from '@/lib/app/programme/runs/phases';
import { grantIsLive } from '@/lib/app/programme/runs/entitlement';
import { arrivalMomentFor } from '@/lib/app/programme/coach/opening';
import { CHART_REVEAL_MOMENT, CHART_REVEAL_PHASE } from '@/lib/app/programme/chart/reveal';
import { readReclaimAccessConfig, type ReclaimAccessConfig } from '@/lib/app/programme/config';
import { mintGrant, grantAnotherAudit } from '@/lib/app/programme/access/grants';
import { recordConsent, readConsent } from '@/lib/app/programme/access/consent';
import { isPreviewAccount, registerPreviewAccount } from '@/lib/app/programme/preview/accounts';
import { previewReportReading } from '@/lib/app/programme/preview/fixtures';
import {
  CURRENT_HOURS,
  IDEAL_HOURS,
  previewAnswersForPhase,
} from '@/lib/app/programme/preview/answers';
import {
  FABRICATED_METADATA,
  previewTurnsForPhase,
} from '@/lib/app/programme/preview/conversation';
import {
  createRun,
  saveRunAnswers,
  transitionRun,
  claimCoachOpening,
  linkRunConversation,
  recordPhaseMark,
  closeSurfaceConversation,
} from '@/app/api/v1/app/reclaim/runs/service';

/**
 * What state a test account should be left in.
 *
 * `mid-audit` carries its stopping point in `toPhase`; `summary` is the last phase and is named
 * separately because it is the only one that writes the report agent's reading.
 */
export type PreviewState = 'fresh' | 'mid-audit' | 'summary';

/**
 * Where `mid-audit` stops by default.
 *
 * Phase 4 because it is where the refer-back lands (I13), which makes it the state most worth looking
 * at: earlier phases show a form, and this one shows the audit reasoning about what it was told.
 */
const DEFAULT_MID_PHASE = 'phase-4-gap';

/**
 * How far apart the fabricated transcript's turns are stamped.
 *
 * Explicit `createdAt` values rather than the column default, because both readers order by it and
 * several rows written inside one millisecond would come back in an arbitrary order — a conversation
 * whose replies precede their questions on every other reload. Ninety seconds also makes the whole
 * exchange land in the past rather than in one instant, which is what a transcript looks like.
 */
const TURN_GAP_MS = 90_000;

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
  /**
   * Whether a transcript was written, and when it was not, why.
   *
   * Reported rather than logged because the operator is the one who can act on it: `no-agent` means
   * this install has no public agent bound to the module surface, so the account they are about to
   * sign in as will have a silent coach. Told that, they go and bind one; left to discover it on the
   * screen, they report the chat as broken.
   */
  transcript: 'written' | 'no-agent';
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

/**
 * The one sentence both routes report back, so "what just happened" is worded once.
 *
 * It used to be a ternary in each route, and they had already drifted: one said "driven to mid-audit"
 * for every phase between 0 and 5, which was the only thing an operator could be told when the only
 * stopping point was phase 4. Naming the phase is the whole point of being able to choose it.
 */
export function describeFabrication(result: FastForwardResult): string {
  const phase = RECLAIM_PHASES.find((p) => p.key === result.reachedPhaseKey);
  const where = result.atSummary
    ? 'The audit is filled in and waiting at the summary, which is where the report and the sharing choices are. Signing in as the account opens there, and finishing it is yours to press.'
    : `The audit is filled in as far as ${phase?.label ?? result.reachedPhaseKey}, and is sitting there. Everything a leader would have written by that point is on it, and nothing from after it.`;

  // Named, because the operator can fix it and cannot guess it. A silent coach on a test account
  // reads as a broken chat, not as an install with no agent bound to the module surface.
  const coach =
    result.transcript === 'no-agent'
      ? ' There is no conversation on it: this install has no public agent bound to the module surface, so bind one and fill the account in again if you want to see the coach.'
      : ' The conversation is filled in too, and is marked as made up wherever it is read back.';

  return `${where}${coach}`;
}

/**
 * Open a conversation for this run's fabricated transcript, or `null` when there is nothing to open.
 *
 * `resolveModuleSurface` is what says whether the module has a **public** primary agent bound. Going
 * through it rather than reading `AiAgent` directly is the same rule the rest of this module follows:
 * the leader's own coach surface decides which agent a conversation belongs to that way, and a
 * fabricated conversation attributed to some other agent would be a conversation the leader's screen
 * could not open.
 *
 * Any conversation already active on the surface is closed first. A leader has at most one active
 * module-surface conversation by construction (I15), and a second fabrication on the same account
 * would otherwise leave two.
 */
async function openFabricatedConversation(userId: string): Promise<string | null> {
  const surface = await resolveModuleSurface(userId, RECLAIM_MODULE_SLUG);
  if (surface === null) return null;

  await closeSurfaceConversation(userId);

  const conversation = await prisma.aiConversation.create({
    data: {
      userId,
      agentId: surface.agentId,
      contextType: MODULE_SURFACE_CONTEXT_TYPE,
      contextId: RECLAIM_MODULE_SLUG,
      isActive: true,
      // The one thing that keeps this honest. Read back by `readSharedTranscript`, which is how the
      // admin transcript view knows to say the exchange was written here and not by a model.
      metadata: FABRICATED_METADATA,
    },
    select: { id: true },
  });
  return conversation.id;
}

/**
 * Write one phase's turns, returning the timestamp the next phase should start from.
 *
 * Sequential rather than `createMany` because each row needs its own `createdAt`, and small volumes
 * (three or four turns a phase) make the round trips irrelevant. `role` is translated here and only
 * here: the fixture speaks of a leader and a coach, the table stores `user` and `assistant`.
 */
async function writeTurns(conversationId: string, phaseIndex: number, from: Date): Promise<Date> {
  let at = from;
  for (const turn of previewTurnsForPhase(phaseIndex)) {
    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: turn.role === 'leader' ? 'user' : 'assistant',
        content: turn.text,
        createdAt: at,
        metadata: FABRICATED_METADATA,
      },
    });
    at = new Date(at.getTime() + TURN_GAP_MS);
  }
  return at;
}

/**
 * Where the fabricated transcript starts, so that its last turn lands about now.
 *
 * A conversation stamped entirely in the future, or entirely at one instant, is the sort of thing an
 * operator notices and cannot explain. Counting the turns first and working backwards costs nothing
 * and makes the timestamps read like a session somebody actually had.
 */
function transcriptStart(targetIndex: number): Date {
  let turns = 0;
  for (let index = 0; index <= targetIndex; index += 1) turns += previewTurnsForPhase(index).length;
  return new Date(Date.now() - turns * TURN_GAP_MS);
}

/**
 * Claim the coach openings a leader who reached this phase would already have had.
 *
 * Without this the phase would open by offering a beat the fabricated transcript has just shown: the
 * arrival turn replayed under a conversation that already contains it, and on phase 1 a chart reveal
 * for a chart the leader has been looking at since the transcript began (I12's gate).
 *
 * Best-effort by construction: `claimCoachOpening` returns `false` when the moment was already fired
 * and there is nothing here that needs to know which it was.
 */
async function claimOpeningsFor(userId: string, runId: string, phaseKey: string): Promise<void> {
  const arrival = arrivalMomentFor(phaseKey);
  if (arrival !== null) await claimCoachOpening(userId, runId, arrival);
  if (phaseKey === CHART_REVEAL_PHASE) await claimCoachOpening(userId, runId, CHART_REVEAL_MOMENT);
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

  const conversationId = await openFabricatedConversation(userId);
  if (conversationId !== null) await linkRunConversation(run.id, conversationId);

  let clock = transcriptStart(targetIndex);
  let reached = RECLAIM_PHASE_KEYS[0] ?? 'phase-0-setup';

  for (let index = 0; index <= targetIndex; index += 1) {
    const key = RECLAIM_PHASE_KEYS[index] ?? '';

    // The phase's own answers, as it is reached. A run stopped here holds what a leader stopped here
    // would hold, and nothing belonging to a phase they have not been asked about.
    await saveRunAnswers(userId, run.id, previewAnswersForPhase(index));
    await claimOpeningsFor(userId, run.id, key);
    // Before the transition, never after: the mark written on entering the next phase is the id of the
    // last message that exists at that moment, so turns written afterwards would fall on the wrong
    // side of every phase boundary.
    if (conversationId !== null) clock = await writeTurns(conversationId, index, clock);

    if (index === targetIndex) break;

    try {
      const { enteredPhaseKey } = await transitionRun(userId, run.id, key);
      reached = enteredPhaseKey;
      // The **route** records this on a leader's own transition, not the service, so a fabricator that
      // drives the service directly has to do it too. Without it every phase-scoped read of the
      // transcript falls back to the whole conversation, which is the bug `backfillPhaseMark` exists
      // to repair one phase at a time.
      await recordPhaseMark(userId, run.id, enteredPhaseKey);
    } catch (error) {
      // Named, and rethrown. A swallowed refusal here produces an account the API called "mid-audit"
      // whose journey never left phase 0 — a lie the operator cannot see and would report as a bug in
      // whatever screen they looked at next.
      throw new Error(
        `preview: the engine refused to leave ${key} (${error instanceof Error ? error.message : 'unknown'})`
      );
    }
  }

  const transcript = conversationId === null ? ('no-agent' as const) : ('written' as const);

  if (state === 'mid-audit' && targetIndex !== RECLAIM_PHASE_KEYS.length - 1) {
    logger.info('Reclaim: preview run fabricated', { userId, runId: run.id, reached, transcript });
    return { runId: run.id, reachedPhaseKey: reached, atSummary: false, transcript };
  }

  // Written before the operator ever opens the phase, which is the whole trick: the summary reads this
  // column, and `ensureReportReading` returns early when it is already set — so neither looking at the
  // summary nor finishing the audit afterwards spends anything on a provider.
  const reading = previewReportReading(
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

  logger.info('Reclaim: preview run fabricated to the summary', {
    userId,
    runId: run.id,
    transcript,
  });
  return { runId: run.id, reachedPhaseKey: reached, atSummary: true, transcript };
}
