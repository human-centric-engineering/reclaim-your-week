/**
 * I16 — the analyst reflects; it does not decide (F14).
 *
 * Two separate things are guarded here, and the first is the sharper.
 *
 * **The public-share hazard.** `buildSummary`'s header promises `AuditSummary` is shareable-safe *by
 * construction* — only the §10 fields, never the sensitive prose — and `/summary/[token]` serves that
 * object with **no session** to anyone holding the link. Once the analyst's prose joins it, the
 * promise stops being structural and starts depending on a model, because prose written from a brief
 * containing sensitive material can echo it. The defence is that the brief is an allowlist and the
 * allowlist is disjoint from every slot marked `sensitive`. That assertion ships in the same task as
 * the field it guards; one task later is a guard that was absent exactly as long as it mattered.
 *
 * **The advice-engine hazard.** I16 is prose, and prose is not a control. What actually holds is that
 * the schema has nowhere to put a verdict and the parser refuses whole rather than in part. Every
 * refusal below is written by constructing the output it is supposed to reject — the lesson from F12
 * t-2, where an I12 assertion passed for the wrong reason and would have survived the invariant being
 * deleted.
 *
 * Wired into `leaf:checks` via the `tests/unit/invariants` directory glob.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { ANALYST_BRIEF_SLUGS } from '@/lib/app/programme/analyst/brief';
import { parseAnalystReading } from '@/lib/app/programme/analyst/reading';

// The parser logs every refusal with its reason, which is the point of it in production and noise
// here. Silenced rather than asserted on: the return value is the contract.
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const TOKENS = new Set(['deep_work', 'strategic_planning', 'delivery_operations']);

/** A clean reading, which every refusal case below then breaks in exactly one way. */
function reading(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gaps: [
      {
        token: 'deep_work',
        observation: 'Deep work sits at four hours against the ten you wanted.',
      },
      { token: 'delivery_operations', observation: 'Delivery holds twenty hours of the week.' },
    ],
    pathway: [
      {
        horizon: 'now',
        step: 'A protected morning each week',
        difference: 'One block of thinking time.',
      },
      {
        horizon: 'next',
        step: 'Handing over one recurring meeting',
        difference: 'Two hours back.',
      },
      {
        horizon: 'later',
        step: 'A standing review with the team',
        difference: 'Less pulled into detail.',
      },
    ],
    ...over,
  };
}

describe('the analyst brief can never carry sensitive material to a public URL', () => {
  it('is disjoint from every slot marked sensitive', () => {
    const sensitive = new Set(
      reclaimSlotDefinitions.filter((s) => s.sensitivity === 'sensitive').map((s) => s.slug)
    );
    const leaked = ANALYST_BRIEF_SLUGS.filter((slug) => sensitive.has(slug));
    expect(
      leaked,
      'the analyst brief reads a sensitive slot, and its output is served with no session behind a public share token'
    ).toEqual([]);
  });

  it('names the specific things a reader would expect it to read and it must not', () => {
    // Each of these is genuinely useful to the analyst and each is sensitive, so their absence is a
    // decision rather than an oversight and must not be quietly reversed.
    for (const slug of [
      'reclaim_reflection_p6', // the takeaway
      'reclaim_ideal_protected_commitment',
      'reclaim_action_stopping',
      'reclaim_setup_keeping_me_up',
      'reclaim_calendar_reactive_time',
      'reclaim_gap_strategy_mirror',
    ]) {
      expect(ANALYST_BRIEF_SLUGS).not.toContain(slug);
    }
  });

  it('every slug it does read is a declared slot', () => {
    const declared = new Set(reclaimSlotDefinitions.map((s) => s.slug));
    for (const slug of ANALYST_BRIEF_SLUGS) {
      expect(declared.has(slug), `${slug} is in the brief and is not a declared slot`).toBe(true);
    }
  });
});

describe('the schema has nowhere to put a verdict', () => {
  it('declares no ranking field', () => {
    const source = readFileSync('lib/app/programme/analyst/reading.ts', 'utf8');
    // Read off the schema literal rather than the whole file, so the prose explaining why these are
    // absent does not satisfy the check that they are.
    const schema = source.slice(
      source.indexOf('const responseSchema'),
      source.indexOf('} as const;')
    );
    for (const field of ['recommendation', 'priority', 'score', 'severity', 'risk', 'rating']) {
      expect(schema, `the analyst schema can hold a ${field}`).not.toContain(field);
    }
  });

  it('closes the object, so a model cannot add one', () => {
    const source = readFileSync('lib/app/programme/analyst/reading.ts', 'utf8');
    const schema = source.slice(
      source.indexOf('const responseSchema'),
      source.indexOf('} as const;')
    );
    // Three objects: the root, a gap, a step.
    expect(schema.match(/additionalProperties: false/g)?.length).toBe(3);
  });
});

