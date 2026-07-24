/**
 * The `reclaim-audit` coach agent definition (F2 t-4).
 *
 * Identity and module wiring. The cross-cutting behaviour — voice (I1/I2) and the capability
 * lockdown (I6) — is guarded by the invariant tests in `tests/unit/invariants/`, which run in
 * `leaf:checks`; this file pins the plain structure F3 t-1's seed consumes.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';
import {
  reclaimAuditModule,
  RECLAIM_MODULE_SLUG,
  RECLAIM_COACH_ROLE,
} from '@/lib/app/programme/module';

describe('reclaimCoachAgent identity', () => {
  it('has a stable slug, name, and description', () => {
    expect(reclaimCoachAgent.slug).toBe('reclaim-coach');
    expect(reclaimCoachAgent.name).toBe('Reclaim Your Week coach');
    expect(reclaimCoachAgent.description.length).toBeGreaterThan(0);
  });

  it('binds into the reclaim-audit module coach seat', () => {
    expect(reclaimCoachAgent.moduleSlug).toBe(RECLAIM_MODULE_SLUG);
    expect(reclaimCoachAgent.role).toBe(RECLAIM_COACH_ROLE);
  });

  it('names a role the module actually offers (a seat, not a free-text field)', () => {
    expect(reclaimAuditModule.agentRoles).toContain(reclaimCoachAgent.role);
  });
});

describe('reclaimCoachAgent authored content', () => {
  it('fills all four composed fields (persona → systemInstructions → guardrails → brand voice)', () => {
    expect(reclaimCoachAgent.persona.length).toBeGreaterThan(0);
    expect(reclaimCoachAgent.systemInstructions.length).toBeGreaterThan(0);
    expect(reclaimCoachAgent.guardrails.length).toBeGreaterThan(0);
    expect(reclaimCoachAgent.brandVoiceInstructions.length).toBeGreaterThan(0);
  });
});

describe('reclaimCoachAgent capability grants', () => {
  it('grants four capabilities, one per slug (no duplicates)', () => {
    const slugs = reclaimCoachAgent.capabilities.map((c) => c.slug);
    expect(slugs).toHaveLength(4);
    expect(new Set(slugs).size).toBe(4);
  });

  it('attaches an exposure config only to fill_slot', () => {
    const withConfig = reclaimCoachAgent.capabilities.filter((c) => c.customConfig !== undefined);
    expect(withConfig.map((c) => c.slug)).toEqual(['fill_slot']);
  });
});
