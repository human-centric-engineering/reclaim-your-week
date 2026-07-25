'use client';

/**
 * The content editor (F10 t-4) — where Rashmir rewords her own material without a deploy.
 *
 * Every field carries a marker saying whether it still matches the source document (plan D7). That is
 * not a warning and not a lock: her content is hers to revise, and I11 exists so that *we* never
 * paraphrase her rather than so that *she* cannot rewrite herself. What the marker prevents is the
 * other thing — words being changed and the change being invisible. The framework keeps a full
 * version history behind every save, so "edited" is always followed by "by whom, when, and why".
 *
 * Saving posts the whole set of edits with a required change summary. The route forwards to the
 * framework's config service, so validation, versioning and the audit entry are not this screen's job.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FieldHelp } from '@/components/ui/field-help';
import {
  readContent,
  saveContent,
  type ContentView,
  type ContentField,
} from '@/components/app/admin/actions';

function SourceMarker({ matchesSource }: { matchesSource: boolean }) {
  return matchesSource ? (
    <span className="text-muted-foreground text-xs">matches the source document</span>
  ) : (
    <span className="text-xs text-amber-700 dark:text-amber-400">edited — differs from source</span>
  );
}

function Field({
  field,
  draft,
  onChange,
  multiline,
}: {
  field: ContentField;
  draft: string | undefined;
  onChange: (key: string, value: string) => void;
  multiline?: boolean;
}) {
  const value = draft ?? field.value;
  return (
    <label className="block space-y-1">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{field.label}</span>
        <SourceMarker matchesSource={field.matchesSource} />
      </span>
      {multiline === true ? (
        <textarea
          value={value}
          rows={4}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="bg-background w-full rounded-md border p-2 text-sm"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="bg-background w-full rounded-md border p-2 text-sm"
        />
      )}
    </label>
  );
}

export function ContentEditor() {
  const [view, setView] = useState<ContentView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await readContent());
      setDrafts({});
      setError(null);
    } catch (e) {
      setView(null);
      setError(e instanceof Error ? e.message : 'We could not load the content.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = useCallback((key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveContent({ values: drafts, changeSummary: summary.trim() });
      setSummary('');
      await load();
      setNotice('Saved. Everyone sees the new wording from now on.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Those changes could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (error !== null && view === null) return <p className="text-destructive text-sm">{error}</p>;
  if (view === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const dirty = Object.entries(drafts).some(([, value]) => value !== undefined);
  const canSave = dirty && summary.trim().length > 0 && !busy;

  return (
    <div className="space-y-10">
      <div className="rounded-lg border p-4 text-sm">
        <div className="flex items-center gap-1 font-medium">
          {view.editedCount === 0
            ? 'Everything here matches the source documents.'
            : `${view.editedCount} ${view.editedCount === 1 ? 'field differs' : 'fields differ'} from the source documents.`}
          <FieldHelp title="What “matches the source” means">
            <p>
              The wording you originally supplied is checked into the project as read-only source
              documents. A field marked <strong>edited</strong> is one you have changed since —
              which is exactly what this screen is for.
            </p>
            <p>
              The marker exists so a change is never invisible. Every save is kept in full, with who
              made it and why, in the module&rsquo;s{' '}
              <Link href="/admin/framework/modules/reclaim-audit" className="underline">
                version history
              </Link>
              .
            </p>
          </FieldHelp>
        </div>
      </div>

      <section className="space-y-6">
        <h2 className="text-lg font-medium">The nine buckets</h2>
        {view.buckets.map((bucket) => (
          <div key={bucket.bucketSlug} className="space-y-3 rounded-lg border p-4">
            <Field field={bucket.title} draft={drafts[bucket.title.key]} onChange={change} />
            <Field
              field={bucket.description}
              draft={drafts[bucket.description.key]}
              onChange={change}
              multiline
            />
            <Field
              field={bucket.benchmarkNote}
              draft={drafts[bucket.benchmarkNote.key]}
              onChange={change}
            />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Total-hours bands</h2>
        {view.bands.map((band) => (
          <div key={band.id} className="rounded-lg border p-4">
            <Field field={band.label} draft={drafts[band.label.key]} onChange={change} multiline />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Framing and the footnote</h2>
        {view.prose.map((field) => (
          <div key={field.key} className="rounded-lg border p-4">
            <Field field={field} draft={drafts[field.key]} onChange={change} multiline />
          </div>
        ))}
      </section>

      <section className="bg-background sticky bottom-0 space-y-2 border-t py-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">What changed, and why</span>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Softened the wording on organisational oversight"
            className="bg-background w-full rounded-md border p-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {dirty && summary.trim().length === 0 && (
            <span className="text-muted-foreground text-sm">
              Add a line about what changed before saving.
            </span>
          )}
          {notice !== null && (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</span>
          )}
          {error !== null && <span className="text-destructive text-sm">{error}</span>}
        </div>
      </section>
    </div>
  );
}
