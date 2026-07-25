/**
 * The subject-access export (F10 t-5).
 *
 * The one assertion that matters is **completeness**, and it is a static one: `EXPORTED_SOURCES` must
 * name every `app_reclaim_*` table the schema defines. An export that silently omits a table is worse
 * than no export at all, because it looks like an answer — and the way that happens is somebody adds
 * a table in a later feature and never thinks about this file. Reading the schema rather than a
 * hand-kept list is what turns that from a memory problem into a failing build.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPORTED_SOURCES } from '@/lib/app/programme/admin/export';

describe('EXPORTED_SOURCES', () => {
  it('names every app_reclaim_* table in the leaf schema', () => {
    const schema = readFileSync('prisma/schema/app-reclaim.prisma', 'utf8');
    const mapped = [...schema.matchAll(/@@map\("(app_reclaim_[a-z_]+)"\)/g)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined)
      .sort();

    expect(mapped.length).toBeGreaterThan(0);
    for (const table of mapped) {
      expect(
        EXPORTED_SOURCES,
        `${table} exists in the schema but is not covered by the client export`
      ).toContain(table);
    }
  });

  it('covers framework_slot_value, where the audit answers actually live', () => {
    // The eight leaf tables are bookkeeping about a leader. This is what they said.
    expect(EXPORTED_SOURCES).toContain('framework_slot_value');
  });
});
