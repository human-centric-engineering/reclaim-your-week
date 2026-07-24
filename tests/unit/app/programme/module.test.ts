/**
 * `reclaim-audit` module definition + leaf registration (F2 t-1).
 *
 * Pins the three things t-1 delivers, all DB-free (the real boot sync is F3):
 *   - the definition's stable identity (slug) and the `coach` agent seat;
 *   - the `configSchema` parses an empty object (every field defaults) AND a
 *     representative filled config — the *shape* is right, even before t-3 fills
 *     the verbatim content;
 *   - `initLeafApp()` actually registers the module into the in-memory registry,
 *     so the boot-time sync would see it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  reclaimAuditModule,
  reclaimConfigSchema,
  RECLAIM_MODULE_SLUG,
  RECLAIM_COACH_ROLE,
} from '@/lib/app/programme/module';

// The leaf tier consumes the framework through seams; a leaf unit test mocks the seam
// rather than importing `@/lib/framework` (the boundary rule treats `tests/unit/app/**`
// as app-shell). Real-DB registration is proven by `smoke:reclaim` (F3), not here.
const { registerModuleMock } = vi.hoisted(() => ({ registerModuleMock: vi.fn() }));
vi.mock('@/lib/framework/modules', () => ({ registerModule: registerModuleMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reclaimAuditModule definition', () => {
  it('has the stable slug and a human name/description', () => {
    expect(reclaimAuditModule.slug).toBe('reclaim-audit');
    expect(RECLAIM_MODULE_SLUG).toBe('reclaim-audit');
    expect(reclaimAuditModule.name.length).toBeGreaterThan(0);
    expect(reclaimAuditModule.description.length).toBeGreaterThan(0);
  });

  it('offers exactly the coach agent seat (F3 binds into it)', () => {
    expect(reclaimAuditModule.agentRoles).toEqual([RECLAIM_COACH_ROLE]);
    expect(RECLAIM_COACH_ROLE).toBe('coach');
  });

  it('declares the 105 slot definitions (t-2)', () => {
    expect(reclaimAuditModule.slotDefinitions).toHaveLength(105);
  });
});

describe('reclaimConfigSchema', () => {
  it('parses an empty object — every field defaults to the verbatim content (t-3)', () => {
    // t-3 filled the defaults with Rashmir's content; the exact strings are guarded
    // character-identical against content-source.md in content.test.ts (I11 hop 2). Here we
    // only assert the shape is populated, not empty.
    const config = reclaimConfigSchema.parse({});
    expect(config.governingFrame).toContain('This is not a productivity exercise');
    expect(config.buckets).toHaveLength(9);
    expect(config.deepWorkNote).toContain('Deep work cuts across all buckets');
    expect(config.hourBands).toHaveLength(3);
    expect(config.footnote).toContain('Nsansa Ltd');
    expect(config.consultationEmail).toBe('rashmir@rashmir.net');
  });

  it('parses a representative filled config (a bucket + a band)', () => {
    const config = reclaimConfigSchema.parse({
      governingFrame: 'This is not a productivity exercise.',
      buckets: [
        {
          slug: 'deep-work',
          title: 'Deep work',
          description: 'Protected time for thinking.',
          colour: '#2D6A4F',
          benchmark: { note: 'no percentage range', lowPercent: null, highPercent: null },
          conditional: false,
        },
      ],
      deepWorkNote: 'Deep work cuts across all buckets.',
      hourBands: [
        { slug: 'sustainable', lowerHours: 45, upperHours: 50, label: 'sustainable ceiling' },
      ],
      footnote: 'A note.',
      consultationEmail: 'hello@example.com',
    });
    expect(config.buckets[0]?.slug).toBe('deep-work');
    expect(config.buckets[0]?.benchmark.highPercent).toBeNull();
    expect(config.hourBands[0]?.upperHours).toBe(50);
  });

  it('allows the open-ended 55+ band (null upperHours)', () => {
    const config = reclaimConfigSchema.parse({
      hourBands: [
        { slug: 'unsustainable', lowerHours: 55, upperHours: null, label: 'unsustainable' },
      ],
    });
    expect(config.hourBands[0]?.upperHours).toBeNull();
  });

  it('rejects a bucket missing a required field', () => {
    const result = reclaimConfigSchema.safeParse({
      buckets: [{ slug: 'deep-work', title: 'Deep work' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('initLeafApp registration', () => {
  it('registers the reclaim-audit module through the framework seam', async () => {
    const { initLeafApp } = await import('@/lib/app/leaf-bootstrap');
    await initLeafApp();

    expect(registerModuleMock).toHaveBeenCalledTimes(1);
    expect(registerModuleMock).toHaveBeenCalledWith(reclaimAuditModule);
    // The registered definition carries the identity + seat the boot sync (F3) needs.
    const registered = registerModuleMock.mock.calls[0]?.[0];
    expect(registered.slug).toBe('reclaim-audit');
    expect(registered.agentRoles).toEqual(['coach']);
  });
});
