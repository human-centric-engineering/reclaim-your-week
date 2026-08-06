/**
 * Fabricating a preview audit (F19). The run service, auth and Prisma are mocked.
 *
 * Four things here are worth a test, and they are all about what the fabricator must **refuse** to do
 * or must not skip. The happy path is thin by design — it delegates to the real service layer, which
 * has its own tests, and that delegation is the point rather than an implementation detail.
 *
 *   1. **The interlock.** A non-preview account is refused before any write. This is what makes the
 *      module structurally incapable of rewriting a real leader's audit from a mistyped id.
 *   2. **No swallowed transition.** `smoke/reclaim-analyst.ts` catches and discards a refused
 *      transition; copying that would produce an account the API calls "mid-audit" whose journey never
 *      left phase 0.
 *   3. **The analyst is never called.** The reading is written by the fabricator, so the write-once
 *      `ensureAnalystReading` finds it already there and neither the summary nor a later completion
 *      costs anything.
 *   4. **Reflections are written**, even though the service does not check for them — the route does.
 *   5. **Nothing here finishes an audit.** `summary` stops at the last phase and leaves the run in
 *      progress, because the summary, the report and the sharing choices all live there and are gone
 *      the moment it is completed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isPreviewAccount: vi.fn(),
  hashPassword: vi.fn(),
  updatePassword: vi.fn(),
  registerPreviewAccount: vi.fn(),
  createRun: vi.fn(),
  saveRunAnswers: vi.fn(),
  transitionRun: vi.fn(),
  claimCoachOpening: vi.fn(),
  linkRunConversation: vi.fn(),
  recordPhaseMark: vi.fn(),
  closeSurfaceConversation: vi.fn(),
  recordConsent: vi.fn(),
  readConsent: vi.fn(),
  grantAnotherAudit: vi.fn(),
  mintGrant: vi.fn(),
  runUpdate: vi.fn(),
  grantFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  signUpEmail: vi.fn(),
  resolveModuleSurface: vi.fn(),
  conversationCreate: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { update: mocks.runUpdate },
    reclaimGrant: { findMany: mocks.grantFindMany },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    aiConversation: { create: mocks.conversationCreate },
    aiMessage: { create: mocks.messageCreate },
  },
}));
vi.mock('@/lib/framework/guidance/surface', () => ({
  MODULE_SURFACE_CONTEXT_TYPE: 'module',
  resolveModuleSurface: mocks.resolveModuleSurface,
}));
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: { signUpEmail: mocks.signUpEmail },
    // `$context` is better-auth's handle on the running instance. Mocked as the two things the
    // password reset actually uses, so the test asserts what is written rather than how it is hashed.
    $context: Promise.resolve({
      password: { hash: mocks.hashPassword },
      internalAdapter: { updatePassword: mocks.updatePassword },
    }),
  },
}));
vi.mock('@/lib/app/programme/preview/accounts', () => ({
  isPreviewAccount: mocks.isPreviewAccount,
  registerPreviewAccount: mocks.registerPreviewAccount,
}));
vi.mock('@/lib/app/programme/access/grants', () => ({
  mintGrant: mocks.mintGrant,
  grantAnotherAudit: mocks.grantAnotherAudit,
}));
vi.mock('@/lib/app/programme/access/consent', () => ({
  recordConsent: mocks.recordConsent,
  readConsent: mocks.readConsent,
}));
vi.mock('@/lib/app/programme/config', () => ({
  readReclaimAccessConfig: () =>
    Promise.resolve({
      policyVersion: 'draft-1',
      clientMustStartWithinDays: 30,
      clientWindowMonths: 12,
    }),
}));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  createRun: mocks.createRun,
  saveRunAnswers: mocks.saveRunAnswers,
  transitionRun: mocks.transitionRun,
  claimCoachOpening: mocks.claimCoachOpening,
  linkRunConversation: mocks.linkRunConversation,
  recordPhaseMark: mocks.recordPhaseMark,
  closeSurfaceConversation: mocks.closeSurfaceConversation,
}));

import {
  provisionPreviewAccount,
  fastForwardPreviewAccount,
  resetPreviewAccountPassword,
  describeFabrication,
} from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';
import { passwordSchema } from '@/lib/validations/auth';
import { COACH_SYNTHETIC_MESSAGES } from '@/lib/app/programme/coach/opening';

const USER = 'preview-user-1';

/** The slugs a `saveRunAnswers` call wrote, flattened across every call. */
const writtenSlugs = (): string[] =>
  mocks.saveRunAnswers.mock.calls.flatMap((call) =>
    ((call[2] ?? []) as { slotSlug: string }[]).map((a) => a.slotSlug)
  );

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.isPreviewAccount.mockResolvedValue(true);
  mocks.hashPassword.mockImplementation((plain: string) => Promise.resolve(`hashed:${plain}`));
  mocks.updatePassword.mockResolvedValue(undefined);
  mocks.readConsent.mockResolvedValue({ accepted: false, policyVersion: 'draft-1' });
  mocks.createRun.mockResolvedValue({ id: 'run-1' });
  // The account as it is the moment after provisioning: one standard audit, unused. Nothing to top up.
  mocks.grantFindMany.mockResolvedValue([
    {
      tier: 'standard',
      auditsGranted: 1,
      auditsUsed: 0,
      windowStartsAt: null,
      mustStartBy: null,
    },
  ]);
  mocks.transitionRun.mockImplementation((_u: string, _r: string, key: string) =>
    Promise.resolve({ enteredPhaseKey: `after:${key}` })
  );
  mocks.userFindUnique.mockResolvedValue({ id: USER });
  mocks.signUpEmail.mockResolvedValue({});
  mocks.resolveModuleSurface.mockResolvedValue({
    agentSlug: 'reclaim-coach',
    agentId: 'agent-1',
    scope: 'scope',
    rateLimitRpm: 30,
  });
  mocks.conversationCreate.mockResolvedValue({ id: 'conv-1' });
  mocks.messageCreate.mockResolvedValue({ id: 'msg-1' });
});

