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
import { execFileSync } from 'node:child_process';

import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { REPORT_BRIEF_SLUGS } from '@/lib/app/programme/report/brief';
import { parseReportReading } from '@/lib/app/programme/report/reading';
import { REPORT_IMPERATIVE_OPENERS, reclaimReportAgent } from '@/lib/app/programme/report/agent';
import { CHAPTER_ORDER, CHAPTER_TITLES } from '@/lib/app/programme/report/chapters';
import { auditSummarySchema } from '@/components/app/reclaim/summary/types';

// The parser logs every refusal with its reason, which is the point of it in production and noise
// here. Silenced rather than asserted on: the return value is the contract.
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const TOKENS = new Set(['deep_work', 'strategic_planning', 'delivery_operations']);

/** A clean reading, which every refusal case below then breaks in exactly one way. */
function reading(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chapters: [
      {
        section: 'why_now',
        paragraphs: ['You said the bid was what kept you up, and the week has no room for one.'],
      },
      { section: 'the_week', paragraphs: ['Twenty two hours of it belongs to delivery.'] },
      { section: 'what_you_take', paragraphs: ['You said you were taking away a decision.'] },
    ],
    closing: 'You have looked at this honestly, and that is the part nobody else can do.',
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

/**
 * The guard that replaced disjointness.
 *
 * This file used to assert `REPORT_BRIEF_SLUGS` was disjoint from every slot marked `sensitive`,
 * because the analyst's prose joined an object served from `/summary/:token` with **no session** to
 * anyone holding an unrevokable link. The brief has widened to the whole audit and that assertion is
 * gone with the surface that justified it.
 *
 * What must not go with it is the property underneath: **nothing serves this without a session.**
 * Asserted directly, over the filesystem, because it is a claim about every route rather than about
 * one module — and because the failure it prevents (someone adding a convenient public read of the
 * report later) looks perfectly reasonable in the diff that introduces it.
 */
describe('the report is never served without a session', () => {
  /** Every route file that reaches `buildSummary`, however it imports it. */
  function routesReachingSummary(): string[] {
    const found = execFileSync('grep', ['-rl', '--include=route.ts', 'buildSummary', 'app/api'], {
      encoding: 'utf8',
    }).trim();
    return found.length === 0 ? [] : found.split('\n');
  }

  it('puts every route that builds a summary behind an auth guard', () => {
    const routes = routesReachingSummary();
    // If this is ever zero the assertion below is vacuous, which is exactly how an invariant test
    // survives the deletion of the thing it guards.
    expect(
      routes.length,
      'no route builds a summary, so this guard proves nothing'
    ).toBeGreaterThan(0);
    for (const file of routes) {
      const source = readFileSync(file, 'utf8');
      expect(
        /withAuth|withAdminAuth/.test(source),
        `${file} builds a summary and is not behind withAuth`
      ).toBe(true);
    }
  });

  it('renders the report from no public page', () => {
    const publicPages = execFileSync(
      'bash',
      ['-c', "grep -rl 'SummaryView\\|buildSummary' 'app/(public)' 2>/dev/null || true"],
      { encoding: 'utf8' }
    ).trim();
    expect(publicPages, 'a public page renders the report').toBe('');
  });

  it('is now allowed the audit it was blindfolded to, and reads it', () => {
    // The other half of the same change: the widening is the point, so a silent revert to the old
    // allowlist should fail here rather than quietly produce the thin report again.
    for (const slug of [
      'reclaim_reflection_p6', // the takeaway, which the whole method rests on
      'reclaim_setup_keeping_me_up',
      'reclaim_gap_summary',
      'reclaim_action_stopping',
    ]) {
      expect(REPORT_BRIEF_SLUGS).toContain(slug);
    }
  });

  it('still leaves out the things that are not report material', () => {
    // Consent about the artifact is not material for the artifact, and a model given a name will
    // eventually use it in a sentence that reads as a form letter.
    for (const slug of [
      'reclaim_share_with_coach',
      'reclaim_share_quotable',
      'reclaim_share_takeaway',
      'reclaim_profile_first_name',
    ]) {
      expect(REPORT_BRIEF_SLUGS).not.toContain(slug);
    }
  });

  it('every slug it does read is a declared slot', () => {
    const declared = new Set(reclaimSlotDefinitions.map((s) => s.slug));
    for (const slug of REPORT_BRIEF_SLUGS) {
      expect(declared.has(slug), `${slug} is in the brief and is not a declared slot`).toBe(true);
    }
  });
});

describe('the schema has nowhere to put a verdict', () => {
  it('declares no ranking field', () => {
    const source = readFileSync('lib/app/programme/report/reading.ts', 'utf8');
    // Read off the schema literal rather than the whole file, so the prose explaining why these are
    // absent does not satisfy the check that they are.
    const schema = source.slice(
      source.indexOf('const responseSchema'),
      source.indexOf('} as const;')
    );
    for (const field of ['recommendation', 'priority', 'score', 'severity', 'risk', 'rating']) {
      expect(schema, `the report schema can hold a ${field}`).not.toContain(field);
    }
  });

  it('closes the object, so a model cannot add one', () => {
    const source = readFileSync('lib/app/programme/report/reading.ts', 'utf8');
    const schema = source.slice(
      source.indexOf('const responseSchema'),
      source.indexOf('} as const;')
    );
    // Four objects: the root, a chapter, a gap, a step. Counted rather than spot-checked, so adding
    // a fifth without closing it fails here rather than shipping the one open door.
    expect(schema.match(/additionalProperties: false/g)?.length).toBe(4);
  });
});

describe('parseReportReading refuses, and refuses whole', () => {
  it('accepts a clean reading', () => {
    const parsed = parseReportReading(reading(), TOKENS);
    expect(parsed).not.toBeNull();
    expect(parsed?.gaps).toHaveLength(2);
    expect(parsed?.pathway.map((s) => s.horizon)).toEqual(['now', 'next', 'later']);
  });

  it('tolerates a missing closing, and tolerates it again once storage has turned that into null', () => {
    const { closing: _closing, ...withoutClosing } = reading();
    const first = parseReportReading(withoutClosing, TOKENS);
    expect(first).not.toBeNull();
    expect(first?.closing).toBeNull();

    // `ensureReportReading` stores the parsed reading as JSON, which turns an omitted key into a
    // present `null` on the way back out. The parser must accept its own output, or a reading with
    // no closing line is refused in full — chapters, gaps and pathway included — on every read after
    // the first, silently and with nothing but a log line to say why.
    const roundTripped = JSON.parse(JSON.stringify(first));
    expect(parseReportReading(roundTripped, TOKENS)).not.toBeNull();
    expect(parseReportReading(roundTripped, TOKENS)?.closing).toBeNull();
  });

  it('orders the pathway even when the model does not', () => {
    const shuffled = reading({
      pathway: [
        { horizon: 'later', step: 'A standing review', difference: 'Less detail.' },
        { horizon: 'now', step: 'A protected morning', difference: 'Thinking time.' },
        { horizon: 'next', step: 'Handing over a meeting', difference: 'Two hours back.' },
      ],
    });
    expect(parseReportReading(shuffled, TOKENS)?.pathway.map((s) => s.horizon)).toEqual([
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
      // Both render surfaces (`summary-view.tsx`, `summary-pdf-document.tsx`) key their gap list on
      // the token, the same reason a repeated horizon is refused above — one area, one gap.
      'a gap that names the same area twice',
      reading({
        gaps: [
          { token: 'deep_work', observation: 'Deep work sits at four hours.' },
          { token: 'deep_work', observation: 'A second thing, still about deep work.' },
        ],
      }),
    ],
    [
      'a pathway longer than its three horizons',
      reading({
        pathway: [
          { horizon: 'now', step: 'A protected morning', difference: 'Thinking time.' },
          { horizon: 'next', step: 'One meeting handed over', difference: 'Two hours back.' },
          { horizon: 'later', step: 'A standing review', difference: 'The drift gets noticed.' },
          { horizon: 'now', step: 'A fourth', difference: 'There is no fourth horizon.' },
        ],
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
    expect(parseReportReading(input, TOKENS)).toBeNull();
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
    expect(parseReportReading(oneBadGap, TOKENS)).toBeNull();
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
    expect(parseReportReading(offered, TOKENS)).not.toBeNull();
  });
});

describe('the model is told exactly what the parser will refuse', () => {
  /**
   * Found by the first live run of `smoke:reclaim-analyst`, and it is the reason that smoke exists.
   *
   * The parser refused ten imperative openers; the guardrails prose named five. gpt-4o opened a step
   * with "Begin ", which it had never been told not to do, and the whole reading was discarded. In
   * production that failure is **silent** — `null` renders as two absent sections and nothing
   * anywhere says why — so it would have shipped as "the analyst never produces anything".
   *
   * The fix was one shared list. This is the guard that keeps it one.
   */
  it('names every refused opener in the guardrails the model actually receives', () => {
    const guardrails = reclaimReportAgent.guardrails.toLowerCase();
    for (const opener of REPORT_IMPERATIVE_OPENERS) {
      expect(
        guardrails.includes(opener.trim()),
        `the parser refuses "${opener.trim()}" and the prose never mentions it, so the model will be refused for a rule it was not given`
      ).toBe(true);
    }
  });

  it('refuses every opener it names', () => {
    // The other direction, so the prose cannot list a rule the parser does not hold either.
    for (const opener of REPORT_IMPERATIVE_OPENERS) {
      const withOpener = reading({
        pathway: [
          { horizon: 'now', step: `${opener}protect a morning`, difference: 'Thinking time.' },
          { horizon: 'next', step: 'Handing over a meeting', difference: 'Two hours back.' },
          { horizon: 'later', step: 'A standing review', difference: 'Less detail.' },
        ],
      });
      expect(parseReportReading(withOpener, TOKENS), `"${opener}" was allowed`).toBeNull();
    }
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

/**
 * The arc, and the two things about it the product owns rather than the model.
 *
 * A model that could name its own sections would eventually write "Areas for improvement". One that
 * could order them would build to a finding. Both are the advice engine I16 exists to prevent, and
 * neither is stopped by asking nicely, so both are stopped here.
 */
describe('the arc is the product’s, not the model’s', () => {
  it('puts the chapters in the canonical order however they arrive', () => {
    const parsed = parseReportReading(
      reading({
        chapters: [
          { section: 'what_you_take', paragraphs: ['Last, as written.'] },
          { section: 'why_now', paragraphs: ['First, as written.'] },
          { section: 'the_week', paragraphs: ['Second, as written.'] },
        ],
      }),
      TOKENS
    );
    expect(parsed?.chapters.map((c) => c.section)).toEqual([
      'why_now',
      'the_week',
      'what_you_take',
    ]);
  });

  it('refuses a chapter it has no name for', () => {
    expect(
      parseReportReading(
        reading({
          chapters: [
            { section: 'areas_for_improvement', paragraphs: ['A verdict in a heading.'] },
            { section: 'why_now', paragraphs: ['Fine.'] },
            { section: 'the_week', paragraphs: ['Fine.'] },
          ],
        }),
        TOKENS
      )
    ).toBeNull();
  });

  it('refuses the same chapter twice', () => {
    expect(
      parseReportReading(
        reading({
          chapters: [
            { section: 'why_now', paragraphs: ['Once.'] },
            { section: 'why_now', paragraphs: ['And again.'] },
            { section: 'the_week', paragraphs: ['Fine.'] },
          ],
        }),
        TOKENS
      )
    ).toBeNull();
  });

  it('keeps a short arc rather than discarding the report', () => {
    // **The bug this replaces, found on the first live run.** The parser inherited "fewer than two
    // gaps is not a reading" from the analyst, where the gaps *were* the reading. Once the chapters
    // became the report, that rule discarded seven good chapters over a supporting list, and the
    // leader got a chart and no reading at all. Content violations are fatal; running short is not.
    const parsed = parseReportReading(
      reading({ chapters: [{ section: 'why_now', paragraphs: ['Alone, and true.'] }] }),
      TOKENS
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.chapters).toHaveLength(1);
  });

  it('keeps a reading with one gap, and one with none', () => {
    const one = parseReportReading(
      reading({ gaps: [{ token: 'deep_work', observation: 'Deep work sits at four hours.' }] }),
      TOKENS
    );
    expect(one?.gaps).toHaveLength(1);
    expect(parseReportReading(reading({ gaps: [] }), TOKENS)?.gaps).toEqual([]);
  });

  it('keeps a short pathway rather than discarding the report', () => {
    const parsed = parseReportReading(
      reading({
        pathway: [{ horizon: 'now', step: 'A protected morning', difference: 'Thinking time.' }],
      }),
      TOKENS
    );
    expect(parsed?.pathway).toHaveLength(1);
  });

  it('trims an over-long gap list instead of throwing the report away', () => {
    // A real week has a difference in most of nine areas, so a model naming one gap per area returns
    // five or six as a matter of course. Refusing over that is the same mistake as refusing a short
    // list, made in the opposite direction: every gap kept is clean, and the model is asked to put
    // the most significant first so the cut falls at the least interesting end.
    // One gap per area, all distinct, as a real week produces. A wider token set than this suite's
    // usual three, because the point is that nine areas make five gaps ordinary.
    const wide = new Set([...TOKENS, 'team_development', 'recovery_white_space']);
    const parsed = parseReportReading(
      reading({
        gaps: [
          { token: 'deep_work', observation: 'One.' },
          { token: 'delivery_operations', observation: 'Two.' },
          { token: 'strategic_planning', observation: 'Three.' },
          { token: 'team_development', observation: 'Four.' },
          { token: 'recovery_white_space', observation: 'Five, the one that gets cut.' },
        ],
      }),
      wide
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.gaps).toHaveLength(4);
  });

  it('refuses the whole reading for one dirty paragraph', () => {
    // Whole-or-nothing. Dropping the offending paragraph would ship a report that passed the guard
    // with its worst sentence quietly deleted, indistinguishable downstream from a clean one.
    expect(
      parseReportReading(
        reading({
          chapters: [
            { section: 'why_now', paragraphs: ['You should protect two mornings.'] },
            { section: 'the_week', paragraphs: ['Fine.'] },
            { section: 'what_you_take', paragraphs: ['Fine.'] },
          ],
        }),
        TOKENS
      )
    ).toBeNull();
  });

  it('carries the analytic chapter, and puts it after the distance it is a reading of', () => {
    // `what_holds_it` is the chapter the report exists for and the one most easily lost: it is the
    // only section that is a reading rather than a retelling, and a future edit trimming the arc back
    // to "the order the audit happened in" would take it first. Its **position** is asserted with it,
    // because a reading of the distance printed before the distance is a finding announced ahead of
    // its evidence, which is I12 applied to a page.
    const parsed = parseReportReading(
      reading({
        chapters: [
          { section: 'what_you_chose', paragraphs: ['They chose one thing.'] },
          { section: 'what_holds_it', paragraphs: ['The escalations arrive here by default.'] },
          { section: 'the_distance', paragraphs: ['Fourteen hours sit between the two weeks.'] },
        ],
      }),
      TOKENS
    );
    expect(parsed?.chapters.map((c) => c.section)).toEqual([
      'the_distance',
      'what_holds_it',
      'what_you_chose',
    ]);
  });

  it('gives every chapter a heading, so none can render as a blank rule', () => {
    // `CHAPTER_ORDER` and `CHAPTER_TITLES` are two literals in one file and both render surfaces key
    // the second off the first. A chapter added to the order alone type-checks nowhere near the
    // screen and reaches a leader as an empty heading above real paragraphs.
    for (const section of CHAPTER_ORDER) {
      expect(CHAPTER_TITLES[section]?.trim().length, `${section} has no heading`).toBeGreaterThan(
        0
      );
    }
    expect(Object.keys(CHAPTER_TITLES).sort()).toEqual([...CHAPTER_ORDER].sort());
  });

  it('lets the client accept every chapter the server can send', () => {
    // `auditSummarySchema` (`components/app/reclaim/summary/types.ts`) carries its own copy of the
    // chapter-section enum, because it is client-safe and this module is not (it imports Prisma and
    // the provider manager). A chapter added here alone type-checks fine and reaches the client as an
    // unrecognised enum value — which `parseEnvelope` treats as a total parse failure, not a missing
    // chapter, so one new section blanks the whole report screen for every reading that includes it.
    for (const section of CHAPTER_ORDER) {
      const result = auditSummarySchema.shape.report.safeParse({
        chapters: [{ section, paragraphs: ['x'] }],
        gaps: [],
        pathway: [],
        closing: null,
      });
      expect(result.success, `client schema rejects "${section}"`).toBe(true);
    }
  });

  it('leaves room for the reading it now asks for', () => {
    // **The caps and the instructions have to move together, and this is the guard that says so.**
    // An over-length field discards the whole reading, so asking for a six-sentence paragraph and
    // two-sentence gaps against caps sized for a caption is asking for a refusal and getting one,
    // with the leader left holding a chart. Asserted at the boundary rather than by reading the
    // constants, so it fails on the behaviour rather than on the number.
    const sentence =
      'The week has held this shape for a while, and the figures above say so more plainly than any of it felt at the time. ';
    const deep = sentence.repeat(6).trim(); // six sentences, the length the brand voice now asks for
    expect(deep.length).toBeGreaterThan(700);

    const parsed = parseReportReading(
      reading({
        chapters: [
          { section: 'why_now', paragraphs: [deep, deep, deep, deep] },
          { section: 'the_week', paragraphs: ['Fine.'] },
          { section: 'what_you_take', paragraphs: ['Fine.'] },
        ],
        gaps: [
          {
            token: 'deep_work',
            observation:
              'Deep work sits at four hours against the ten you described wanting. That is six hours of thinking time that currently has nowhere to go, and the areas above it in this week are the ones deciding where it went.',
          },
        ],
      }),
      TOKENS
    );
    expect(parsed?.chapters[0].paragraphs).toHaveLength(4);
    expect(parsed?.gaps).toHaveLength(1);
  });

  it('still refuses a fifth paragraph, because generous is not absent', () => {
    expect(
      parseReportReading(
        reading({
          chapters: [
            { section: 'why_now', paragraphs: ['One.', 'Two.', 'Three.', 'Four.', 'Five.'] },
            { section: 'the_week', paragraphs: ['Fine.'] },
            { section: 'what_you_take', paragraphs: ['Fine.'] },
          ],
        }),
        TOKENS
      )
    ).toBeNull();
  });

  it('keeps a reading stored before the arc existed', () => {
    // Every audit finished before chapters existed has gaps and a pathway and nothing else. Refusing
    // those would delete the analysis from a leader's finished report to punish it for a field it
    // could not have had.
    const { chapters: _chapters, closing: _closing, ...old } = reading();
    const parsed = parseReportReading(old, TOKENS);
    expect(parsed).not.toBeNull();
    expect(parsed?.chapters).toEqual([]);
    expect(parsed?.closing).toBeNull();
    expect(parsed?.gaps).toHaveLength(2);
  });
});
