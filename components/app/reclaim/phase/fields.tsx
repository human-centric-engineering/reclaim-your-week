'use client';

/**
 * Small labelled form fields shared by the Phase 0 setup and Phase 1 cards (F6). Each carries a
 * `<FieldHelp>` slot (repo rule: every non-trivial field gets one) and the programme's calm styling.
 * Presentational only — state lives in the parent panel.
 */

import type { ReactNode } from 'react';
import { FieldHelp } from '@/components/ui/field-help';

/** The programme's calm input styling — shared across the phase fields (and the reflection box). */
export const inputClass =
  'border-border text-foreground placeholder:text-muted-foreground w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:outline-none';

function Label({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: ReactNode;
  help?: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-foreground flex items-center gap-1.5 text-sm font-medium"
    >
      {children}
      {help && <FieldHelp>{help}</FieldHelp>}
    </label>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} help={help}>
        {label}
      </Label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  rows = 3,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  help?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} help={help}>
        {label}
      </Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-none leading-relaxed`}
      />
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step = '1',
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  help?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} help={help}>
        {label}
      </Label>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} max-w-[8rem]`}
      />
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  help?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} help={help}>
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BooleanField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  help?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-foreground flex items-center gap-1.5 text-sm font-medium">
        {label}
        {help && <FieldHelp>{help}</FieldHelp>}
      </div>
      <div className="flex gap-2">
        {[
          { v: true, l: 'Yes' },
          { v: false, l: 'No' },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              value === o.v
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
