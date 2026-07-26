/**
 * `appProtectedRoutes` — the app's contribution to the edge auth gate.
 *
 * The proxy's own suite (`tests/unit/lib/security/proxy.test.ts`) mocks this scaffold with fixtures
 * (`/projects`, `/reports/`, `''`) because it is testing the *merge mechanism* — that app prefixes are
 * appended to the core three, that a trailing slash is normalised, that junk entries are dropped.
 * Nothing there asserts what this app actually contributes, which is why an empty list went unnoticed.
 *
 * This file is the other half: the leaf's real values. `/programme` was absent until 2026-07-26, and
 * the symptom was quiet — the page is a client shell, so a signed-out visitor got the shell and then
 * "We could not load your audit just now" from the 401 behind it, rather than a login prompt.
 *
 * @see lib/app/protected-routes.ts · proxy.ts
 */

import { describe, it, expect } from 'vitest';
import { appProtectedRoutes } from '@/lib/app/protected-routes';

describe('appProtectedRoutes', () => {
  it('gates the programme — the app surface behind the invitation', () => {
    expect(appProtectedRoutes).toContain('/programme');
  });

  it('leaves the three genuinely public surfaces ungated', () => {
    // A shared report, an unsubscribe and a claim page each have to work for someone with no session
    // at all — a link forwarded to a colleague, an email footer, an invitation to an account that does
    // not exist yet. Prefix-matching means listing any of these would break all three.
    for (const publicPrefix of ['/summary', '/nudges', '/join']) {
      expect(appProtectedRoutes.some((r) => publicPrefix.startsWith(r))).toBe(false);
    }
  });

  it('contributes only well-formed prefixes the proxy will accept', () => {
    // The proxy drops anything that isn't a non-empty `/`-prefixed path. An entry it silently drops
    // reads as protection that isn't there.
    for (const route of appProtectedRoutes) {
      expect(route.startsWith('/')).toBe(true);
      expect(route.length).toBeGreaterThan(1);
      expect(route.endsWith('/')).toBe(false);
    }
  });
});
