/**
 * `reclaim-audit` slot definitions (F2 t-2).
 *
 * The load-bearing test is `pins the exact 107 slugs from slot-spec.md`: the spec warns that
 * "tests won't catch a plausible rewording" of prose, but an invented or renamed *slug* silently
 * breaks downstream refer-backs (F7) and trend lines (F9). So the expected slug set here is written
 * out independently from the spec's own tables — not imported from the source — and compared as a
 * set. The other tests pin the per-group counts, the I5 no-special_category rule, and the required
 * SlotDefinitionInput shape.
 */

import { describe, it, expect } from 'vitest';
import { reclaimSlotDefinitions, assertNoSpecialCategory } from '@/lib/app/programme/slots';

// The nine bucket tokens, in display order (slot-spec.md / content-source.md §1). Written out here
// independently of the source module so a drift in either is caught.
const BUCKET_TOKENS = [
  'deep_work',
  'learning_development',
  'strategic_planning',
  'team_development',
  'organisational_oversight',
  'fundraising_capital',
  'relationship_building',
  'delivery_operations',
  'recovery_white_space',
];

const perBucket = (prefix: string) => BUCKET_TOKENS.map((t) => `${prefix}${t}`);

// The full 107-slug expectation, assembled group-by-group from slot-spec.md.
const EXPECTED_SLUGS: string[] = [
  // reclaim_profile (6)
  'reclaim_profile_first_name',
  'reclaim_profile_role',
  'reclaim_profile_org_type',
  'reclaim_profile_direct_reports',
  'reclaim_profile_distributed_team',
  'reclaim_profile_distributed_impact',
  // reclaim_setup (9)
  'reclaim_setup_in_transition',
  'reclaim_setup_transition_detail',
  'reclaim_setup_fundraising_relevant',
  'reclaim_setup_fundraising_support',
  'reclaim_setup_weekly_hours',
  'reclaim_setup_priorities',
  'reclaim_setup_keeping_me_up',
  'reclaim_setup_why_now',
  'reclaim_setup_audit_period',
  // reclaim_current (21)
  ...perBucket('reclaim_current_hours__'),
  ...perBucket('reclaim_current_detail__'),
  'reclaim_current_deep_block_exists',
  'reclaim_current_deep_block_when',
  'reclaim_current_deep_block_blocker',
  // reclaim_calendar (22)
  ...perBucket('reclaim_calendar_hours__'),
  'reclaim_calendar_uploaded',
  'reclaim_calendar_declined',
  'reclaim_calendar_completeness',
  'reclaim_calendar_period',
  'reclaim_calendar_total_hours',
  'reclaim_calendar_events_per_day',
  'reclaim_calendar_switch_frequency',
  'reclaim_calendar_back_to_back',
  'reclaim_calendar_longest_block',
  'reclaim_calendar_reactive_time',
  'reclaim_calendar_ambiguous_items',
  'reclaim_calendar_offcal_work',
  'reclaim_calendar_messaging_load',
  // reclaim_composite (10)
  ...perBucket('reclaim_composite_hours__'),
  'reclaim_composite_variance_note',
  // reclaim_energy (3)
  'reclaim_energy_peak_windows',
  'reclaim_energy_peak_description',
  'reclaim_energy_protected',
  // reclaim_ideal (12)
  ...perBucket('reclaim_ideal_hours__'),
  'reclaim_ideal_total_hours',
  'reclaim_ideal_deep_block_when',
  'reclaim_ideal_protected_commitment',
  // reclaim_gap (6)
  'reclaim_gap_summary',
  'reclaim_gap_hours_to_remove',
  'reclaim_gap_unfunded_priorities',
  'reclaim_gap_challenge_offered',
  'reclaim_gap_challenge_response',
  'reclaim_gap_strategy_mirror',
  // reclaim_action (6)
  'reclaim_action_options',
  'reclaim_action_chosen',
  'reclaim_action_when',
  'reclaim_action_stopping',
  'reclaim_action_how_known',
  'reclaim_action_wanted_not_dutiful',
  // reclaim_reflection (6)
  'reclaim_reflection_p1',
  'reclaim_reflection_p2',
  'reclaim_reflection_p3',
  'reclaim_reflection_p4',
  'reclaim_reflection_p5',
  'reclaim_reflection_p6',
  // reclaim_share (6)
  'reclaim_share_with_coach',
  'reclaim_share_age_band',
  'reclaim_share_demographic_1',
  'reclaim_share_demographic_2',
  'reclaim_share_takeaway',
  'reclaim_share_quotable',
];

