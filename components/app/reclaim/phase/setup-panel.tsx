'use client';

/**
 * Phase 0 — the setup form (F6 t-1). Opens with the §4a process outline **verbatim** (I11), then the
 * ten context questions as a short warm form (not ten chat turns). Before advancing it **reflects the
 * captured context back** for confirmation (§4, the source's own instruction). The audit-period field
 * carries the **atypical-week reassurance** (§12a). Hours accept approximations and say so (I17). On
 * confirm it batch-saves every answered slot (I3) and advances to Phase 1 (Phase 0 has no reflection
 * gate, so the transition passes).
 */

import { useEffect, useState } from 'react';
import { parseHours, isHours } from '@/components/app/reclaim/phase/hours';
import { saveBatch, advancePhase, type AnswerInput } from '@/components/app/reclaim/phase/actions';
import { readShortcut } from '@/components/app/reclaim/repeat/actions';
import {
  RECLAIM_ROLES,
  RECLAIM_ORG_TYPES,
  RECLAIM_AUDIT_PERIODS,
} from '@/lib/app/programme/coach/slot-choices';
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

/**
 * F9 t-2 — map a previous audit's answers onto the form (§4's recent-audit shortcut).
 *
 * **Pre-fill, never carry forward.** The fields arrive filled and fully editable; confirming still
 * writes every value again through `saveAnswer` under the NEW run's id (I3), which is what keeps each
 * audit its own picture. Copying values at the database level would make the previous audit mutate
 * when this one confirms something.
 */
function prefillFrom(answers: Record<string, string>): Partial<SetupState> {
  const flag = (v: string | undefined): boolean | null =>
    v === undefined ? null : /^(yes|true)$/i.test(v.trim());

  return {
    ...(answers['reclaim_profile_first_name'] !== undefined && {
      firstName: answers['reclaim_profile_first_name'],
    }),
    ...(answers['reclaim_profile_role'] !== undefined && {
      role: answers['reclaim_profile_role'],
    }),
    ...(answers['reclaim_profile_org_type'] !== undefined && {
      orgType: answers['reclaim_profile_org_type'],
    }),
    ...(answers['reclaim_profile_direct_reports'] !== undefined && {
      directReports: answers['reclaim_profile_direct_reports'],
    }),
    ...(answers['reclaim_profile_distributed_team'] !== undefined && {
      distributedTeam: flag(answers['reclaim_profile_distributed_team']),
    }),
    ...(answers['reclaim_setup_in_transition'] !== undefined && {
      inTransition: flag(answers['reclaim_setup_in_transition']),
    }),
    ...(answers['reclaim_setup_fundraising_relevant'] !== undefined && {
      fundraisingRelevant: flag(answers['reclaim_setup_fundraising_relevant']),
    }),
    ...(answers['reclaim_setup_weekly_hours'] !== undefined && {
      weeklyHours: answers['reclaim_setup_weekly_hours'],
    }),
    ...(answers['reclaim_setup_priorities'] !== undefined && {
      priorities: answers['reclaim_setup_priorities'],
    }),
    // The conditional detail beneath each flag, so a revealed textarea is not left empty under copy
    // promising everything is filled in.
    ...(answers['reclaim_profile_distributed_impact'] !== undefined && {
      distributedImpact: answers['reclaim_profile_distributed_impact'],
    }),
    ...(answers['reclaim_setup_transition_detail'] !== undefined && {
      transitionDetail: answers['reclaim_setup_transition_detail'],
    }),
    ...(answers['reclaim_setup_fundraising_support'] !== undefined && {
      fundraisingSupport: answers['reclaim_setup_fundraising_support'],
    }),
    // Deliberately NOT carried: `keepingMeUp` and `whyNow`. They are the two `sensitive` prose slots,
    // they are the most likely things to have changed since last time, and F7's refer-back returns
    // them verbatim later in this audit — pre-filling them would put last quarter's worry in this
    // quarter's mouth.
  };
}