/** Every `aiMessage.create` payload, in the order they were written. */
const writtenMessages = (): { role: string; content: string; createdAt: Date }[] =>
  mocks.messageCreate.mock.calls.map(
    (call) => (call[0] as { data: { role: string; content: string; createdAt: Date } }).data
  );

describe('provisionPreviewAccount', () => {
  it('generates a password the platform’s own schema accepts', async () => {
    // A generator that failed the schema one time in fifty is a bug an operator meets at random and
    // cannot reproduce, holding a password that simply does not work.
    for (let i = 0; i < 25; i += 1) {
      const result = await provisionPreviewAccount({
        label: 'walkthrough',
        email: `t${i}@example.org`,
        name: 'Sam',
        actorUserId: 'admin-1',
      });
      expect(passwordSchema.safeParse(result.password).success).toBe(true);
    }
  });

  it('draws the password without folding bytes onto an alphabet', async () => {
    // `js/biased-cryptographic-random`: mapping a byte onto a 25-letter alphabet with `%` makes the
    // first six letters likelier, because 256 is not a multiple of 25. base64url has no such step —
    // every character is a straight 6-bit slice of the bytes. Asserted through the alphabet rather
    // than by reading the source: a body outside base64url means somebody reintroduced a mapping.
    const passwords: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      const result = await provisionPreviewAccount({
        label: 'walkthrough',
        email: `b${i}@example.org`,
        name: 'Sam',
        actorUserId: 'admin-1',
      });
      passwords.push(result.password);
    }

    for (const password of passwords) {
      // `Rw` + 12 base64url characters + `7!`. Nine bytes divide into three-byte groups exactly, so
      // there is no `=` padding to strip — a `=` here would mean the byte count drifted.
      expect(password).toMatch(/^Rw[A-Za-z0-9_-]{12}7!$/);
    }
    // Not a distribution test, which would be flaky. Just that the body varies at all: a generator
    // returning a constant would satisfy every assertion above.
    expect(new Set(passwords).size).toBeGreaterThan(45);
  });

  it('forces emailVerified, or the operator gets a password that cannot sign in', async () => {
    await provisionPreviewAccount({
      label: 'walkthrough',
      email: 'sam@example.org',
      name: 'Sam',
      actorUserId: 'admin-1',
    });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: USER },
      data: { emailVerified: true },
    });
  });

  it('mints a standard grant, never a client one', async () => {
    // A client grant is bounded by a window rather than a count, so a preview account on that tier
    // could run unlimited audits for a year.
    await provisionPreviewAccount({
      label: 'walkthrough',
      email: 'sam@example.org',
      name: 'Sam',
      actorUserId: 'admin-1',
    });

    expect(mocks.mintGrant).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, tier: 'standard' })
    );
  });

  it('does not record consent — the gate is part of what a tester needs to see', async () => {
    await provisionPreviewAccount({
      label: 'walkthrough',
      email: 'sam@example.org',
      name: 'Sam',
      actorUserId: 'admin-1',
    });

    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });

  it('registers the account, or it would count as a client everywhere', async () => {
    await provisionPreviewAccount({
      label: 'Rashmir’s walkthrough',
      email: 'sam@example.org',
      name: 'Sam',
      actorUserId: 'admin-1',
    });

    expect(mocks.registerPreviewAccount).toHaveBeenCalledWith({
      userId: USER,
      label: 'Rashmir’s walkthrough',
      createdByUserId: 'admin-1',
    });
  });

  it('refuses when the account cannot be found straight after sign-up', async () => {
    // Would mean `auth.api.signUpEmail` reported success but the user is not readable yet — a
    // consistency question worth failing loudly on rather than minting a grant for nobody.
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(
      provisionPreviewAccount({
        label: 'x',
        email: 'sam@example.org',
        name: 'Sam',
        actorUserId: 'a',
      })
    ).rejects.toThrow('preview: the account was not created');

    expect(mocks.mintGrant).not.toHaveBeenCalled();
    expect(mocks.registerPreviewAccount).not.toHaveBeenCalled();
  });
});

