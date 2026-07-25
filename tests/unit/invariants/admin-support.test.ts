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

/** The one file allowed to widen access, and the reason it is allowed to. */
const ADMIN_READ_MODULE = 'lib/app/programme/admin/clients.ts';

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

  it('the admin read module is reachable only from admin-guarded routes', () => {
    const importers = ROOTS.flatMap(tsFiles).filter((f) =>
      code(readFileSync(f, 'utf8')).includes('programme/admin/clients')
    );

    for (const file of importers) {
      if (file.replace(/\\/g, '/') === ADMIN_READ_MODULE) continue;
      const source = code(readFileSync(file, 'utf8'));
      // Every consumer under `app/api` must be admin-guarded. `lib/app` consumers are library code
      // that carries no guard of its own, so they are held to the same rule transitively: today
      // there are none, and a new one should be a deliberate decision rather than a silent import.
      expect(
        source.includes('withAdminAuth'),
        `${file} reads the cross-user admin module without withAdminAuth`
      ).toBe(true);
    }
  });
});
