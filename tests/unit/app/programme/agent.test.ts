/**
 * The `reclaim-audit` coach agent definition (F2 t-4).
 *
 * Identity and module wiring. The cross-cutting behaviour — voice (I1/I2) and the capability
 * lockdown (I6) — is guarded by the invariant tests in `tests/unit/invariants/`, which run in
 * `leaf:checks`; this file pins the plain structure F3 t-1's seed consumes.
 */

import { describe, it, expect } from 'vitest';
import { reclaimCoachAgent, RECLAIM_RECORD_ANSWERS_SLUG } from '@/lib/app/programme/agent';
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

  it('pins a provider and a model rather than inheriting whatever the install resolves to', () => {
    // An empty binding is filled by `resolveAgentProviderAndModel` from the system default-model
    // map, which on an OpenAI install is `gpt-4o-mini`. This coach captures the entire audit through
    // silent, unprompted, multi-slot tool calls, and a mini model drops them: observed live, it
    // narrated "I'll record that…" and called nothing, leaving the leader's panel empty. Both halves
    // are pinned because a named model with an empty provider is routed to the first keyed candidate,
    // which need not be the one that serves it.
    expect(reclaimCoachAgent.provider).toBe('openai');
    expect(reclaimCoachAgent.model).toBe('gpt-4o');
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
  it('grants five capabilities, one per slug (no duplicates)', () => {
    // `fill_slot` is still not among them: it was removed once `record_answers` covered the same
    // group from a server-issued run. See `agent.ts` for why the narrower tool was the less safe
    // one. The fifth is `offer_choices`, which writes nothing at all.
    const slugs = reclaimCoachAgent.capabilities.map((c) => c.slug);
    expect(slugs).toHaveLength(5);
    expect(new Set(slugs).size).toBe(5);
  });

  it('attaches an exposure config to the one write and to none of the reads', () => {
    // The reads are unrestricted; the write carries an allowlist. `agent-caps.test.ts` asserts what
    // that allowlist contains — here we only care that no write escaped without one.
    const withConfig = reclaimCoachAgent.capabilities.filter((c) => c.customConfig !== undefined);
    expect(withConfig.map((c) => c.slug)).toEqual([RECLAIM_RECORD_ANSWERS_SLUG]);
  });
});
