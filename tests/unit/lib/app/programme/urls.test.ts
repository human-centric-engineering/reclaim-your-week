/**
 * Absolute URLs for the places this app links to from outside itself (F15 t-3). Pure — no network,
 * no database.
 *
 * The one thing worth asserting: `auditSummaryUrl` composes `appUrl()` with the run id rather than a
 * second, independently-typed base URL. Two senders (the quarterly nudge, the completion email) both
 * depend on this staying one definition — see the file's own header for why that drift was a real
 * risk before this module existed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: undefined } }));

import { appUrl, auditSummaryUrl } from '@/lib/app/programme/urls';

const ORIGINAL_BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;

afterEach(() => {
  if (ORIGINAL_BETTER_AUTH_URL === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = ORIGINAL_BETTER_AUTH_URL;
});

describe('appUrl', () => {
  it('falls back to BETTER_AUTH_URL when the public app URL is unset', () => {
    process.env.BETTER_AUTH_URL = 'https://auth.example.com';
    expect(appUrl()).toBe('https://auth.example.com');
  });

  it('falls back to localhost when neither is set', () => {
    delete process.env.BETTER_AUTH_URL;
    expect(appUrl()).toBe('http://localhost:3000');
  });
});

describe('auditSummaryUrl', () => {
  it('composes the origin with the run history path, URL-encoded', () => {
    process.env.BETTER_AUTH_URL = 'https://reclaim.example.com';
    expect(auditSummaryUrl('run/1')).toBe('https://reclaim.example.com/programme/history/run%2F1');
  });
});
