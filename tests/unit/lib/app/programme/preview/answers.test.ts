/**
 * The per-phase preview answers (F19).
 *
 * Two kinds of assertion here, and the second is the one that will earn its keep.
 *
 * The first is about **shape**: every slug written is a real slot, each phase writes only its own
 * group, and the numbers agree with each other. A fixture that drifts from the slot registry fails
 * silently at runtime, because `saveAnswer` on an unknown slug is a write nobody reads.
 *
 * The second is about **what is deliberately absent**. Three declared slots have no writer anywhere
 * in the product, the calendar branch is not taken, and nothing presses share. Each of those is a
 * decision with a reason, and each looks exactly like an oversight to whoever meets it next. The
 * assertions are here so that filling one in is a deliberate act with a test to update, rather than a
 * tidy-up somebody does on a Friday.
 */

import { describe, it, expect, vi } from 'vitest';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import {
  CURRENT_HOURS,
  IDEAL_HOURS,
  previewAnswersForPhase,
} from '@/lib/app/programme/preview/answers';

const PHASES = [0, 1, 2, 3, 4, 5, 6];

const declaredSlugs = new Set(reclaimSlotDefinitions.map((slot) => slot.slug));

const allAnswers = () => PHASES.flatMap((index) => previewAnswersForPhase(index));

const slugsUpTo = (phaseIndex: number): string[] =>
  PHASES.filter((index) => index <= phaseIndex)
    .flatMap((index) => previewAnswersForPhase(index))
    .map((answer) => answer.slotSlug);

describe('previewAnswersForPhase — every slug is a real slot', () => {
  it('writes nothing the module has not declared', () => {
    // The failure this catches is invisible in production: `saveAnswer` on an unknown slug writes a
    // row nothing reads, so the screen is simply blank and looks like a rendering bug.
    const unknown = allAnswers()
      .map((a) => a.slotSlug)
      .filter((slug) => !declaredSlugs.has(slug));

    expect(unknown).toEqual([]);
  });

  it('writes each slug once across the whole audit', () => {
    // Slot writes are versioned inserts, so a duplicate is not an error; it is a leader who answered
    // the same question twice, which is a state the fixture should not be inventing.
    const slugs = allAnswers().map((a) => a.slotSlug);

    expect(slugs.length).toBe(new Set(slugs).size);
  });
});

describe('previewAnswersForPhase — a phase writes only its own', () => {
  it.each([
    [0, 'reclaim_setup_', 'reclaim_profile_'],
    [1, 'reclaim_current_', null],
    [2, 'reclaim_energy_', null],
    [3, 'reclaim_ideal_', null],
    [4, 'reclaim_gap_', null],
    [5, 'reclaim_action_', null],
  ])('phase %i writes only %s answers and its reflection', (index, prefix, second) => {
    const strays = previewAnswersForPhase(index)
      .map((a) => a.slotSlug)
      .filter(
        (slug) =>
          !slug.startsWith(prefix) &&
          !(second !== null && slug.startsWith(second)) &&
          !slug.startsWith('reclaim_reflection_')
      );

    expect(strays).toEqual([]);
  });

  it('gives phase 0 no reflection, because it is a form rather than a reveal', () => {
    expect(previewAnswersForPhase(0).map((a) => a.slotSlug)).not.toContain('reclaim_reflection_p0');
  });

  it('carries a distinct reflection for each of phases 1 to 6', () => {
    // They used to be the same sentence five times, which is not what a reflection pause produces and
    // makes the phase rail read as a copy-paste on the one screen built to show a leader their own
    // thinking.
    const reflections = PHASES.map((index) =>
      previewAnswersForPhase(index).find((a) => a.slotSlug.startsWith('reclaim_reflection_'))
    ).filter((answer) => answer !== undefined);

    expect(reflections).toHaveLength(6);
    expect(new Set(reflections.map((r) => r.value)).size).toBe(6);
  });

  it('returns nothing for a phase outside the audit', () => {
    expect(previewAnswersForPhase(7)).toEqual([]);
    expect(previewAnswersForPhase(-1)).toEqual([]);
  });
});

describe('previewAnswersForPhase — the numbers agree with each other', () => {
  it('covers every bucket the audit will show, and no conditional one', () => {
    const shown = RECLAIM_BUCKETS.filter((b) => !b.conditional).map((b) => bucketToken(b.slug));
    const conditional = RECLAIM_BUCKETS.filter((b) => b.conditional).map((b) =>
      bucketToken(b.slug)
    );

    expect(Object.keys(CURRENT_HOURS).sort()).toEqual([...shown].sort());
    expect(Object.keys(IDEAL_HOURS).sort()).toEqual([...shown].sort());
    // Phase 0 says fundraising is not relevant, so hours for it would be hours against an area this
    // leader was never shown.
    for (const token of conditional) {
      expect(CURRENT_HOURS[token]).toBeUndefined();
      expect(IDEAL_HOURS[token]).toBeUndefined();
    }
  });

  it('matches the stated weekly hours to the areas that make them up', () => {
    // A leader whose areas do not add up to their own stated week is a leader no screen can be judged
    // against: the chart's total and the Phase 0 answer disagree in front of the operator.
    const stated = previewAnswersForPhase(0).find(
      (a) => a.slotSlug === 'reclaim_setup_weekly_hours'
    );
    const total = Object.values(CURRENT_HOURS).reduce((sum, hours) => sum + hours, 0);

    expect(stated?.valueJson).toBe(total);
  });

  it('derives the ideal total from the ideal areas rather than restating it', () => {
    const total = previewAnswersForPhase(3).find((a) => a.slotSlug === 'reclaim_ideal_total_hours');

    expect(total?.valueJson).toBe(Object.values(IDEAL_HOURS).reduce((sum, h) => sum + h, 0));
  });

  it('types every number and boolean slot, not only its prose', () => {
    // `num()` falls back to parsing `value`, so a missing `valueJson` is survivable and silently
    // different: the chart reads the string, the coach's briefing reads the typed form.
    const typed = new Map(reclaimSlotDefinitions.map((s) => [s.slug, s.dataType]));

    for (const answer of allAnswers()) {
      const dataType = typed.get(answer.slotSlug);
      if (dataType === 'number' || dataType === 'boolean' || dataType === 'json') {
        expect(answer.valueJson).toBeDefined();
      }
    }
  });
});

