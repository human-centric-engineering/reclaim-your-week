'use client';

/**
 * What has been saved, and the way back to any of it.
 *
 * The editor has always required a line about what changed and why, on the argument that "version
 * history without it is a list of anonymous diffs". It then showed neither the versions nor the
 * diffs: the only reading of that history was the framework's module screen, which speaks of config
 * snapshots rather than of wording. Writing a summary into a record you cannot open is a worse
 * arrangement than not asking for one, so this is where the summaries land.
 *
 * **A version says what it now says.** The first cut of this list named the fields a version moved —
 * "Setup: roughly how long" — and stopped there, which tells you where to look and nothing about what
 * you would find. Every change now carries both readings, *was* above *now*, so a version can be
 * identified without restoring it to find out. Collapsed behind a count where a version moved several
 * fields, because a restore of the original moves forty at once and would otherwise bury the rest of
 * the history under itself.
 *
 * **Version 0 is the wording as supplied**, and it sits at the bottom of the list as an ordinary row
 * with an ordinary Restore. It is not a stored snapshot — the first `ModuleVersion` is written by the
 * first *edit* — so without it the one state this screen could never get back to is the one it
 * started from.
 *
 * **A restore is not a rewind.** It writes the old wording back as a *new* version, so the history is
 * append-only and taking one is reversible by taking another. That is why the confirm here is a plain
 * "restore this" rather than the usual are-you-sure over a destructive act — the destructive reading
 * does not exist. The one thing a restore can genuinely lose is a draft in the other tabs, which is
 * unsaved by definition and cannot survive the reload, so that is the only warning worth printing and
 * it is printed only when there is something to lose.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  listContentVersions,
  restoreContentVersion,
  type ContentVersion,
  type ContentFieldChange,
} from '@/components/app/admin/actions';

/** The shared shape of every small caps annotation on this panel. */
const MARKER = 'text-[0.65rem] font-medium tracking-[0.1em] uppercase';