// Expected count per group heading (slot-spec.md §Count).
const EXPECTED_GROUP_COUNTS: Record<string, number> = {
  reclaim_profile: 6,
  reclaim_setup: 9,
  reclaim_current: 21,
  reclaim_calendar: 22,
  reclaim_composite: 10,
  reclaim_energy: 3,
  reclaim_ideal: 12,
  reclaim_gap: 6,
  reclaim_action: 6,
  reclaim_reflection: 6,
  reclaim_share: 6,
};

describe('reclaimSlotDefinitions', () => {
  it('declares exactly 107 slots', () => {
    expect(reclaimSlotDefinitions).toHaveLength(107);
    expect(EXPECTED_SLUGS).toHaveLength(107);
  });

  it('pins the exact 107 slugs from slot-spec.md (no invented or renamed slug)', () => {
    const actual = reclaimSlotDefinitions.map((s) => s.slug).sort();
    expect(actual).toEqual([...EXPECTED_SLUGS].sort());
  });

  it('has no duplicate slugs', () => {
    const slugs = reclaimSlotDefinitions.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('matches the per-group counts in the spec', () => {
    const counts: Record<string, number> = {};
    for (const slot of reclaimSlotDefinitions) {
      counts[slot.group] = (counts[slot.group] ?? 0) + 1;
    }
    expect(counts).toEqual(EXPECTED_GROUP_COUNTS);
  });

  it('gives every bucket a slot in each per-bucket group', () => {
    for (const prefix of [
      'reclaim_current_hours__',
      'reclaim_current_detail__',
      'reclaim_calendar_hours__',
      'reclaim_composite_hours__',
      'reclaim_ideal_hours__',
    ]) {
      const slugs = reclaimSlotDefinitions.map((s) => s.slug);
      for (const token of BUCKET_TOKENS) {
        expect(slugs).toContain(`${prefix}${token}`);
      }
    }
  });

  it('requires slug, group, and a non-empty description on every slot (SlotDefinitionInput)', () => {
    for (const slot of reclaimSlotDefinitions) {
      expect(slot.slug).toMatch(/^reclaim_/);
      expect(slot.group).toMatch(/^reclaim_/);
      expect(slot.description.length).toBeGreaterThan(0);
    }
  });

  it('never classifies a slot special_category (I5)', () => {
    for (const slot of reclaimSlotDefinitions) {
      expect(slot.sensitivity).not.toBe('special_category');
    }
  });

  it('classifies the verbatim-returned setup slots as sensitive, not special_category (F7 depends on this)', () => {
    const keepingMeUp = reclaimSlotDefinitions.find(
      (s) => s.slug === 'reclaim_setup_keeping_me_up'
    );
    expect(keepingMeUp?.sensitivity).toBe('sensitive');
  });

  it('types the hours slots as number and detail/reflection as text', () => {
    const hours = reclaimSlotDefinitions.find((s) => s.slug === 'reclaim_current_hours__deep_work');
    expect(hours?.dataType).toBe('number');
    const detail = reclaimSlotDefinitions.find(
      (s) => s.slug === 'reclaim_current_detail__deep_work'
    );
    expect(detail?.dataType).toBe('text');
  });
});

describe('assertNoSpecialCategory', () => {
  it('passes for the real slot set', () => {
    expect(() => assertNoSpecialCategory(reclaimSlotDefinitions)).not.toThrow();
  });

  it('throws when a slot is special_category, naming the offender', () => {
    expect(() =>
      assertNoSpecialCategory([
        {
          slug: 'bad_slot',
          group: 'reclaim_setup',
          description: 'x',
          sensitivity: 'special_category',
        },
      ])
    ).toThrow(/bad_slot/);
  });
});
