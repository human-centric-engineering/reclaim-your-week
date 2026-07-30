'use client';

/**
 * Client actions for the access surfaces (F8) — invites, referrals, consent.
 *
 * The sibling of `phase/actions.ts`, and it exists for the reason that file does: every one of these
 * screens needs the same three moves (call a route, read the `{ data }` envelope, surface the server's
 * message on failure), and hand-rolling that per component is how a leaf drifts from the shared shape.
 * F4 t-4 learned this the expensive way — a hand-rolled SSE parser silently dropped two event types
 * ([[planning-retro]] §B) — so these consume `parseEnvelope` / `errorMessageFrom` rather than casting
 * response bodies, which is also the repo's "never `as` on external data" rule.
 *
 * The server messages matter here more than usual: an entitlement refusal and a consent prompt are
 * **product copy** written once, on the server (`entitlement.ts`), and every caller shows them verbatim.
 */

import { z } from 'zod';
import { parseEnvelope, errorMessageFrom } from '@/components/app/reclaim/calendar/types';

const inviteRowSchema = z.object({
  id: z.string(),
  email: z.string(),
  tier: z.string(),
  status: z.enum(['pending', 'redeemed', 'revoked']),
  invitedByName: z.string().nullable(),
  redeemedByName: z.string().nullable(),
  viaLinkLabel: z.string().nullable(),
  emailStatus: z.string().nullable(),
  redeemedAt: z.string().nullable(),
  createdAt: z.string(),
});

const inviteListSchema = z.object({ invites: z.array(inviteRowSchema) });

const inviteLinkRowSchema = z.object({
  id: z.string(),
  token: z.string(),
  label: z.string(),
  tier: z.string(),
  maxClaims: z.number(),
  claimCount: z.number(),
  status: z.enum(['live', 'full', 'expired', 'revoked']),
  expiresAt: z.string(),
  createdAt: z.string(),
});

const inviteLinkListSchema = z.object({
  links: z.array(inviteLinkRowSchema),
  config: z.object({
    joinLinkDefaultMaxClaims: z.number(),
    joinLinkDefaultDays: z.number(),
    joinLinkMaxClaims: z.number(),
  }),
});

const mintLinkResultSchema = z.object({ link: inviteLinkRowSchema, message: z.string() });

const claimResultSchema = z.object({
  outcome: z.enum(['invited', 'invited_email_failed', 'already_claimed', 'already_registered']),
  message: z.string(),
});

export type ClaimResult = z.infer<typeof claimResultSchema>;

export type InviteLinkRow = z.infer<typeof inviteLinkRowSchema>;
export type InviteLinkConfig = z.infer<typeof inviteLinkListSchema>['config'];
const issueResultSchema = z.object({ emailStatus: z.string(), message: z.string() });

/**
 * The admin issue response, which carries the `/accept-invite` link as well.
 *
 * A separate schema from `issueResultSchema` rather than one with an optional field, because the
 * difference is a rule and not a shape: the admin route returns the link, and the referral route —
 * callable by any participant — must never do so. A single permissive schema would let the link
 * appear on the referral path the day someone adds it there, and nothing would object.
 */
const adminIssueResultSchema = issueResultSchema.extend({
  invitationUrl: z.string().nullable(),
});
const grantResultSchema = z.object({ granted: z.boolean(), message: z.string() });
const consentStateSchema = z.object({
  accepted: z.boolean(),
  policyVersion: z.string(),
  marketingOptIn: z.boolean(),
});

export type InviteRow = z.infer<typeof inviteRowSchema>;
export type ConsentState = z.infer<typeof consentStateSchema>;

/** Read the server's message from a failed response, or a fallback. Never throws. */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  const json: unknown = await res.json().catch(() => null);
  return errorMessageFrom(json) ?? fallback;
}

/** Every invite, enriched by the server in one query. */
export async function listInvites(): Promise<InviteRow[]> {
  const res = await fetch('/api/v1/app/reclaim/invites');
  if (!res.ok) throw new Error(await failureMessage(res, 'We could not load the invitations.'));
  return parseEnvelope(await res.json(), inviteListSchema).invites;
}

export interface IssuedInvite {
  /** The server's own sentence for the operator. */
  message: string;
  /** The `/accept-invite` link, or `null` when an invitation already stood (nothing was minted). */
  invitationUrl: string | null;
}