describe('resetPreviewAccountPassword', () => {
  it('writes a hash, never the password itself', async () => {
    // The reason this endpoint exists rather than a stored password: nothing keeps the plaintext,
    // here or on any row. What reaches the account row is whatever this install's hasher produced.
    const password = await resetPreviewAccountPassword(USER);

    expect(mocks.hashPassword).toHaveBeenCalledWith(password);
    expect(mocks.updatePassword).toHaveBeenCalledWith(USER, `hashed:${password}`);
  });

  it('mints a password the sign-up schema would accept', async () => {
    // Generated the same way as the one at creation, so an operator is never handed a password the
    // login form refuses — a failure they meet at random and cannot reproduce.
    const password = await resetPreviewAccountPassword(USER);

    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
    expect(password.length).toBeGreaterThanOrEqual(8);
  });

  it('gives a different password each time', async () => {
    const first = await resetPreviewAccountPassword(USER);
    const second = await resetPreviewAccountPassword(USER);

    expect(first).not.toBe(second);
  });

  it('refuses an account that is not a registered test account, before any write', async () => {
    // The same interlock the fabricator has, and what stops this being a "reset any user's
    // password" function reachable from a leaf route.
    mocks.isPreviewAccount.mockResolvedValue(false);

    await expect(resetPreviewAccountPassword('a-real-leader')).rejects.toThrow(
      /not a test account/i
    );

    expect(mocks.updatePassword).not.toHaveBeenCalled();
  });
});

describe('fastForwardPreviewAccount — the interlock', () => {
  it('refuses an account that is not a registered test account, before any write', async () => {
    mocks.isPreviewAccount.mockResolvedValue(false);

    await expect(fastForwardPreviewAccount('a-real-leader', 'summary')).rejects.toThrow(
      /not a test account/i
    );

    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.saveRunAnswers).not.toHaveBeenCalled();
    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });
});

describe('fastForwardPreviewAccount — invalid input', () => {
  it('refuses an unknown phase key rather than silently walking to the end', async () => {
    // This is a library function a future caller could reach directly (the smoke script already
    // does), not only through the route that validates `toPhase` with Zod first. The check has to
    // hold on its own.
    await expect(
      fastForwardPreviewAccount(USER, 'mid-audit', { toPhase: 'phase-9-invented' })
    ).rejects.toThrow('preview: unknown phase phase-9-invented');
  });
});