function formatSaved(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A field's wording, with an empty string said rather than rendered as a gap. */
function Wording({ text }: { text: string | null }) {
  if (text === null) return <span className="text-muted-foreground italic">not set</span>;
  if (text.trim().length === 0)
    return <span className="text-muted-foreground italic">left empty</span>;
  return <span className="whitespace-pre-wrap">{text}</span>;
}

/**
 * One field, before and after.
 *
 * Set as a labelled pair rather than as a coloured diff: these are paragraphs of prose, and the
 * red/green idiom borrowed from code review puts a strikethrough through sentences that were fine.
 * The caps column carries the whole distinction, so it survives being read in either theme and by
 * anyone who cannot separate the two hues.
 */
function Change({ change }: { change: ContentFieldChange }) {
  return (
    <div className="border-border/70 space-y-1.5 border-l pl-4">
      <p className={cn(MARKER, 'text-muted-foreground')}>{change.label}</p>
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-1.5 text-sm leading-relaxed">
        <span className={cn(MARKER, 'text-muted-foreground/60 pt-1')}>Was</span>
        <p className="text-muted-foreground">
          <Wording text={change.from} />
        </p>
        <span className={cn(MARKER, 'text-muted-foreground/60 pt-1')}>Now</span>
        <p className="text-foreground">
          <Wording text={change.to} />
        </p>
      </div>
    </div>
  );
}

/** What a version moved, said in the same words the fields carry. */
function ChangedFields({ version, expanded }: { version: ContentVersion; expanded: boolean }) {
  if (version.isBaseline) {
    return (
      <p className="text-muted-foreground">
        The wording as it was supplied, before anything on this screen was edited. Restoring it puts
        every field back to its original — including the three rules — and leaves settings that are
        not on this screen alone.
      </p>
    );
  }
  if (version.unreadable) {
    return (
      <p className="text-amber-700 dark:text-amber-400">
        This version was saved against an older shape of the content and can no longer be read back.
        It is kept here as a record; restoring it would be refused.
      </p>
    );
  }
  if (version.changedElsewhere) {
    return (
      <p className="text-muted-foreground">
        Changed a setting that is not on this screen. No wording moved.
      </p>
    );
  }
  if (version.changes.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nothing on this screen differs from the version below it.
      </p>
    );
  }
  if (!expanded) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {version.changes.map((change) => (
          <span
            key={change.label}
            className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs"
          >
            {change.label}
          </span>
        ))}
        {version.moreChanged > 0 && (
          <span className="text-muted-foreground px-1 py-0.5 text-xs">
            and {version.moreChanged} more
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4 pt-1">
      {version.changes.map((change) => (
        <Change key={change.label} change={change} />
      ))}
      {version.moreChanged > 0 && (
        <p className="text-muted-foreground text-xs">
          And {version.moreChanged} more {version.moreChanged === 1 ? 'field' : 'fields'}, not
          quoted here. The version below shows what they said before this save.
        </p>
      )}
    </div>
  );
}

export function ContentHistory({
  reloadToken,
  unsavedCount,
  onRestored,
}: {
  /** Bumped by the editor after a save, so the list a save just extended is the list on screen. */
  reloadToken: number;
  /** Drafts in hand elsewhere on the screen. A restore reloads the fields and would drop them. */
  unsavedCount: number;
  /** Reload the fields — the restore has already landed by the time this is called. */
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<ContentVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      const rows = await listContentVersions();
      setVersions(rows);
      // The newest row with something to show opens on arrival. A panel whose whole complaint was
      // "this does not say what changed" should not need a click before it says anything.
      const first = rows.find((row) => row.changes.length > 0);
      setExpanded(first === undefined ? [] : [first.version]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not load the version history.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const restore = async (version: ContentVersion) => {
    setRestoring(version.version);
    setError(null);
    setNotice(null);
    try {
      const saved = await restoreContentVersion(version.version);
      setConfirming(null);
      setNotice(
        version.isBaseline
          ? `The original wording is live again, saved as version ${saved}.`
          : `Version ${version.version} is live again, saved as version ${saved}.`
      );
      onRestored();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That version could not be restored.');
    } finally {
      setRestoring(null);
    }
  };

  if (error !== null && versions === null)
    return <p className="text-destructive text-sm">{error}</p>;
  if (versions === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      {error !== null && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {notice}
        </p>
      )}

      <ol className="divide-border/60 divide-y rounded-lg border">
        {versions.map((version) => {
          const open = expanded.includes(version.version);
          return (
            <li key={version.version} className="flex flex-wrap gap-4 p-5">
              <div className="w-full min-w-0 flex-1 space-y-2 sm:w-auto">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-foreground text-sm font-medium tabular-nums">
                    Version {version.version}
                  </span>
                  {version.isCurrent && (
                    <span className={cn(MARKER, 'text-emerald-700 dark:text-emerald-400')}>
                      live
                    </span>
                  )}
                  {version.isBaseline && (
                    <span className={cn(MARKER, 'text-muted-foreground')}>as supplied</span>
                  )}
                  {version.savedAt !== null && (
                    <span className="text-muted-foreground text-xs">
                      {formatSaved(version.savedAt)}
                      {version.savedByName !== null && ` · ${version.savedByName}`}
                    </span>
                  )}
                </p>
                {!version.isBaseline && (
                  <p
                    className={cn(
                      'text-sm',
                      version.changeSummary === null
                        ? 'text-muted-foreground italic'
                        : 'text-foreground'
                    )}
                  >
                    {version.changeSummary ?? 'Saved without a summary, from outside this screen.'}
                  </p>
                )}
                <div className="text-xs leading-relaxed">
                  <ChangedFields version={version} expanded={open} />
                </div>
                {version.changes.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((keys) =>
                        open
                          ? keys.filter((key) => key !== version.version)
                          : [...keys, version.version]
                      )
                    }
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                  >
                    {open
                      ? 'Hide the wording'
                      : `Show the wording · ${version.changes.length + version.moreChanged} ${
                          version.changes.length + version.moreChanged === 1 ? 'field' : 'fields'
                        }`}
                  </button>
                )}
              </div>

              {/* No action on the live version: restoring what is already live would write a
                  no-op version into a history whose whole job is that every line means something. */}
              <div className="flex items-start">
                {version.isCurrent || version.unreadable ? null : confirming === version.version ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void restore(version)}
                        disabled={restoring !== null}
                      >
                        {restoring === version.version ? 'Restoring…' : 'Yes, restore it'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirming(null)}
                        disabled={restoring !== null}
                      >
                        Cancel
                      </Button>
                    </div>
                    {unsavedCount > 0 && (
                      <p className="text-muted-foreground max-w-56 text-xs">
                        Your {unsavedCount} unsaved {unsavedCount === 1 ? 'change' : 'changes'} will
                        be dropped.
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setConfirming(version.version);
                    }}
                    disabled={restoring !== null}
                  >
                    Restore
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Restoring puts that wording back as a new version rather than deleting what came after it,
        so nothing here is ever lost and a restore can itself be undone by restoring the version
        before it.
      </p>
    </div>
  );
}