/**
 * Issue (or re-issue) a tiered invite. Returns the server's own message **and** the link.
 *
 * The link is shown once and never stored: only its hash exists server-side, so a screen that lost it
 * cannot ask for it again — re-sending is the only way to get another. Callers must say so.
 */
export async function issueInvite(input: {
  name: string;
  email: string;
  tier: string;
  resend: boolean;
}): Promise<IssuedInvite> {
  const res = await fetch(`/api/v1/app/reclaim/invites${input.resend ? '?resend=true' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, email: input.email, tier: input.tier }),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'The invitation could not be issued.'));
  const result = parseEnvelope(await res.json(), adminIssueResultSchema);
  return { message: result.message, invitationUrl: result.invitationUrl };
}

/** Withdraw an unredeemed invite. */
export async function revokeInvite(id: string): Promise<void> {
  const res = await fetch(`/api/v1/app/reclaim/invites/${id}`, { method: 'DELETE' });
  if (!res.ok)
    throw new Error(await failureMessage(res, 'That invitation could not be withdrawn.'));
}

/** Every group invite link, plus the mint-form defaults and ceiling the server enforces (F11). */
export async function listInviteLinks(): Promise<{
  links: InviteLinkRow[];
  config: InviteLinkConfig;
}> {
  const res = await fetch('/api/v1/app/reclaim/invite-links');
  if (!res.ok) throw new Error(await failureMessage(res, 'We could not load the links.'));
  return parseEnvelope(await res.json(), inviteLinkListSchema);
}

/** Mint a capped, dated group link. Returns the new row so the caller can show its URL at once. */
export async function mintInviteLink(input: {
  label: string;
  maxClaims: number;
  expiryDays: number;
}): Promise<InviteLinkRow> {
  const res = await fetch('/api/v1/app/reclaim/invite-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'That link could not be created.'));
  return parseEnvelope(await res.json(), mintLinkResultSchema).link;
}

/** Withdraw a group link. Invitations already claimed through it are unaffected. */
export async function revokeInviteLink(id: string): Promise<void> {
  const res = await fetch(`/api/v1/app/reclaim/invite-links/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await failureMessage(res, 'That link could not be withdrawn.'));
}

/**
 * Claim a seat on a group link (F11). **The only call here made by someone with no account.**
 *
 * Both the refusal and the confirmation are the server's own sentences: the four link-state refusals
 * (unknown, withdrawn, expired, full) each tell a person standing in a room something different about
 * what to do next, and flattening them into one client-side string would take that away.
 */
export async function claimJoinLink(
  token: string,
  input: { name: string; email: string; website: string }
): Promise<ClaimResult> {
  const res = await fetch(`/api/v1/app/reclaim/join/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await failureMessage(
        res,
        'We could not do that just now. Try again in a moment, or ask whoever shared the link.'
      )
    );
  }
  return parseEnvelope(await res.json(), claimResultSchema);
}

/** Refer someone in (F8 t-3). Returns the server's confirmation line. */
export async function referSomeone(input: { name: string; email: string }): Promise<string> {
  const res = await fetch('/api/v1/app/reclaim/invites/refer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'That invitation could not be sent.'));
  return parseEnvelope(await res.json(), issueResultSchema).message;
}

/** What this leader must accept, and whether they already have (F8 t-4). */
export async function readConsentState(): Promise<ConsentState> {
  const res = await fetch('/api/v1/app/reclaim/consent');
  if (!res.ok) throw new Error(await failureMessage(res, 'We could not load the terms just now.'));
  return parseEnvelope(await res.json(), consentStateSchema);
}

/**
 * Record acceptance. The version is echoed back from the server's own read, so a leader shown older
 * terms is asked again rather than silently recorded as accepting the new ones.
 */
export async function acceptConsent(policyVersion: string, marketingOptIn: boolean): Promise<void> {
  const res = await fetch('/api/v1/app/reclaim/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policyVersion, marketingOptIn, acceptTerms: true }),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'We could not record that just now.'));
}

/**
 * Give an existing account another audit (F8 t-2). Distinct from issuing an invite: no email, no
 * token — one row in the ledger, for a leader who has already used what their invitation included.
 */
export async function grantAnotherAudit(input: { email: string; tier: string }): Promise<string> {
  const res = await fetch('/api/v1/app/reclaim/grants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'That audit could not be granted.'));
  return parseEnvelope(await res.json(), grantResultSchema).message;
}