describe('parseAnalystReading refuses, and refuses whole', () => {
  it('accepts a clean reading', () => {
    const parsed = parseAnalystReading(reading(), TOKENS);
    expect(parsed).not.toBeNull();
    expect(parsed?.gaps).toHaveLength(2);
    expect(parsed?.pathway.map((s) => s.horizon)).toEqual(['now', 'next', 'later']);
  });

  it('orders the pathway even when the model does not', () => {
    const shuffled = reading({
      pathway: [
        { horizon: 'later', step: 'A standing review', difference: 'Less detail.' },
        { horizon: 'now', step: 'A protected morning', difference: 'Thinking time.' },
        { horizon: 'next', step: 'Handing over a meeting', difference: 'Two hours back.' },
      ],
    });
    expect(parseAnalystReading(shuffled, TOKENS)?.pathway.map((s) => s.horizon)).toEqual([
      'now',
      'next',
      'later',
    ]);
  });

  it.each([
    [
      'a gap anchored to an area the brief never supplied',
      reading({
        gaps: [
          { token: 'invented_area', observation: 'Something about an area nobody measured.' },
          { token: 'deep_work', observation: 'Deep work sits at four hours.' },
        ],
      }),
    ],
    [
      'a banned term',
      reading({
        gaps: [
          { token: 'deep_work', observation: 'There is room to optimise the week here.' },
          { token: 'delivery_operations', observation: 'Delivery holds twenty hours.' },
        ],
      }),
    ],
    [
      'an em dash',
      reading({
        gaps: [
          { token: 'deep_work', observation: 'Deep work is thin — four hours against ten.' },
          { token: 'delivery_operations', observation: 'Delivery holds twenty hours.' },
        ],
      }),
    ],
    [
      'a step written as an instruction',
      reading({
        pathway: [
          { horizon: 'now', step: 'You should protect a morning', difference: 'Thinking time.' },
          { horizon: 'next', step: 'Handing over a meeting', difference: 'Two hours back.' },
          { horizon: 'later', step: 'A standing review', difference: 'Less detail.' },
        ],
      }),
    ],
    [
      'a pathway that repeats a horizon instead of sequencing',
      reading({
        pathway: [
          { horizon: 'now', step: 'A protected morning', difference: 'Thinking time.' },
          { horizon: 'now', step: 'Handing over a meeting', difference: 'Two hours back.' },
          { horizon: 'now', step: 'A standing review', difference: 'Less detail.' },
        ],
      }),
    ],
    [
      'too few gaps to be a reading',
      reading({ gaps: [{ token: 'deep_work', observation: 'Thin.' }] }),
    ],
    [
      'a pathway of the wrong length',
      reading({
        pathway: [{ horizon: 'now', step: 'A protected morning', difference: 'Thinking time.' }],
      }),
    ],
    [
      'an over-length observation',
      reading({
        gaps: [
          { token: 'deep_work', observation: 'x'.repeat(400) },
          { token: 'delivery_operations', observation: 'Delivery holds twenty hours.' },
        ],
      }),
    ],
    ['not an object at all', 'the week looks busy'],
  ])('refuses %s', (_name, input) => {
    expect(parseAnalystReading(input, TOKENS)).toBeNull();
  });

  it('discards the whole reading rather than the offending part', () => {
    // The load-bearing case. A parser that dropped the bad gap and kept the good one would ship a
    // reading whose worst sentence had been quietly deleted, indistinguishable downstream from one
    // that never had a bad sentence at all.
    const oneBadGap = reading({
      gaps: [
        {
          token: 'deep_work',
          observation: 'Deep work sits at four hours against the ten you wanted.',
        },
        {
          token: 'delivery_operations',
          observation: 'You must stop chairing the delivery meeting.',
        },
      ],
    });
    expect(parseAnalystReading(oneBadGap, TOKENS)).toBeNull();
  });

  it('allows "could" phrasing that names the same action', () => {
    // The refusal is positional, not a ban on the verb: offering is the whole register of the
    // feature, and a guard that rejected "you could stop chairing that" would refuse the good case.
    const offered = reading({
      pathway: [
        {
          horizon: 'now',
          step: 'You could stop chairing the delivery meeting',
          difference: 'Two hours back.',
        },
        { horizon: 'next', step: 'Handing over a meeting', difference: 'Two hours back.' },
        { horizon: 'later', step: 'A standing review', difference: 'Less detail.' },
      ],
    });
    expect(parseAnalystReading(offered, TOKENS)).not.toBeNull();
  });
});

describe('I12 — the analyst never reaches the conversation', () => {
  it('is not imported by the coach phase context', () => {
    const context = readFileSync('lib/app/programme/coach/phase-context.ts', 'utf8');
    expect(
      context,
      'the analyst reading is in the coach briefing, so its reading could arrive beside a chart the leader has not asked to see'
    ).not.toContain('analyst/');
  });
});
