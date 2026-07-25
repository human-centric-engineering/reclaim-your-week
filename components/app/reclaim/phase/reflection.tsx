'use client';

/**
 * Reusable required reflection (F6 t-2) — the UI half of I9. Each of Phases 1–5 ends with a short
 * reflection; the server refuses the transition (`422 REFLECTION_REQUIRED`) until its
 * `reclaim_reflection_p<N>` slot is present, so this is the field that feeds it. Controlled by the
 * parent panel; the parent disables "continue" until it has content and shows the server's message if
 * the gate still fires.
 */

import { FieldHelp } from '@/components/ui/field-help';

export function Reflection({
  value,
  onChange,
  prompt = 'What stands out to you here?',
}: {
  value: string;
  onChange: (v: string) => void;
  prompt?: string;
}) {
  return (
    <div className="border-border/70 bg-muted/40 space-y-3 rounded-2xl border px-6 py-5">
      <label
        htmlFor="reflection"
        className="text-foreground flex items-center gap-1.5 text-sm font-medium"
      >
        {prompt}
        <FieldHelp>
          A sentence or two is plenty. This is your own noticing — the audit hands the insight back
          to you, it does not decide for you.
        </FieldHelp>
      </label>
      <textarea
        id="reflection"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Take a moment…"
        className="border-border text-foreground placeholder:text-muted-foreground w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed focus:outline-none"
      />
    </div>
  );
}
