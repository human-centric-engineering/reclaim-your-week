/**
 * The Phase 6 summary (F7 t-4). `readRunAnswers` mocked; `buildChartData` runs for real (pure).
 * Load-bearing: it maps the §10 fields + the current/ideal rows, and carries **no sensitive prose**
 * (so the same object is safe behind a public share token).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { readAnswersMock, findRunMock } = vi.hoisted(() => ({
  readAnswersMock: vi.fn(),
  findRunMock: vi.fn(),
}));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers: readAnswersMock }));
// F14: `buildSummary` now also reads the run row for the analyst's stored reading. It never
// *generates* one — that is `ensureAnalystReading`, and keeping it out of here is what stops the
// public share route and the PDF route from spending money.
vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimAuditRun: { findFirst: findRunMock } },
}));

import { buildSummary } from '@/lib/app/programme/summary';

const n = (v: number) => ({ value: String(v), valueJson: v });
const t = (v: string) => ({ value: v, valueJson: null });

beforeEach(() => {
  readAnswersMock.mockReset();
  findRunMock.mockReset();
  // The common case: a run with no analyst reading. Individual tests override.
  findRunMock.mockResolvedValue({ analystReading: null });
});

describe('buildSummary', () => {
  it('maps the §10 summary fields and current-vs-ideal rows', async () => {
    readAnswersMock.mockResolvedValue({
      reclaim_profile_first_name: t('Sam'),
      reclaim_profile_role: t('CEO'),
      reclaim_profile_org_type: t('Nonprofit'),
      reclaim_setup_audit_period: t('last quarter'),
      reclaim_setup_priorities: t('Grow the team'),
      reclaim_current_hours__deep_work: n(10),
      reclaim_ideal_hours__deep_work: n(14),
      reclaim_action_chosen: t('Protect two mornings a week'),
      reclaim_action_when: t('From Monday'),
    });
    const summary = await buildSummary('u1', 'run-1');

    expect(summary.firstName).toBe('Sam');
    expect(summary.role).toBe('CEO');
    expect(summary.period).toBe('last quarter');
    expect(summary.action.chosen).toBe('Protect two mornings a week');
    const deep = summary.rows.find((r) => r.token === 'deep_work');
    expect(deep).toMatchObject({ current: 10, ideal: 14 });
    expect(summary.footnote).toContain('Rashmir Balasubramaniam');
  });

  it('carries no sensitive prose — safe to serve behind a public token', async () => {
    readAnswersMock.mockResolvedValue({
      reclaim_profile_first_name: t('Sam'),
      reclaim_setup_keeping_me_up: t('SECRET-WORRY'),
      reclaim_gap_challenge_response: t('SECRET-CHALLENGE'),
      reclaim_current_hours__deep_work: n(5),
    });
    const summary = await buildSummary('u1', 'run-1');
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toContain('SECRET-WORRY');
    expect(serialised).not.toContain('SECRET-CHALLENGE');
  });

  it('leaves the ideal null for a bucket with no ideal captured', async () => {
    readAnswersMock.mockResolvedValue({ reclaim_current_hours__deep_work: n(8) });
    const summary = await buildSummary('u1', 'run-1');
    expect(summary.rows.find((r) => r.token === 'deep_work')?.ideal).toBeNull();
  });
});

/**
 * §10's last two items (F14).
 *
 * `buildSummary` reads the stored reading and **re-parses it on the way out**. That is not belt and
 * braces: the column holds JSON written by whichever deploy generated it, so a reading that would
 * not pass today's refusals must not reach a public share simply because it was written before they
 * existed.
 */
describe('buildSummary — the analyst reading', () => {
  const clean = {
    gaps: [
      {
        token: 'deep_work',
        observation: 'Deep work sits at five hours against the ten you wanted.',
      },
      { token: 'delivery_operations', observation: 'Delivery holds twenty hours of the week.' },
    ],
    pathway: [
      { horizon: 'now', step: 'A protected morning', difference: 'One block of thinking time.' },
      { horizon: 'next', step: 'Handing over a meeting', difference: 'Two hours back.' },
      { horizon: 'later', step: 'A standing review', difference: 'Less pulled into detail.' },
    ],
  };

  const answers = {
    reclaim_current_hours__deep_work: n(5),
    reclaim_current_hours__delivery_operations: n(20),
  };

  it('is null when the analyst has never run', async () => {
    readAnswersMock.mockResolvedValue(answers);
    findRunMock.mockResolvedValue({ analystReading: null });
    expect((await buildSummary('u1', 'run-1')).analyst).toBeNull();
  });

  it('carries a stored reading through', async () => {
    readAnswersMock.mockResolvedValue(answers);
    findRunMock.mockResolvedValue({ analystReading: clean });
    const summary = await buildSummary('u1', 'run-1');
    expect(summary.analyst?.gaps).toHaveLength(2);
    expect(summary.analyst?.pathway.map((s) => s.horizon)).toEqual(['now', 'next', 'later']);
  });

  it('drops a stored reading that today’s guards would refuse', async () => {
    readAnswersMock.mockResolvedValue(answers);
    findRunMock.mockResolvedValue({
      analystReading: {
        ...clean,
        gaps: [
          { token: 'deep_work', observation: 'You must stop chairing the delivery meeting.' },
          { token: 'delivery_operations', observation: 'Delivery holds twenty hours.' },
        ],
      },
    });
    expect((await buildSummary('u1', 'run-1')).analyst).toBeNull();
  });

  it('drops a reading naming a conditional area this leader was never asked about', async () => {
    // The real case, not a nonsense token. `buildChartData` omits `fundraising_capital` entirely
    // for a leader who said fundraising is not relevant, so the token set derived from this run's
    // chart does not contain it — and a reading that names it is talking about a question the audit
    // deliberately never put in front of them.
    readAnswersMock.mockResolvedValue({ reclaim_current_hours__deep_work: n(5) });
    findRunMock.mockResolvedValue({
      analystReading: {
        ...clean,
        gaps: [
          { token: 'deep_work', observation: 'Deep work sits at five hours.' },
          { token: 'fundraising_capital', observation: 'Fundraising takes none of the week.' },
        ],
      },
    });
    expect((await buildSummary('u1', 'run-1')).analyst).toBeNull();

    // ...and the same reading is fine for a leader for whom fundraising *is* relevant.
    readAnswersMock.mockResolvedValue({
      reclaim_current_hours__deep_work: n(5),
      reclaim_setup_fundraising_relevant: { value: 'Yes', valueJson: true },
      reclaim_current_hours__fundraising_capital: n(2),
    });
    expect((await buildSummary('u1', 'run-1')).analyst).not.toBeNull();
  });
});
