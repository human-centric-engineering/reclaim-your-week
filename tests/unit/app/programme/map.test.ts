/**
 * The reclaim-audit journey map (F3 t-1) — no-DB structural guard.
 *
 * Asserts the authored `MapDefinition` has the shape F4 builds on: seven `stage` phases in a
 * linear `prerequisite` chain, all `repeatable`, no edge conditions (the run-2 head-version trap).
 * Catches a malformed map at PR time without waiting for `smoke:reclaim` and a real Postgres.
 *
 * The real publish gate (`validatePublishableMap`) is exercised where it lives — `createGraph` runs
 * it at seed time (`001-reclaim-map`), proven end to end by `smoke:reclaim`. The leaf import boundary
 * forbids a runtime `@/lib/framework` import here anyway (only `import type`), so this file guards
 * structure and leaves validation to the seed path.
 */

import { describe, it, expect } from 'vitest';
import { reclaimJourneyMap, RECLAIM_PHASES } from '@/lib/app/programme/map';

describe('reclaim journey map', () => {
  it('declares the seven phases in order, all stage + repeatable', () => {
    expect(reclaimJourneyMap.nodes).toHaveLength(7);
    expect(reclaimJourneyMap.nodes.map((n) => n.key)).toEqual([
      'phase-0-setup',
      'phase-1-current',
      'phase-2-energy',
      'phase-3-ideal',
      'phase-4-gap',
      'phase-5-action',
      'phase-6-summary',
    ]);
    for (const node of reclaimJourneyMap.nodes) {
      expect(node.type).toBe('stage');
      expect(node.completionMode).toBe('repeatable');
    }
  });

  it('is a plain prerequisite chain with no edge conditions', () => {
    // Six edges for seven phases; each gates the next phase on the previous one.
    expect(reclaimJourneyMap.edges).toHaveLength(RECLAIM_PHASES.length - 1);
    reclaimJourneyMap.edges.forEach((edge, index) => {
      expect(edge.type).toBe('prerequisite');
      expect(edge.from).toBe(RECLAIM_PHASES[index].key);
      expect(edge.to).toBe(RECLAIM_PHASES[index + 1].key);
      // Slot/state conditions read the head version, which breaks on run 2 (F1 runId unused
      // until F4's saveAnswer). The spike's map must carry none.
      expect(edge.condition).toBeUndefined();
    });
  });
});