describe('fastForwardPreviewAccount — mid-audit', () => {
  it('walks the real engine phase by phase and stops at the target', async () => {
    const result = await fastForwardPreviewAccount(USER, 'mid-audit');

    expect(mocks.transitionRun.mock.calls.map((c) => c[2])).toEqual([
      'phase-0-setup',
      'phase-1-current',
      'phase-2-energy',
      'phase-3-ideal',
    ]);
    expect(result.atSummary).toBe(false);
  });

  it('writes the reflections the route would have required', async () => {
    // The service does not check these; the route does (I9). A phase-4 run with no phase-1 reflection
    // is a state no leader can reach, and the phase rail disagrees with the run on first reload.
    await fastForwardPreviewAccount(USER, 'mid-audit');

    const slugs = writtenSlugs();
    expect(slugs).toContain('reclaim_reflection_p1');
    expect(slugs).toContain('reclaim_reflection_p4');
    // Not p5: that belongs to a phase this run has not left.
    expect(slugs).not.toContain('reclaim_reflection_p5');
  });

  it('claims the chart reveal, so phase 1 does not offer a reveal already seen', async () => {
    await fastForwardPreviewAccount(USER, 'mid-audit');

    expect(mocks.claimCoachOpening).toHaveBeenCalledWith(USER, 'run-1', 'phase-1-chart-reveal');
  });

  it('honours an explicit target phase', async () => {
    await fastForwardPreviewAccount(USER, 'mid-audit', { toPhase: 'phase-2-energy' });

    expect(mocks.transitionRun.mock.calls.map((c) => c[2])).toEqual([
      'phase-0-setup',
      'phase-1-current',
    ]);
  });

  it('rethrows a refused transition, naming the phase, instead of swallowing it', async () => {
    // The failure this prevents: an account the API reports as mid-audit whose journey never moved.
    mocks.transitionRun.mockRejectedValueOnce(new Error('reflection required'));

    await expect(fastForwardPreviewAccount(USER, 'mid-audit')).rejects.toThrow(
      /refused to leave phase-0-setup/
    );
  });

  it('names the phase even when the engine rejects with something other than an Error', async () => {
    mocks.transitionRun.mockRejectedValueOnce('the engine exploded');

    await expect(fastForwardPreviewAccount(USER, 'mid-audit')).rejects.toThrow(
      /refused to leave phase-0-setup \(unknown\)/
    );
  });

  it('starts the run under the quarter it is given', async () => {
    await fastForwardPreviewAccount(USER, 'mid-audit', { quarter: '2026 Q4' });

    expect(mocks.createRun).toHaveBeenCalledWith(USER, '2026 Q4');
  });
});

describe('fastForwardPreviewAccount — at the summary', () => {
  it('walks every phase and leaves the run in progress on the last one', async () => {
    // The bug this replaced: the fabricator called `completeRun`, and `loadCurrentRunState` only
    // looks for an in-progress run — so signing in as a "completed" test account opened on the
    // invitation to begin, with the summary, the report and the sharing choices all behind it.
    const result = await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.transitionRun).toHaveBeenCalledTimes(6);
    expect(result.atSummary).toBe(true);
    expect(result.reachedPhaseKey).toBe('after:phase-5-action');
  });

  it('writes the takeaway, so the panel opens on the summary rather than on the question', async () => {
    // Phase 6 holds the summary back until `reclaim_reflection_p6` is answered. A run fabricated to
    // the summary and missing it opens on the question — which is not what was asked for.
    await fastForwardPreviewAccount(USER, 'summary');

    expect(writtenSlugs()).toContain('reclaim_reflection_p6');
  });

  it('leaves the takeaway alone for a run that stops short of the last phase', async () => {
    await fastForwardPreviewAccount(USER, 'mid-audit');

    expect(writtenSlugs()).not.toContain('reclaim_reflection_p6');
  });

  it('writes the analyst reading, so no model is ever called', async () => {
    // `ensureAnalystReading` is write-once and returns early when the column is set. Without this
    // write, opening the summary — or finishing the audit later — would spend real money.
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1' } })
    );
  });

  it('anchors the reading to areas the run actually filled in', async () => {
    // `parseAnalystReading` refuses a gap naming an area the run does not have, and refuses the whole
    // reading when it does — so a mismatch here costs the summary its entire analyst section.
    await fastForwardPreviewAccount(USER, 'summary');

    const data = mocks.runUpdate.mock.calls[0]?.[0] as {
      data: { analystReading: { gaps: { token: string }[] } };
    };
    const slugs = writtenSlugs();
    for (const gap of data.data.analystReading.gaps) {
      expect(slugs).toContain(`reclaim_current_hours__${gap.token}`);
    }
  });

  it('does not top up an account that still has an audit in hand', async () => {
    // The spare-grant bug: a freshly provisioned account already has its one standard audit, so an
    // unconditional top-up left the operator looking at a leader who had finished an audit and could
    // still start another. `hasAuditInHand` is what keeps the test account faithful to the gate.
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.grantAnotherAudit).not.toHaveBeenCalled();
  });

  it('tops the account up when its audits are spent, so a second fabrication is not refused', async () => {
    mocks.grantFindMany.mockResolvedValue([
      {
        tier: 'standard',
        auditsGranted: 1,
        auditsUsed: 1,
        windowStartsAt: null,
        mustStartBy: null,
      },
    ]);

    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.grantAnotherAudit).toHaveBeenCalledWith(
      USER,
      'standard',
      expect.any(String),
      expect.anything()
    );
    const grantOrder = mocks.grantAnotherAudit.mock.invocationCallOrder[0] ?? Infinity;
    const createOrder = mocks.createRun.mock.invocationCallOrder[0] ?? 0;
    expect(grantOrder).toBeLessThan(createOrder);
  });

  it('records consent when the account has not accepted, because the gate runs first', async () => {
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.recordConsent).toHaveBeenCalledWith(USER, 'draft-1', false);
  });

  it('does not record consent twice for an account that already accepted', async () => {
    mocks.readConsent.mockResolvedValue({ accepted: true, policyVersion: 'draft-1' });

    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });
});

