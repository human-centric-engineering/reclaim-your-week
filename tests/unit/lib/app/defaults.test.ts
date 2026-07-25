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
import { getEffectiveRateLimitPolicy, RATE_LIMIT_POLICY } from '@/lib/security/rate-limit-policy';
import { getRegisteredNavSections, __resetNavRegistryForTests } from '@/lib/admin-nav/registry';

afterEach(() => {
  __resetNavRegistryForTests();
});

describe('lib/app/ bootstrap defaults are no-ops', () => {
  it('registerAppRateLimits registers no tiers or rules by default', () => {
    // Act — run the real (empty) hook
    registerAppRateLimits();

    // Assert — no app rules → the effective policy is the base policy by identity
    expect(getEffectiveRateLimitPolicy()).toBe(RATE_LIMIT_POLICY);
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

  it('public-nav overrides are all null by default (= use platform defaults)', () => {
    // A stray non-null list here would silently replace the marketing nav for
    // every install (issue #347 ships these unset).
    expect(publicNavItems).toBeNull();
    expect(footerNavItems).toBeNull();
    expect(footerLegalItems).toBeNull();
  });

  it('overrides only the invitation email, leaving every other kind on the platform template', () => {
    // F8 t-1 overrides `invitation` deliberately: the platform copy is written for a SaaS team invite
    // and this is the first thing an invited leader reads from the product. The assertion that still
    // earns its keep is the *scope* — a stray override would silently swap an auth email (welcome,
    // verification, password reset) for every install, which is not something this feature intends.
    expect(Object.keys(emailOverrides)).toEqual(['invitation']);
    expect(emailOverrides.invitation).toBeTypeOf('function');
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
    // The leaf-owned framework-consuming paths: seeds + the app API/UI surfaces (F3, F4).
    expect(block.files).toEqual([
      'prisma/seeds/app-reclaim/**/*.{ts,tsx}',
      'app/api/v1/app/**/*.{ts,tsx}',
      'app/(protected)/programme/**/*.{ts,tsx}',
      'app/admin/programme/**/*.{ts,tsx}',
    ]);
    expect(block.rules['no-restricted-imports']).toBeDefined();
  });
});
