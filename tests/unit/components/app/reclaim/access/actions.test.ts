/**
 * Access client actions (F8). `fetch` is stubbed; no network.
 *
 * These exist because of the F4 t-4 lesson ([[planning-retro]] §B): the leaf's hand-rolled wire parsing
 * drifted from the shared shape and silently dropped events. So the assertions are about the
 * **contract**, not the happy path — an unexpected envelope must fail loudly rather than yield
 * undefined, and a server refusal must reach the leader **verbatim**, because entitlement and consent
 * refusals are product copy written once on the server (I16/I17).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  listInvites,
  issueInvite,
  revokeInvite,
  referSomeone,
  readConsentState,
  acceptConsent,
  grantAnotherAudit,
} from '@/components/app/reclaim/access/actions';

const fetchMock = vi.fn();

const ok = (data: unknown) => ({ ok: true, json: () => Promise.resolve({ success: true, data }) });
const fail = (message: string) => ({
  ok: false,
  json: () => Promise.resolve({ success: false, error: { code: 'FORBIDDEN', message } }),
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const inviteRow = {
  id: 'inv1',
  email: 'leader@example.org',
  tier: 'client',
  status: 'pending' as const,
  invitedByName: null,
  redeemedByName: null,
  // F11: null is an invite Rashmir typed. A populated label means it was claimed from a group link.
  viaLinkLabel: null,
  redeemedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('listInvites', () => {
  it('unwraps the envelope', async () => {
    fetchMock.mockResolvedValue(ok({ invites: [inviteRow] }));

    expect(await listInvites()).toEqual([inviteRow]);
  });

  it('throws on an unexpected shape rather than returning undefined rows', async () => {
    fetchMock.mockResolvedValue(ok({ invites: [{ id: 'inv1' }] }));

    await expect(listInvites()).rejects.toThrow(/Unexpected response/);
  });

  it('surfaces the server’s message on failure', async () => {
    fetchMock.mockResolvedValue(fail('Admins only'));

    await expect(listInvites()).rejects.toThrow('Admins only');
  });
});

describe('issueInvite', () => {
  it('posts the tier and returns the server’s own message', async () => {
    fetchMock.mockResolvedValue(ok({ emailStatus: 'sent', message: 'Invitation sent.' }));

    expect(
      await issueInvite({ name: 'Priya', email: 'p@example.org', tier: 'client', resend: false })
    ).toBe('Invitation sent.');
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/invites');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Priya',
      email: 'p@example.org',
      tier: 'client',
    });
  });

  it('asks for a re-send explicitly rather than by accident', async () => {
    fetchMock.mockResolvedValue(ok({ emailStatus: 'sent', message: 'Invitation sent.' }));

    await issueInvite({ name: 'Priya', email: 'p@example.org', tier: 'standard', resend: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/app/reclaim/invites?resend=true');
  });

  it('reports a conflict in the server’s words', async () => {
    fetchMock.mockResolvedValue(fail('An account already exists for this email'));

    await expect(
      issueInvite({ name: 'Priya', email: 'p@example.org', tier: 'standard', resend: false })
    ).rejects.toThrow('An account already exists for this email');
  });
});

describe('revokeInvite', () => {
  it('DELETEs the invite', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'inv1', revokedAt: '2026-07-05T00:00:00.000Z' }));

    await revokeInvite('inv1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/app/reclaim/invites/inv1');
    expect(init.method).toBe('DELETE');
  });
});

describe('referSomeone', () => {
  it('passes the deliberately vague refusal through unchanged', async () => {
    // The route will not say whether an address is already registered. The client must not "improve"
    // that into something more helpful, which would leak exactly what the vagueness protects.
    fetchMock.mockResolvedValue(fail('That invitation could not be sent'));

    await expect(referSomeone({ name: 'Sam', email: 's@example.org' })).rejects.toThrow(
      'That invitation could not be sent'
    );
  });

  it('returns the confirmation line on success', async () => {
    fetchMock.mockResolvedValue(
      ok({ emailStatus: 'sent', message: 'Your invitation is on its way.' })
    );

    expect(await referSomeone({ name: 'Sam', email: 's@example.org' })).toBe(
      'Your invitation is on its way.'
    );
  });
});

describe('consent', () => {
  it('reads the version and the standing marketing preference', async () => {
    fetchMock.mockResolvedValue(
      ok({ accepted: false, policyVersion: 'draft-1', marketingOptIn: true })
    );

    expect(await readConsentState()).toEqual({
      accepted: false,
      policyVersion: 'draft-1',
      marketingOptIn: true,
    });
  });

  it('echoes the server’s version back and sends the affirmative act explicitly', async () => {
    fetchMock.mockResolvedValue(ok({ accepted: true, policyVersion: 'draft-1' }));

    await acceptConsent('draft-1', false);

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      policyVersion: 'draft-1',
      marketingOptIn: false,
      acceptTerms: true,
    });
  });

  it('surfaces a stale-policy refusal instead of silently succeeding', async () => {
    fetchMock.mockResolvedValue(fail('These terms have been updated'));

    await expect(acceptConsent('draft-0', false)).rejects.toThrow('These terms have been updated');
  });
});

describe('grantAnotherAudit', () => {
  it('posts the email and tier, and returns the server’s message', async () => {
    fetchMock.mockResolvedValue(
      ok({ granted: true, message: 'They can start another audit now.' })
    );

    expect(await grantAnotherAudit({ email: 'leader@example.org', tier: 'standard' })).toBe(
      'They can start another audit now.'
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/grants');
    expect(JSON.parse(init.body)).toEqual({ email: 'leader@example.org', tier: 'standard' });
  });

  it('surfaces "no account exists" rather than pretending it worked', async () => {
    fetchMock.mockResolvedValue(
      fail('No account exists for this email — send them an invitation instead')
    );

    await expect(
      grantAnotherAudit({ email: 'nobody@example.org', tier: 'standard' })
    ).rejects.toThrow(/send them an invitation instead/);
  });
});

describe('failure handling when the server says nothing useful', () => {
  // A 500 with an HTML body, a proxy timeout, a truncated response: `res.json()` rejects or yields a
  // shape with no message. The leader must still get a sentence, never `undefined` or a raw throw.
  it('falls back to the action’s own wording when the body is not the error envelope', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });

    await expect(listInvites()).rejects.toThrow('We could not load the invitations.');
  });

  it('falls back for every action that can fail', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nonsense: true }) });

    await expect(revokeInvite('inv1')).rejects.toThrow('That invitation could not be withdrawn.');
    await expect(readConsentState()).rejects.toThrow('We could not load the terms just now.');
    await expect(acceptConsent('draft-1', false)).rejects.toThrow(
      'We could not record that just now.'
    );
    await expect(grantAnotherAudit({ email: 'a@b.co', tier: 'standard' })).rejects.toThrow(
      'That audit could not be granted.'
    );
    await expect(
      issueInvite({ name: 'A', email: 'a@b.co', tier: 'standard', resend: false })
    ).rejects.toThrow('The invitation could not be issued.');
    await expect(referSomeone({ name: 'A', email: 'a@b.co' })).rejects.toThrow(
      'That invitation could not be sent.'
    );
  });
});