describe('fastForwardPreviewAccount — answers arrive with the phase, not before it', () => {
  it('writes nothing from a phase the run has not reached', async () => {
    // The state this prevents: an operator opens phase 5 on an account sitting at phase 2 and finds
    // the action plan already filled in by a leader who has not been asked. Writing every answer up
    // front also made every stopping point identical underneath, which is what made the phase target
    // worth nothing as a preview.
    await fastForwardPreviewAccount(USER, 'mid-audit', { toPhase: 'phase-2-energy' });

    const slugs = writtenSlugs();
    expect(slugs).toContain('reclaim_energy_peak_description');
    expect(slugs).not.toContain('reclaim_ideal_total_hours');
    expect(slugs).not.toContain('reclaim_action_chosen');
    expect(slugs).not.toContain('reclaim_gap_strategy_mirror');
  });

  it('stops at phase 0 without transitioning, holding only the setup answers', async () => {
    // Phase 0 is a legal target and the loop must not treat "no transitions" as "walk to the end".
    await fastForwardPreviewAccount(USER, 'mid-audit', { toPhase: 'phase-0-setup' });

    expect(mocks.transitionRun).not.toHaveBeenCalled();
    const slugs = writtenSlugs();
    expect(slugs).toContain('reclaim_setup_keeping_me_up');
    expect(slugs).not.toContain('reclaim_current_hours__deep_work');
  });

  it('fills in the prose slots the refer-back quotes back, not only the numbers', async () => {
    // I13 quotes `keeping_me_up` and `why_now` verbatim in phase 4. Both were blank on every
    // fabricated audit, so the one beat the refer-back exists for had nothing to say on the only
    // accounts anybody used to look at it with.
    await fastForwardPreviewAccount(USER, 'summary');

    const slugs = writtenSlugs();
    for (const slug of [
      'reclaim_setup_keeping_me_up',
      'reclaim_setup_why_now',
      'reclaim_current_detail__deep_work',
      'reclaim_energy_protected',
      'reclaim_gap_unfunded_priorities',
      'reclaim_action_stopping',
      'reclaim_action_options',
    ]) {
      expect(slugs).toContain(slug);
    }
  });

  it('never writes a slot no part of the product writes', async () => {
    // These three are declared but have no writer anywhere: the panels compute the gap at render time
    // and the phase-2 panel writes prose beside the grid rather than the grid. Filling them would
    // invent a state no audit produces, which is the one thing a preview account must not do.
    await fastForwardPreviewAccount(USER, 'summary');

    const slugs = writtenSlugs();
    expect(slugs).not.toContain('reclaim_gap_summary');
    expect(slugs).not.toContain('reclaim_gap_hours_to_remove');
    expect(slugs).not.toContain('reclaim_energy_peak_windows');
  });

  it('leaves the calendar branch alone, so the path a leader who declines it walks is previewable', async () => {
    await fastForwardPreviewAccount(USER, 'summary');

    expect(writtenSlugs().filter((s) => s.startsWith('reclaim_calendar_'))).toEqual([]);
    expect(writtenSlugs().filter((s) => s.startsWith('reclaim_composite_'))).toEqual([]);
  });
});

