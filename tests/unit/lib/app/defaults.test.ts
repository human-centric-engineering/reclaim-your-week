/**
 * Tests: lib/app/ bootstrap files ship as no-op defaults
 *
 * The auto-wired bootstrap hooks (`lib/app/rate-limit.ts`, `lib/app/capabilities.ts`,
 * `lib/app/context-contributors.ts`) must register NOTHING out of the box — the
 * template ships them empty and forks fill them in. The wiring tests
 * (`bootstrap-wiring.test.ts`, `admin-nav-wiring.test.tsx`) replace these hooks
 * with registering versions; this file exercises the REAL defaults to lock in
 * the no-op contract (a stray default registration would silently apply to
 * every install).
 *
 * NOTE (Daybreak): `lib/app/admin-nav.ts` is FILLED in this fork — its
 * `initAppNav()` registers the framework nav section (covered by
 * `admin-nav.test.ts`), the same way `bootstrap.ts` is filled. So the leaf no-op
 * contract moves to the reserved-empty seam it delegates to,
 * `lib/app/leaf-admin-nav.ts`, which is what this file now asserts.
 *
 * @see lib/app/rate-limit.ts · lib/app/capabilities.ts · lib/app/leaf-admin-nav.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import { registerAppRateLimits } from '@/lib/app/rate-limit';
import { initAppCapabilities } from '@/lib/app/capabilities';
import { initAppContextContributors } from '@/lib/app/context-contributors';
import { initLeafAdminNav } from '@/lib/app/leaf-admin-nav';
import { publicNavItems, footerNavItems, footerLegalItems } from '@/lib/app/public-nav';
import { emailOverrides } from '@/lib/app/emails';
import { initApp } from '@/lib/app/bootstrap';
import { initAppKnowledgeAccessContributors } from '@/lib/app/knowledge-access-contributors';
import appEslintConfig from '@/lib/app/eslint.config.mjs';
import {
  getEffectiveRateLimitPolicy,
  RATE_LIMIT_POLICY,
  __resetAppRateLimitRules,
} from '@/lib/security/rate-limit-policy';
import { getRegisteredNavSections, __resetNavRegistryForTests } from '@/lib/admin-nav/registry';

afterEach(() => {
  __resetNavRegistryForTests();
  // Both rate-limit tests in this file call the real `registerAppRateLimits()`, and
  // `registerRateLimitRule` dedupes by object reference, not by content — a fresh call from a second
  // test appends a second, referentially distinct copy of each rule rather than being a no-op.
  __resetAppRateLimitRules();
});

describe('lib/app/ bootstrap defaults are no-ops', () => {
  it('registerAppRateLimits registers exactly the leaf’s own public-claim rule', () => {
    // Act — run the real hook. No longer empty: F11 registers the cap for the public group-link
    // claim here, which is what the reserved seam is for (Sunrise ships it empty; the LEAF fills it),
    // and the only place a leaf may add one — `lib/security/**` is core.
    registerAppRateLimits();

    // Assert — the policy is no longer the base by identity, and what was added is ours and bounded.
    const effective = getEffectiveRateLimitPolicy();
    expect(effective).not.toBe(RATE_LIMIT_POLICY);

    const appRules = effective.filter((rule) => !RATE_LIMIT_POLICY.includes(rule));
    // The catch-all is appended alongside app rules, so exclude it before counting ours.
    const ours = appRules.filter((rule) => rule.tier === 'reclaim-join');
    expect(ours).toHaveLength(1);
    // Keyed on IP because the claimant has no account yet, by definition, and scoped to the one
    // public path. A broader matcher here would silently re-cap authenticated leaf routes.
    expect(ours[0]?.key).toBe('ip');
    expect(ours[0]?.match).toBeInstanceOf(RegExp);
    expect((ours[0]?.match as RegExp).test('/api/v1/app/reclaim/join/abc')).toBe(true);
    expect((ours[0]?.match as RegExp).test('/api/v1/app/reclaim/invites')).toBe(false);
  });

  it('registerAppRateLimits also registers the F19 preview-account cap, session-keyed', () => {
    // F19: the preview-account surface provisions real accounts and sends real email, so it is
    // tightened below the inherited 100/min section cap rather than left on it — a stuck button
    // should not be free to create a hundred accounts a minute. Its own test, since it is a second,
    // independent rule registered by the same call the test above already exercises.
    registerAppRateLimits();

    const effective = getEffectiveRateLimitPolicy();
    const appRules = effective.filter((rule) => !RATE_LIMIT_POLICY.includes(rule));
    const ours = appRules.filter((rule) => rule.tier === 'reclaim-preview');

    expect(ours).toHaveLength(1);
    // Session-keyed, not IP: two operators in one office must not share a budget.
    expect(ours[0]?.key).toBe('session-user');
    expect(ours[0]?.match).toBeInstanceOf(RegExp);
    expect((ours[0]?.match as RegExp).test('/api/v1/app/reclaim/admin/preview')).toBe(true);
    expect(
      (ours[0]?.match as RegExp).test('/api/v1/app/reclaim/admin/preview/abc/fast-forward')
    ).toBe(true);
    // Must not accidentally widen to the ordinary invites surface, which stays on its own limiter.
    expect((ours[0]?.match as RegExp).test('/api/v1/app/reclaim/invites')).toBe(false);
  });

  it('initAppCapabilities is a no-op by default', () => {
    // The real default does nothing and returns void; forks add
    // registerAppCapability() calls. (Behavioural reach into the dispatcher is
    // covered by bootstrap-wiring.test.ts.)
    expect(initAppCapabilities()).toBeUndefined();
  });

  it('initAppContextContributors is a no-op by default', () => {
    // The real default registers no prompt-context loaders and returns void;
    // forks add registerContextContributor() calls. (Behavioural reach into
    // buildContext is covered by context-builder.test.ts.)
    expect(initAppContextContributors()).toBeUndefined();
  });

  it('initLeafAdminNav registers exactly the leaf’s own admin section', () => {
    // Arrange — clean registry
    __resetNavRegistryForTests();

    // Act — run the real leaf hook. It is no longer empty: F8 t-1 registers this app's own admin
    // section here, which is exactly what the reserved seam is for (Daybreak keeps it empty; the
    // LEAF fills it). What still matters is that it registers *this* and nothing else — a stray
    // section would appear in every admin sidebar.
    initLeafAdminNav();

    // Assert — ONE section, ours, and every entry under the leaf's own admin surface. The item list
    // grows as features land (F8 added access; F10 the overview, clients, shared results and
    // content), so pinning the exact hrefs would make this a change-detector. What must not drift is
    // the count of sections and the fact that no item points outside `/admin/programme`.
    const sections = getRegisteredNavSections();
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Reclaim Your Week');

    const hrefs = sections[0]?.items?.map((i) => i.href) ?? [];
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href.startsWith('/admin/programme'))).toBe(true);
    expect(hrefs).toContain('/admin/programme/access');
    // No duplicates — two entries on one href is a copy-paste slip that reads as a broken sidebar.
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('public-nav overrides point only at pages this app actually has', () => {
    // These were `null` (platform defaults) until post-v1 P4 replaced the starter-template public
    // pages. The seam is now used deliberately — the platform default is Home / About / Contact, and
    // for an invite-only audit the privacy notice belongs in the header rather than the fine print,
    // because a leader deciding whether to be honest with a tool wants to know where the answers go.
    //
    // What still earns an assertion is that nothing here points somewhere that does not exist: a
    // nav item to a 404 is the kind of thing nobody notices until a real visitor does.
    // Only the HEADER is overridden — it gains Privacy, because for an invite-only audit the notice
    // is part of the pitch rather than fine print. Both footer clusters stay `null`: the platform
    // defaults already point at the pages we have, and overriding with an identical list would read
    // as intent while carrying none.
    expect(footerNavItems).toBeNull();
    expect(footerLegalItems).toBeNull();

    const routes = new Set(['/', '/about', '/privacy', '/terms', '/contact']);
    expect(publicNavItems).not.toBeNull();
    for (const item of publicNavItems ?? []) {
      expect(routes.has(item.href), `${item.href} is not a page this app has`).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
    }
    expect(publicNavItems?.map((i) => i.href)).toContain('/privacy');
  });

  it('overrides the two emails a leader reads, leaving the credential emails on the platform template', () => {
    // F8 t-1 overrides `invitation`: the platform copy is written for a SaaS team invite, and this is
    // the first thing an invited leader reads from the product. `welcome` joined it post-v1 for a
    // worse reason — the platform default was still describing this app as "your production-ready
    // Next.js starter template", and it had gone to every account since the first.
    //
    // **The scope is the assertion**, and it now cuts both ways. A stray override still swaps an auth
    // email for every install. But the failure this list actually had was the opposite one: `welcome`
    // sat on a platform default nobody had read, because an override is only ever added by someone
    // who went looking. `verifyEmail` and `resetPassword` are deliberately left — both are pure
    // credential mechanics, and neither carries a claim about what this product is.
    expect(Object.keys(emailOverrides).sort()).toEqual(['invitation', 'welcome']);
    expect(emailOverrides.invitation).toBeTypeOf('function');
    expect(emailOverrides.welcome).toBeTypeOf('function');
  });

  it('initApp does no boot work by default (resolves to undefined)', async () => {
    // The real default is an empty async fn; forks fill it. A stray default
    // would run one-time work on every install boot. (The instrumentation
    // wiring — that register() calls this in all envs, isolated in try/catch —
    // is covered by tests/unit/instrumentation.test.ts.)
    await expect(initApp()).resolves.toBeUndefined();
  });

  it('initAppKnowledgeAccessContributors is a no-op by default', () => {
    // The real default registers no access contributors and returns void; forks
    // add registerAgentAccessContributor() calls. A stray default would silently
    // widen every restricted agent's document access on every install.
    // (Behavioural reach into the resolver is covered by
    // resolveAgentDocumentAccess.test.ts.)
    expect(initAppKnowledgeAccessContributors()).toBeUndefined();
  });

  it('the ESLint config seam carries only the leaf-seed framework-import exemption', () => {
    // Vanilla Sunrise ships this seam empty; this leaf fills it (F3) with exactly ONE block: the
    // framework-import exemption for `prisma/seeds/app-reclaim/**` (leaf seeds must import
    // `@/lib/framework` to publish the map and bind the agent, and run via `tsx`, never `next
    // build`). A stray flat-config block here would silently apply lint rules to every file (the
    // root eslint.config.mjs spreads this array last), so assert the block precisely — its file
    // glob, and that it restates the core `@/`-alias ban rather than dropping it.
    expect(appEslintConfig).toHaveLength(1);
    const [block] = appEslintConfig;
    // The leaf-owned framework-consuming paths: seeds + the app API/UI surfaces (F3, F4), plus the
    // leaf's own tests for them (the conversational surface) — a test must import what it exercises
    // and ships in no build, which is the reason Daybreak's own ban exempts its tests too. The
    // invariant guards are on that list for the sharpest version of the same reason: `agent-caps`
    // imports the framework's real `facetAllows` rather than mirroring it, and a hand-written copy
    // of an enforcement function passed for a year while the runtime enforced nothing.
    expect(block.files).toEqual([
      'prisma/seeds/app-reclaim/**/*.{ts,tsx}',
      'app/api/v1/app/**/*.{ts,tsx}',
      'app/(programme)/**/*.{ts,tsx}',
      'app/admin/programme/**/*.{ts,tsx}',
      'tests/**/lib/app/**/*.{ts,tsx}',
      'tests/**/app/api/v1/app/**/*.{ts,tsx}',
      'tests/**/components/app/reclaim/**/*.{ts,tsx}',
      'tests/**/invariants/**/*.{ts,tsx}',
    ]);
    expect(block.rules['no-restricted-imports']).toBeDefined();
  });
});
