'use client';

/**
 * Phase 0 — the setup form (F6 t-1). Opens with the §4a process outline **verbatim** (I11), then the
 * ten context questions as a short warm form (not ten chat turns). Before advancing it **reflects the
 * captured context back** for confirmation (§4, the source's own instruction). The audit-period field
 * carries the **atypical-week reassurance** (§12a). Hours accept approximations and say so (I17). On
 * confirm it batch-saves every answered slot (I3) and advances to Phase 1 (Phase 0 has no reflection
 * gate, so the transition passes).
 */

import { useState } from 'react';
import { RECLAIM_PROCESS_OUTLINE } from '@/lib/app/programme/content';
import { saveBatch, advancePhase, type AnswerInput } from '@/components/app/reclaim/phase/actions';
import {
  TextField,
  TextAreaField,
  NumberField,
  SelectField,
  BooleanField,
} from '@/components/app/reclaim/phase/fields';

interface SetupState {
  firstName: string;
  role: string;
  orgType: string;
  directReports: string;
  distributedTeam: boolean | null;
  distributedImpact: string;
  inTransition: boolean | null;
  transitionDetail: string;
  fundraisingRelevant: boolean | null;
  fundraisingSupport: string;
  weeklyHours: string;
  priorities: string;
  keepingMeUp: string;
  whyNow: string;
  auditPeriod: string;
}

const EMPTY: SetupState = {
  firstName: '',
  role: '',
  orgType: '',
  directReports: '',
  distributedTeam: null,
  distributedImpact: '',
  inTransition: null,
  transitionDetail: '',
  fundraisingRelevant: null,
  fundraisingSupport: '',
  weeklyHours: '',
  priorities: '',
  keepingMeUp: '',
  whyNow: '',
  auditPeriod: 'last quarter',
};

const ROLES = ['CEO', 'Founder', 'Programme Officer', 'Philanthropist', 'Director', 'Other'];
const ORG_TYPES = ['Nonprofit', 'Startup', 'Established business', 'Other'];
const PERIODS = ['last week', 'last month', 'last quarter', 'last year'];

/** Build the batch answers from the filled fields — optional/empty fields are skipped. */
function toAnswers(s: SetupState): AnswerInput[] {
  const out: AnswerInput[] = [];
  const text = (slug: string, v: string) => {
    if (v.trim()) out.push({ slotSlug: slug, value: v.trim() });
  };
  const num = (slug: string, v: string) => {
    const n = Number(v);
    if (v.trim() && Number.isFinite(n)) out.push({ slotSlug: slug, value: v.trim(), valueJson: n });
  };
  const flag = (slug: string, v: boolean | null) => {
    if (v !== null) out.push({ slotSlug: slug, value: v ? 'Yes' : 'No', valueJson: v });
  };

  text('reclaim_profile_first_name', s.firstName);
  text('reclaim_profile_role', s.role);
  text('reclaim_profile_org_type', s.orgType);
  num('reclaim_profile_direct_reports', s.directReports);
  flag('reclaim_profile_distributed_team', s.distributedTeam);
  if (s.distributedTeam) text('reclaim_profile_distributed_impact', s.distributedImpact);

  flag('reclaim_setup_in_transition', s.inTransition);
  if (s.inTransition) text('reclaim_setup_transition_detail', s.transitionDetail);
  flag('reclaim_setup_fundraising_relevant', s.fundraisingRelevant);
  if (s.fundraisingRelevant) text('reclaim_setup_fundraising_support', s.fundraisingSupport);
  num('reclaim_setup_weekly_hours', s.weeklyHours);
  text('reclaim_setup_priorities', s.priorities);
  text('reclaim_setup_keeping_me_up', s.keepingMeUp);
  text('reclaim_setup_why_now', s.whyNow);
  text('reclaim_setup_audit_period', s.auditPeriod);
  return out;
}

