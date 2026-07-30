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
 *   3. **The analyst is never called.** The reading is written before `completeRun`, so the write-once
 *      `ensureAnalystReading` finds it already there and the completion costs nothing.
 *   4. **Reflections are written**, even though the service does not check for them — the route does.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isPreviewAccount: vi.fn(),
  registerPreviewAccount: vi.fn(),
  createRun: vi.fn(),
  saveRunAnswers: vi.fn(),
  transitionRun: vi.fn(),
  completeRun: vi.fn(),
  claimCoachOpening: vi.fn(),
  recordConsent: vi.fn(),
  readConsent: vi.fn(),
  grantAnotherAudit: vi.fn(),
  mintGrant: vi.fn(),
  runUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  signUpEmail: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { update: mocks.runUpdate },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
  },
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { signUpEmail: mocks.signUpEmail } } }));
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
    Promise.resolve({ policyVersion: 'draft-1', clientMustStartWithinDays: 30 }),
}));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  createRun: mocks.createRun,
  saveRunAnswers: mocks.saveRunAnswers,
  transitionRun: mocks.transitionRun,
  completeRun: mocks.completeRun,
  claimCoachOpening: mocks.claimCoachOpening,
}));

import {
  provisionPreviewAccount,
  fastForwardPreviewAccount,
} from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';
import { passwordSchema } from '@/lib/validations/auth';

const USER = 'preview-user-1';

/** The slugs a `saveRunAnswers` call wrote, flattened across every call. */
const writtenSlugs = (): string[] =>
  mocks.saveRunAnswers.mock.calls.flatMap((call) =>
    ((call[2] ?? []) as { slotSlug: string }[]).map((a) => a.slotSlug)
  );

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.isPreviewAccount.mockResolvedValue(true);
  mocks.readConsent.mockResolvedValue({ accepted: false, policyVersion: 'draft-1' });
  mocks.createRun.mockResolvedValue({ id: 'run-1' });
  mocks.transitionRun.mockImplementation((_u: string, _r: string, key: string) =>
    Promise.resolve({ enteredPhaseKey: `after:${key}` })
  );
  mocks.userFindUnique.mockResolvedValue({ id: USER });
  mocks.signUpEmail.mockResolvedValue({});
});

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

describe('fastForwardPreviewAccount — the interlock', () => {
  it('refuses an account that is not a registered test account, before any write', async () => {
    mocks.isPreviewAccount.mockResolvedValue(false);

    await expect(fastForwardPreviewAccount('a-real-leader', 'completed')).rejects.toThrow(
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
    expect(result.completed).toBe(false);
    expect(mocks.completeRun).not.toHaveBeenCalled();
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

describe('fastForwardPreviewAccount — completed', () => {
  it('walks every phase and completes the run', async () => {
    const result = await fastForwardPreviewAccount(USER, 'completed');

    expect(mocks.transitionRun).toHaveBeenCalledTimes(6);
    expect(mocks.completeRun).toHaveBeenCalledWith(USER, 'run-1');
    expect(result.completed).toBe(true);
  });

  it('writes the analyst reading BEFORE completing, so no model is ever called', async () => {
    // `ensureAnalystReading` runs inside `completeRun` and returns early when the column is set. The
    // ordering is the whole mechanism: reversed, every fabricated completion would spend real money.
    await fastForwardPreviewAccount(USER, 'completed');

    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1' } })
    );
    const updateOrder = mocks.runUpdate.mock.invocationCallOrder[0] ?? Infinity;
    const completeOrder = mocks.completeRun.mock.invocationCallOrder[0] ?? 0;
    expect(updateOrder).toBeLessThan(completeOrder);
  });

  it('anchors the reading to areas the run actually filled in', async () => {
    // `parseAnalystReading` refuses a gap naming an area the run does not have, and refuses the whole
    // reading when it does — so a mismatch here costs the summary its entire analyst section.
    await fastForwardPreviewAccount(USER, 'completed');

    const data = mocks.runUpdate.mock.calls[0]?.[0] as {
      data: { analystReading: { gaps: { token: string }[] } };
    };
    const slugs = writtenSlugs();
    for (const gap of data.data.analystReading.gaps) {
      expect(slugs).toContain(`reclaim_current_hours__${gap.token}`);
    }
  });

  it('tops the account up first, so a second fast-forward is not refused', async () => {
    // Completing consumes the account's single standard audit. Without this, the second use of the
    // button on the same account fails the entitlement gate.
    await fastForwardPreviewAccount(USER, 'completed');

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
    await fastForwardPreviewAccount(USER, 'completed');

    expect(mocks.recordConsent).toHaveBeenCalledWith(USER, 'draft-1', false);
  });

  it('does not record consent twice for an account that already accepted', async () => {
    mocks.readConsent.mockResolvedValue({ accepted: true, policyVersion: 'draft-1' });

    await fastForwardPreviewAccount(USER, 'completed');

    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });
});