describe('previewAnswersForPhase — what is left out on purpose', () => {
  it('leaves the three slots nothing in the product writes', () => {
    // No panel persists the gap (it is computed at render time) and the phase-2 panel writes the two
    // prose slots beside the grid rather than the grid. Filling these would invent a state no audit
    // produces, which is the one thing a preview account must never do.
    const slugs = allAnswers().map((a) => a.slotSlug);

    expect(slugs).not.toContain('reclaim_gap_summary');
    expect(slugs).not.toContain('reclaim_gap_hours_to_remove');
    expect(slugs).not.toContain('reclaim_energy_peak_windows');
  });

  it('never takes the calendar branch', () => {
    // Deliberate: a fabricator that always uploaded could not show the path a leader who declines it
    // walks, and that is most of them. The cost is a composite chart with nothing on it, which the
    // Preview screen names so it does not read as a fault.
    const slugs = allAnswers().map((a) => a.slotSlug);

    expect(slugs.filter((s) => s.startsWith('reclaim_calendar_'))).toEqual([]);
    expect(slugs.filter((s) => s.startsWith('reclaim_composite_'))).toEqual([]);
  });

  it('presses nothing on the leader’s behalf at the close', () => {
    // The sharing choices are the thing an operator goes to phase 6 to look at. Answering them would
    // hand back a screen with the decision already made.
    expect(allAnswers().filter((a) => a.slotSlug.startsWith('reclaim_share_'))).toEqual([]);
  });

  it('writes an area the fixture has never heard of, rather than skipping it', async () => {
    /**
     * The state this guards is a future one, and it arrives quietly: somebody adds a tenth area to
     * `RECLAIM_BUCKETS` — a real product change, made in `content.ts` by whoever owns the areas — and
     * has no reason to know a preview fixture two directories away keys its hours by bucket token.
     *
     * What must not happen then is a preview run whose chart has a gap in it, because
     * `everyVisibleAreaHasHours` is what opens the chart reveal (I12) and one missing figure holds the
     * whole preview at "not yet". So the hours fall back to `0` — a figure, drawn as an empty bar,
     * which is exactly what a leader who has that area and spends no time on it would report — while
     * the *detail* is simply left unwritten, because prose invented for an area nobody has described
     * would be the fixture answering for a leader.
     *
     * Mocked at the module boundary and re-imported, so the assertion is about the fixture's
     * behaviour on a bucket list it does not control, which is the whole of the risk.
     */
    vi.resetModules();
    vi.doMock('@/lib/app/programme/content', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/app/programme/content')>();
      return {
        ...actual,
        RECLAIM_BUCKETS: [
          ...actual.RECLAIM_BUCKETS,
          { ...actual.RECLAIM_BUCKETS[0], slug: 'board-governance', conditional: false },
        ],
      };
    });

    try {
      const { previewAnswersForPhase: withNewArea } =
        await import('@/lib/app/programme/preview/answers');

      const phase1 = withNewArea(1);
      const phase3 = withNewArea(3);

      expect(phase1).toContainEqual({
        slotSlug: 'reclaim_current_hours__board_governance',
        value: '0',
        valueJson: 0,
      });
      expect(phase3).toContainEqual({
        slotSlug: 'reclaim_ideal_hours__board_governance',
        value: '0',
        valueJson: 0,
      });
      // No detail, and no empty string standing in for one — an unwritten slot is a box the leader
      // left blank, which is a state a real audit reaches; `value: ''` is not.
      expect(phase1.map((a) => a.slotSlug)).not.toContain(
        'reclaim_current_detail__board_governance'
      );
    } finally {
      vi.doUnmock('@/lib/app/programme/content');
      vi.resetModules();
    }
  });

  it('does not answer a question the audit would not have asked', () => {
    const slugs = slugsUpTo(6);

    // Only asked of a leader who said fundraising is relevant, and phase 0 says it is not.
    expect(slugs).not.toContain('reclaim_setup_fundraising_support');
    // Only asked once the leader says a protected block exists, and phase 1 says there is none.
    expect(slugs).toContain('reclaim_current_deep_block_blocker');
    expect(slugs).not.toContain('reclaim_current_deep_block_when');
  });
});