export function SetupPanel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [s, setS] = useState<SetupState>(EMPTY);
  const [stage, setStage] = useState<'form' | 'review'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SetupState>(k: K, v: SetupState[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  const canReview = s.firstName.trim().length > 0 && s.weeklyHours.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveBatch(runId, toAnswers(s));
      const advanced = await advancePhase(runId, 'phase-0-setup');
      if (!advanced.ok) throw new Error(advanced.message ?? 'We could not move on just now.');
      onAdvanced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (stage === 'review') {
    return (
      <div className="space-y-6">
        <h2 className="text-foreground text-xl font-light">
          Before we begin, does this look right?
        </h2>
        <p className="text-muted-foreground text-sm">
          A quick check of what you told me. You can go back and change anything.
        </p>
        <dl className="divide-border/60 divide-y text-sm">
          {toAnswers(s).map((a) => (
            <div key={a.slotSlug} className="grid grid-cols-[10rem_1fr] gap-4 py-2">
              <dt className="text-muted-foreground">{LABELS[a.slotSlug] ?? a.slotSlug}</dt>
              <dd className="text-foreground">{a.value}</dd>
            </div>
          ))}
        </dl>
        {error && (
          <p className="text-muted-foreground text-sm" role="status">
            {error} You can try again.
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStage('form')}
            className="border-border text-muted-foreground hover:text-foreground rounded-full border px-6 py-2.5 text-sm"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="bg-primary text-primary-foreground rounded-full px-7 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Yes, continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
        {RECLAIM_PROCESS_OUTLINE}
      </p>

      <div className="border-border/70 space-y-6 border-t pt-8">
        <TextField
          id="first-name"
          label="Your first name"
          value={s.firstName}
          onChange={(v) => set('firstName', v)}
          help="First name only — we do not collect your last name."
        />
        <SelectField
          id="role"
          label="Your role"
          value={s.role}
          onChange={(v) => set('role', v)}
          options={ROLES.map((r) => ({ value: r, label: r }))}
        />
        <SelectField
          id="org-type"
          label="Type of organisation"
          value={s.orgType}
          onChange={(v) => set('orgType', v)}
          options={ORG_TYPES.map((o) => ({ value: o, label: o }))}
        />
        <NumberField
          id="reports"
          label="Number of direct reports"
          value={s.directReports}
          onChange={(v) => set('directReports', v)}
        />
        <BooleanField
          label="Is your team spread across locations, timezones, or countries?"
          value={s.distributedTeam}
          onChange={(v) => set('distributedTeam', v)}
        />
        {s.distributedTeam && (
          <TextAreaField
            id="distributed-impact"
            label="How does that affect the way you lead and communicate?"
            value={s.distributedImpact}
            onChange={(v) => set('distributedImpact', v)}
            rows={2}
          />
        )}
        <BooleanField
          label="Are you going through a period of significant change or transition?"
          value={s.inTransition}
          onChange={(v) => set('inTransition', v)}
          help="A restructure, leadership change, strategic pivot, or period of rapid growth."
        />
        {s.inTransition && (
          <TextAreaField
            id="transition-detail"
            label="What is the transition?"
            value={s.transitionDetail}
            onChange={(v) => set('transitionDetail', v)}
            rows={2}
          />
        )}
        <BooleanField
          label="Is fundraising or capital raising a significant part of your role?"
          value={s.fundraisingRelevant}
          onChange={(v) => set('fundraisingRelevant', v)}
          help="This decides whether the fundraising area appears in your audit."
        />
        {s.fundraisingRelevant && (
          <SelectField
            id="fundraising-support"
            label="Do you have a development team, or are you leading it yourself?"
            value={s.fundraisingSupport}
            onChange={(v) => set('fundraisingSupport', v)}
            options={[
              { value: 'I have a development team', label: 'I have a development team' },
              { value: 'I am leading it myself', label: 'I am leading it myself' },
            ]}
          />
        )}
        <NumberField
          id="weekly-hours"
          label="Your current average weekly hours"
          value={s.weeklyHours}
          onChange={(v) => set('weeklyHours', v)}
          help="A rough figure is fine — this is about the shape of your week, not a precise total."
        />
        <TextAreaField
          id="priorities"
          label="Your top three to five priorities for the rest of this year"
          value={s.priorities}
          onChange={(v) => set('priorities', v)}
        />
        <TextAreaField
          id="keeping-me-up"
          label="What is your biggest current challenge — what is keeping you up at night?"
          value={s.keepingMeUp}
          onChange={(v) => set('keepingMeUp', v)}
        />
        <TextAreaField
          id="why-now"
          label="What made you want to do this now?"
          value={s.whyNow}
          onChange={(v) => set('whyNow', v)}
          rows={2}
        />
        <SelectField
          id="audit-period"
          label="Which period would you like to audit?"
          value={s.auditPeriod}
          onChange={(v) => set('auditPeriod', v)}
          options={PERIODS.map((p) => ({ value: p, label: p }))}
          help="The last quarter is a good default — recent enough to recall, long enough to show patterns. It's completely fine to do this during an atypical week; it is better to know."
        />
      </div>

      <button
        type="button"
        onClick={() => setStage('review')}
        disabled={!canReview}
        className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium disabled:opacity-40"
      >
        Review and continue
      </button>
    </div>
  );
}

const LABELS: Record<string, string> = {
  reclaim_profile_first_name: 'First name',
  reclaim_profile_role: 'Role',
  reclaim_profile_org_type: 'Organisation',
  reclaim_profile_direct_reports: 'Direct reports',
  reclaim_profile_distributed_team: 'Distributed team',
  reclaim_profile_distributed_impact: 'Distribution impact',
  reclaim_setup_in_transition: 'In transition',
  reclaim_setup_transition_detail: 'Transition',
  reclaim_setup_fundraising_relevant: 'Fundraising',
  reclaim_setup_fundraising_support: 'Fundraising support',
  reclaim_setup_weekly_hours: 'Weekly hours',
  reclaim_setup_priorities: 'Priorities',
  reclaim_setup_keeping_me_up: 'Keeping you up',
  reclaim_setup_why_now: 'Why now',
  reclaim_setup_audit_period: 'Audit period',
};
