/**
 * The Phase 6 summary (F7 t-4). `readRunAnswers` mocked; `buildChartData` runs for real (pure).
 * Load-bearing: it maps the §10 fields + the current/ideal rows, and carries **no sensitive prose**
 * (so the same object is safe behind a public share token).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { readAnswersMock } = vi.hoisted(() => ({ readAnswersMock: vi.fn() }));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers: readAnswersMock }));

import { buildSummary } from '@/lib/app/programme/summary';

const n = (v: number) => ({ value: String(v), valueJson: v });
const t = (v: string) => ({ value: v, valueJson: null });

beforeEach(() => readAnswersMock.mockReset());

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
