/**
 * Consent (F8 t-4) — the lawful basis, not a checkbox.
 *
 * Brief §2: "everyone should be aware and agree to the terms and conditions and privacy policy, **which
 * should allow for data to be used in aggregate**." F10 t-3's cross-client analysis has no lawful basis
 * without a recorded, versioned acceptance, and consent captured retroactively is not consent.
 *
 * **Captured at the programme door, not at signup** (plan D3). The signup form and the accept-invite
 * form are both Sunrise-owned, and Sunrise reserves no `lib/app/*` seam for the auth lifecycle
 * (sunrise#464) — so capturing "at account creation" would mean forking two core forms on better-auth's
 * path. Instead the record is written before the first audit and **enforced at run creation**, alongside
 * entitlement. Nothing about the leader is processed by the programme before it exists, which is what
 * the basis actually requires — and it covers both doors, invite today and open signup later.
 *
 * **Marketing is a separate fact.** Reconciliation 7: list membership is not the same as having an
 * account, and only `marketingOptIn` distinguishes "signed up for the tool" from "consented to be on
 * Rashmir's list". It defaults false, is never implied by accepting terms, and is stored on the same
 * row only because it is captured in the same moment.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { ForbiddenError } from '@/lib/api/errors';
import { isUniqueViolation } from '@/lib/app/programme/access/grants';

export interface ConsentState {
  /** True when this user has accepted the CURRENT policy version. */
  accepted: boolean;
  /** The version they must accept — from `Module.config`, so a new policy re-asks everyone. */
  policyVersion: string;
  /** Their standing marketing preference, so the form can reflect it rather than reset it. */
  marketingOptIn: boolean;
}

/** Has this user accepted `policyVersion`? Consent is to a *version*, so an older acceptance is not it. */
export async function readConsent(userId: string, policyVersion: string): Promise<ConsentState> {
  const rows = await prisma.reclaimConsent.findMany({
    where: { userId },
    orderBy: { acceptedAt: 'desc' },
  });
  const current = rows.find((row) => row.policyVersion === policyVersion);
  return {
    accepted: current !== undefined,
    policyVersion,
    // Carry the most recent preference forward, whichever version it was given under.
    marketingOptIn: rows[0]?.marketingOptIn ?? false,
  };
}

/**
 * Record acceptance of a policy version. Idempotent on `(userId, policyVersion)` — a double-submit
 * updates the marketing preference rather than writing a second consent record, which would make the
 * evidence ambiguous about what was agreed and when.
 */
export async function recordConsent(
  userId: string,
  policyVersion: string,
  marketingOptIn: boolean
): Promise<void> {
  try {
    await prisma.reclaimConsent.create({ data: { userId, policyVersion, marketingOptIn } });
    logger.info('Reclaim: consent recorded', { userId, policyVersion, marketingOptIn });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await prisma.reclaimConsent.updateMany({
      where: { userId, policyVersion },
      data: { marketingOptIn },
    });
  }
}

/**
 * Raised when a leader tries to start an audit without having accepted the current policy. Extends
 * `ForbiddenError` so the shared handler answers 403 — the same status as an entitlement refusal,
 * because it is the same kind of answer: you may not start, and here is why in a sentence.
 */
export class ConsentRequiredError extends ForbiddenError {
  readonly policyVersion: string;
  constructor(policyVersion: string) {
    super('Please accept the terms and privacy policy before starting your audit.');
    this.name = 'ConsentRequiredError';
    this.policyVersion = policyVersion;
  }
}