// The three option sets this panel draws, read from the slot they belong to rather than held here.
// They used to be three local arrays, which was fine while the form was the only way to answer: the
// conversation asks the same questions and now offers the same answers, and two copies of "last
// week, last month, last quarter, last year" is the arrangement in which one of them eventually says
// something the other does not. See `coach/slot-choices.ts`.
const ROLES = RECLAIM_ROLES;
const ORG_TYPES = RECLAIM_ORG_TYPES;
const PERIODS = RECLAIM_AUDIT_PERIODS;

/** Build the batch answers from the filled fields — optional/empty fields are skipped. */
function toAnswers(s: SetupState): AnswerInput[] {
  const out: AnswerInput[] = [];
  const text = (slug: string, v: string) => {
    if (v.trim()) out.push({ slotSlug: slug, value: v.trim() });
  };
  const num = (slug: string, v: string) => {
    // Counts/hours are non-negative — a stray "-" never reaches a slot.
    if (isHours(v)) out.push({ slotSlug: slug, value: v.trim(), valueJson: parseHours(v) });
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
  /** F9 t-2: §4's confirm line, filled with their own context, when the last audit was recent. */
  const [confirmLine, setConfirmLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SetupState>(k: K, v: SetupState[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  // F9 t-2. Best-effort and silent: if this fails, Phase 0 simply asks in full, which is the
  // behaviour every leader had before the shortcut existed.
  useEffect(() => {
    let cancelled = false;
    void readShortcut()
      .catch(() => null)
      .then((shortcut) => {
        if (cancelled || shortcut === null || shortcut.previous === null) return;
        const prefill = prefillFrom(shortcut.answers);
        // Fill only what the leader has not already touched. The fetch resolves after the form is
        // interactive, so on a slow connection someone can be typing their name while it lands —
        // spreading last quarter's answers over the top would silently replace what they just wrote.
        setS((p) => {
          const next = { ...p };
          for (const [key, value] of Object.entries(prefill) as [
            keyof SetupState,
            SetupState[keyof SetupState],
          ][]) {
            if (p[key] === EMPTY[key]) Object.assign(next, { [key]: value });
          }
          return next;
        });
        setConfirmLine(shortcut.confirmLine);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      {/*
        The process outline used to render here, and now opens the phase from the signpost card
        above instead — one place, read from `Module.config`, and shown on the conversational path
        too, which this branch never reached. What stays here is the shortcut, because it is about
        this form's fields rather than about the phase.
      */}
      {confirmLine !== null && (
        // F9 t-2 — §4's recent-audit shortcut, in Rashmir's own words (I11, guarded verbatim in
        // hop 2). It CONFIRMS rather than assumes: everything below is filled in and every field is
        // still editable, and the question invites them to say what has changed.
        <div className="border-border/70 bg-muted/20 space-y-3 rounded-lg border p-5">
          <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
            {confirmLine}
          </p>
          <p className="text-muted-foreground text-sm">
            Everything below is filled in from last time. Change anything that has moved, and leave
            the rest.
          </p>
        </div>
      )}

      <div className="border-border/70 space-y-6 border-t pt-8">
        <TextField
          id="first-name"
          label="Your first name"
          value={s.firstName}
          onChange={(v) => set('firstName', v)}
          help="First name only. Your last name is not collected."
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
          help="A rough figure is fine. This is about the shape of your week, not a precise total."
        />
        <TextAreaField
          id="priorities"
          label="Your top three to five priorities for the rest of this year"
          value={s.priorities}
          onChange={(v) => set('priorities', v)}
        />
        <TextAreaField
          id="keeping-me-up"
          label="What is your biggest current challenge? What is keeping you up at night?"
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
          help="The last quarter is a good default, recent enough to recall and long enough to show patterns. It's completely fine to do this during an atypical week; it is better to know."
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
