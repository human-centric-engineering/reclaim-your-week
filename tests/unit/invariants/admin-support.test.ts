/**
 * D4 — the cross-user override is constructed in exactly one place (F10 t-1).
 *
 * `canRead` / `subjectScope` (`lib/framework/shared/access.ts`) are default-deny, and the one way past
 * them is `isAdminSupport: true` — deliberately an **explicit input** the caller opts into rather than
 * a role read off the session inside the framework, so that "this call site widened access" is
 * greppable. That property is only worth anything if the flag stays greppable, which is what this
 * asserts: it may appear in the leaf's admin read module and nowhere else.
 *
 * The failure this prevents is not hypothetical. Put `isAdminSupport` behind a shared helper and some
 * later consumer route reuses that helper for a perfectly innocent reason, and every user can read
 * every other user's journey — with nothing in the diff that looks like an authorisation change.
 *
 * A static source scan, like the I3 write-path guard next to it. Wired into `leaf:checks` by living
 * in `tests/unit/invariants`.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The leaf's two code trees: domain logic and the leaf API surface. */
const ROOTS = ['lib/app', 'app/api/v1/app'];

/** The one file allowed to construct the framework's admin-support viewer. */
const ADMIN_READ_MODULE = 'lib/app/programme/admin/clients.ts';

/**
 * Every module permitted to read another user's data, by any means.
 *
 * The flag check below is necessary and **not sufficient**, which is worth spelling out because the
 * first version of this guard claimed more than it delivered: `getSlotHeads(userId)` and
 * `getSlotHistory(userId)` take a bare user id with **no viewer argument at all** — the framework's
 * own comment says access scoping "wraps this" and `userId` is the seam. So a module can read any
 * user's slots without ever mentioning `isAdminSupport`, and a guard that only greps for the flag
 * would wave it through. `aggregate.ts` and `export.ts` are exactly that shape.
 *
 * The rule this list encodes: cross-user reads live in `lib/app/programme/admin/**` and are reachable
 * only from `withAdminAuth` routes. Adding a file here should be a deliberate act.
 */
const CROSS_USER_MODULES = [
  'lib/app/programme/admin/aggregate.ts',
  'lib/app/programme/admin/clients.ts',
  'lib/app/programme/admin/export.ts',
  // F17. Reads another leader's conversation, and only where they consented to it. Added here
  // deliberately, which is what this list asks for: it is the most sensitive cross-user read in the
  // app, and it should be impossible to add one without touching this file.
  'lib/app/programme/admin/transcript.ts',
  // F18 t-2. Reads another leader's runs, nudge preference and address in order to write to them,
  // and holds the record of what was written. Added deliberately, like the entry above it.
  'lib/app/programme/admin/reach-out.ts',
  // F19. Joins `user` and the audit runs to describe every test account. Its sibling
  // `lib/app/programme/preview/accounts.ts` is deliberately NOT here and must never be: that module
  // reads only the registry table, which is what lets `nudges/tick.ts` — a job with no
  // `withAdminAuth` — import the exclusion predicate. The split exists to keep this list honest.
  'lib/app/programme/admin/preview-list.ts',
];

/** The framework reads that take a bare `userId` and therefore carry no gate of their own. */
const UNGATED_SLOT_READS = ['getSlotHeads', 'getSlotHistory'];

/**
 * Source with comments removed.
 *
 * Without this the guard fails on its own subject matter: the routes that consume the admin module
 * explain in a doc comment *why* the override is opted into elsewhere, and a naive text scan reads
 * that explanation as a violation. A guard that punishes documenting the rule teaches people to stop
 * documenting it. Strings are left intact — a string containing `isAdminSupport` would be worth
 * looking at anyway.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(p));
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('D4 — the admin-support override is opted into in one place', () => {
  it('isAdminSupport appears only in the leaf admin read module', () => {
    const users = ROOTS.flatMap(tsFiles)
      .filter((f) => code(readFileSync(f, 'utf8')).includes('isAdminSupport'))
      .map((f) => f.split(/[\\/]/).join('/'))
      .sort();
    expect(users).toEqual([ADMIN_READ_MODULE]);
  });

  it('every cross-user module is reachable only from admin-guarded routes', () => {
    const owned = new Set(CROSS_USER_MODULES);

    for (const crossUserModule of CROSS_USER_MODULES) {
      // The import specifier the rest of the tree would use — `@/lib/app/programme/admin/clients`.
      const specifier = crossUserModule.replace(/^lib\//, '').replace(/\.ts$/, '');
      const importers = ROOTS.flatMap(tsFiles).filter(
        (f) =>
          !owned.has(f.split(/[\\/]/).join('/')) &&
          code(readFileSync(f, 'utf8')).includes(specifier)
      );

      for (const file of importers) {
        // Every consumer under `app/api` must be admin-guarded. A `lib/app` consumer carries no guard
        // of its own, so it fails this too — which is the point: cross-user data must not acquire a
        // route into ungated library code by way of a helpful-looking import.
        expect(
          code(readFileSync(file, 'utf8')).includes('withAdminAuth'),
          `${file} imports the cross-user module ${crossUserModule} without withAdminAuth`
        ).toBe(true);
      }
    }
  });

  it('the ungated framework slot reads happen only in cross-user modules or on the caller’s own id', () => {
    // `getSlotHeads(userId)` has no viewer argument, so the caller's route guard IS the gate. Files
    // outside the admin set may still call it — the consumer surfaces read a leader's own slots all
    // day — so the assertion is narrower than "nobody else calls it": any file that calls it and is
    // NOT a declared cross-user module must not be reachable from an admin cross-user path.
    const owned = new Set(CROSS_USER_MODULES);
    const callers = ROOTS.flatMap(tsFiles).filter((f) => {
      const source = code(readFileSync(f, 'utf8'));
      return UNGATED_SLOT_READS.some((fn) => source.includes(`${fn}(`));
    });

    // Every declared cross-user module must actually be in this set — if one stops reading slots, the
    // list above has drifted and should shrink rather than quietly over-claim.
    const callerPaths = new Set(callers.map((f) => f.split(/[\\/]/).join('/')));
    for (const crossUserModule of CROSS_USER_MODULES) {
      if (
        crossUserModule.endsWith('clients.ts') ||
        crossUserModule.endsWith('aggregate.ts') ||
        crossUserModule.endsWith('export.ts')
      ) {
        expect(
          callerPaths.has(crossUserModule),
          `${crossUserModule} no longer reads slots — update the list`
        ).toBe(true);
      }
    }

    // And no file outside the admin folder may sit in `lib/app/programme/admin/**` reading slots
    // without being declared.
    for (const path of callerPaths) {
      if (path.startsWith('lib/app/programme/admin/')) {
        expect(
          owned.has(path),
          `${path} reads slots inside the admin folder but is not declared`
        ).toBe(true);
      }
    }
  });
});