describe('fastForwardPreviewAccount — the fabricated transcript', () => {
  it('marks the conversation and every message as fabricated', async () => {
    // The whole condition on which writing these rows was acceptable. Without the flag, an operator
    // reading the transcript back through the admin view cannot tell invented words from real ones.
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.conversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: { fabricated: true } }),
      })
    );
    for (const call of mocks.messageCreate.mock.calls) {
      expect((call[0] as { data: { metadata: unknown } }).data.metadata).toEqual({
        fabricated: true,
      });
    }
  });

  it('links the conversation to the run, or the coach surface opens an empty one', async () => {
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.linkRunConversation).toHaveBeenCalledWith('run-1', 'conv-1');
  });

  it('closes any conversation already active, keeping I15’s one-at-a-time true', async () => {
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.closeSurfaceConversation).toHaveBeenCalledWith(USER);
  });

  it('stamps turns in ascending order, so replies cannot precede their questions', async () => {
    // Several rows written inside one millisecond come back in an arbitrary order, and both readers
    // sort by `createdAt`. The bug is invisible until a reload happens to shuffle a phase.
    await fastForwardPreviewAccount(USER, 'summary');

    const times = writtenMessages().map((m) => m.createdAt.getTime());
    expect(times.length).toBeGreaterThan(0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // The last turn lands about now rather than in the future, which is what makes the transcript
    // read as a session somebody had.
    expect(times[times.length - 1]).toBeLessThanOrEqual(Date.now());
  });

  it('writes a phase’s turns before leaving it, so the phase marks cut in the right place', async () => {
    // A mark is the id of the last message that existed when the phase was entered. A transcript
    // written in one go at the end would file the whole conversation under the final phase.
    await fastForwardPreviewAccount(USER, 'mid-audit', { toPhase: 'phase-1-current' });

    const firstTransition = mocks.transitionRun.mock.invocationCallOrder[0] ?? Infinity;
    const firstMessage = mocks.messageCreate.mock.invocationCallOrder[0] ?? Infinity;
    const lastMessage = mocks.messageCreate.mock.invocationCallOrder.at(-1) ?? 0;
    expect(firstMessage).toBeLessThan(firstTransition);
    expect(lastMessage).toBeGreaterThan(firstTransition);
  });

  it('records a phase mark on every transition, which the service does not do for itself', async () => {
    // The **route** does this on a leader's own transition, not the service. A fabricator driving the
    // service directly has to, or every phase-scoped read of the transcript falls back to the whole
    // conversation.
    await fastForwardPreviewAccount(USER, 'summary');

    expect(mocks.recordPhaseMark).toHaveBeenCalledTimes(mocks.transitionRun.mock.calls.length);
  });

  it('translates the fixture’s roles into the ones the table stores', async () => {
    await fastForwardPreviewAccount(USER, 'mid-audit', { toPhase: 'phase-0-setup' });

    const roles = new Set(writtenMessages().map((m) => m.role));
    expect(roles).toEqual(new Set(['user', 'assistant']));
  });

  it('writes no synthetic trigger rows, which every reader is built to hide', async () => {
    await fastForwardPreviewAccount(USER, 'summary');

    for (const message of writtenMessages())
      expect(message.content.trim().length).toBeGreaterThan(0);
    expect(writtenMessages().some((m) => COACH_SYNTHETIC_MESSAGES.includes(m.content.trim()))).toBe(
      false
    );
  });

  it('fabricates the audit anyway when the surface has no agent bound', async () => {
    // A real deployment state on a fresh install. Refusing the whole fabrication over it would take
    // the phase walk away too, which is the part that works without an agent.
    mocks.resolveModuleSurface.mockResolvedValue(null);

    const result = await fastForwardPreviewAccount(USER, 'summary');

    expect(result.transcript).toBe('no-agent');
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.linkRunConversation).not.toHaveBeenCalled();
    expect(writtenSlugs()).toContain('reclaim_action_chosen');
  });
});

describe('describeFabrication', () => {
  it('names the phase, because being able to choose it is the point', () => {
    const sentence = describeFabrication({
      runId: 'run-1',
      reachedPhaseKey: 'phase-2-energy',
      atSummary: false,
      transcript: 'written',
    });

    expect(sentence).toContain('Energy');
    expect(sentence).not.toContain('mid-audit');
  });

  it('tells the operator when there is no agent, because they can fix that and cannot guess it', () => {
    const sentence = describeFabrication({
      runId: 'run-1',
      reachedPhaseKey: 'phase-6-summary',
      atSummary: true,
      transcript: 'no-agent',
    });

    expect(sentence).toMatch(/no public agent bound/i);
  });
});
