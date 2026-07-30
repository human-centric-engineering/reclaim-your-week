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
 *
 * **F18 t-1 put the draft beside the fields.** For a version this was a column of text inputs over
 * somebody else's writing, with no way to read a sentence where a leader meets it short of saving and
 * opening the product. The preview panel renders the unsaved draft, and it is the same
 * `<Signpost>` a leader sees rather than a lookalike.
 *
 * ## What the redesign changed, and why
 *
 * Both columns had grown past the point of being readable, in two different ways.
 *
 * **The fields were one scroll of nested boxes.** Nine areas, seven phase openings, the bands, the
 * framing and the rules, every one of them a bordered card inside a bordered section, all open at
 * once. Four **tabs** now hold one job in view at a time — the same move `access-workspace.tsx` made
 * for the same reason — and the cards are gone in favour of one framed list per tab with hairline
 * rules between entries. A tab that is hiding unsaved work says so in its strip, which is the debt
 * tabs incur and this one pays.
 *
 * **The markers announced the absence of news.** Every field said "matches the source document" —
 * forty-odd repetitions of *nothing has happened*, printed in the same weight as the writing they
 * annotate. The affirmative case is now said once, at the top, and a field speaks up only when it has
 * something to say: amber when it has diverged from the source, and an unsaved flag while a draft is
 * still in hand. Nothing is lost, because the count at the top is the same count.
 *
 * **Prose that was true nine times over is said once.** The coach-only note under every benchmark
 * range was three lines repeated per area; it is now a `<FieldHelp>` on the field it describes, with
 * its wording — including the F18 t-1 correction that the range reaches the coach and never the
 * screen — carried over intact.
 *
 * **The preview is its own scroll region.** It was `sticky` and taller than the viewport, which pins
 * the top of a panel whose bottom can then never be reached. It is now sticky *and* bounded, scrolling
 * inside itself against a still page.
 *
 * **The preview follows the tab.** Tabs made the fields readable and left the panel behind: it went on
 * drawing the whole draft — phase card, areas, footnote, briefing — beside whichever tab was open, so
 * bucket 01 in the fields sat next to the summary footnote in the panel with nothing on screen saying
 * they were the same page. It reads as an unrelated slab of text, which is the opposite of what a
 * preview is for. `TAB_PREVIEW` narrows it to the blocks the open tab's fields actually feed, and on
 * `rules` — three numbers, no rendering — the column goes away and the fields take the full width.
 * The heading went with it: "as a leader reads it" was never true of the block titled *what the coach
 * is told*, so the panel now says how the wording appears rather than who reads it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FieldHelp } from '@/components/ui/field-help';
import { useUrlTabs } from '@/lib/hooks/use-url-tabs';
import { RECLAIM_PHASES } from '@/lib/app/programme/map';
import {
  ContentPreview,
  type PreviewSection,
} from '@/components/app/admin/content/content-preview';
import {
  readContent,
  saveContent,
  type ContentView,
  type ContentField,
} from '@/components/app/admin/actions';

const TABS = ['buckets', 'phases', 'framing', 'rules'] as const;
type ContentTab = (typeof TABS)[number];

const TAB_LABELS: Record<ContentTab, string> = {
  buckets: 'The nine buckets',
  phases: 'Phase openings',
  framing: 'Framing',
  rules: 'Rules',
};

/**
 * Which blocks of the draft each tab's fields feed.
 *
 * The panel used to draw all four at once beside every tab, and the effect was that it read as an
 * unrelated slab of text: the fields on bucket 01, the panel scrolled to the summary footnote,
 * nothing on screen saying the two were about the same words. Narrowing it to the tab's own
 * destinations is what makes "how this appears" a claim about what is under the cursor.
 *
 * **`rules` is empty on purpose, and that is not a gap.** Those three are numbers that change what
 * the programme *does* rather than what it says; `buildContentPreview` names them in `notPreviewed`
 * for the same reason. An empty list here collapses the column and gives the fields the full width,
 * rather than parking a full-height panel with nothing to say beside them.
 */
const TAB_PREVIEW: Record<ContentTab, readonly PreviewSection[]> = {
  buckets: ['areas'],
  phases: ['phases'],
  framing: ['summary', 'briefing'],
  rules: [],
};

/**
 * Every field on the screen, keyed, and which tab it sits under.
 *
 * Two things need this. A draft is only *unsaved* if it differs from the stored value — typing a
 * character and deleting it again used to arm the save button for the rest of the session — and a tab
 * cannot warn that it is hiding an edit without knowing which fields it holds.
 *
 * Walks the view rather than the drafts, so a field added to `ContentView` later is either placed here
 * or is visibly missing from a count, rather than silently uncounted.
 */
function indexFields(view: ContentView): {
  saved: Record<string, string>;
  byTab: Record<ContentTab, string[]>;
} {
  const saved: Record<string, string> = {};
  const byTab: Record<ContentTab, string[]> = { buckets: [], phases: [], framing: [], rules: [] };
  const add = (tab: ContentTab, ...fields: ContentField[]) => {
    for (const field of fields) {
      saved[field.key] = field.value;
      byTab[tab].push(field.key);
    }
  };

  for (const bucket of view.buckets) {
    add('buckets', bucket.title, bucket.description, bucket.benchmarkNote);
  }
  for (const signpost of view.signposts) {
    add('phases', signpost.involves, signpost.duration, ...signpost.opening);
  }
  add('framing', ...view.prose, ...view.bands.map((band) => band.label));
  add('rules', ...view.rules);

  return { saved, byTab };
}

/** The human name of a phase, from the map a leader actually reads, falling back to its key. */
function phaseLabel(phaseKey: string): string {
  return RECLAIM_PHASES.find((phase) => phase.key === phaseKey)?.label ?? phaseKey;
}

/** The shared shape of everything that annotates a field label: small, quiet, and set in caps. */
const MARKER = 'text-[0.65rem] font-medium tracking-[0.1em] uppercase';

/**
 * What a field has to say about itself, which is usually nothing.
 *
 * Three states, in the order they matter to the person at the keyboard. An **unsaved** draft is the
 * live one and outranks the rest — it is the only state they can act on. **Edited** is amber and means
 * Rashmir's own writing has diverged from the source document she supplied, which is exactly what I11
 * wants visible. For copy this app wrote there is no source document to differ from, so a divergence
 * there is unremarkable and stays grey. A field that matches its source says nothing at all: the page
 * has already said so once, at the top, and repeating it per field buries the two states that matter.
 */
function FieldMarker({ field, dirty }: { field: ContentField; dirty: boolean }) {
  if (dirty) return <span className={cn(MARKER, 'text-primary')}>unsaved</span>;
  if (field.matchesSource) return null;
  if (field.sourceKind === 'authored') {
    return <span className={cn(MARKER, 'text-muted-foreground')}>edited</span>;
  }
  return (
    <span className={cn(MARKER, 'text-amber-700 dark:text-amber-400')}>
      edited · differs from source
    </span>
  );
}

function FieldLabel({
  children,
  marker,
  help,
}: {
  children: React.ReactNode;
  marker?: React.ReactNode;
  help?: React.ReactNode;
}) {
  return (
    <span className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.12em] uppercase">
        {children}
      </span>
      {help}
      {marker}
    </span>
  );
}

function Field({
  field,
  draft,
  onChange,
  multiline,
  rows,
  help,
}: {
  field: ContentField;
  draft: string | undefined;
  onChange: (key: string, value: string) => void;
  multiline?: boolean;
  rows?: number;
  help?: React.ReactNode;
}) {
  const value = draft ?? field.value;
  const dirty = draft !== undefined && draft !== field.value;
  return (
    <label className="block">
      <FieldLabel marker={<FieldMarker field={field} dirty={dirty} />} help={help}>
        {field.label}
      </FieldLabel>
      {multiline === true ? (
        <Textarea
          value={value}
          rows={rows ?? 4}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="text-sm leading-relaxed"
        />
      ) : (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="text-sm"
        />
      )}
    </label>
  );
}

/** One framed list per tab: a single border around the set, hairlines between its entries. */
function Ledger({ children }: { children: React.ReactNode }) {
  return <ol className="divide-border/60 divide-y rounded-lg border">{children}</ol>;
}

/** An entry in a ledger, numbered in the margin so a set of nine reads as a set of nine. */
function LedgerRow({ ordinal, children }: { ordinal?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 p-5">
      {ordinal !== undefined && (
        <span
          aria-hidden
          className="text-muted-foreground/50 hidden w-4 pt-0.5 text-[0.7rem] tabular-nums sm:block"
        >
          {ordinal}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-4">{children}</div>
    </li>
  );
}

/** The sentence that opens a tab, saying what is in it — once, instead of once per entry. */
function Lead({ children, help }: { children: React.ReactNode; help?: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1 text-sm">
      {children}
      {help}
    </p>
  );
}

/** The eyebrow over a group inside a tab that holds more than one kind of thing. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground mb-2 text-[0.7rem] font-medium tracking-[0.12em] uppercase">
      {children}
    </h3>
  );
}

/** Per-rule help, keyed by the field it belongs beside rather than pooled into one popover. */
const RULE_HELP: Record<string, { title: string; body: React.ReactNode }> = {
  abandonedAfterDays: {
    title: 'What this changes',
    body: (
      <p>
        How long an audit can sit untouched before the client list flags it as stalled. An audit is
        meant to be left and returned to, so this is deliberately generous.
      </p>
    ),
  },
  aggregateMinimumCohort: {
    title: 'What this changes',
    body: (
      <p>
        The anonymity floor on the shared-results page: any figure covering fewer leaders than this
        is withheld rather than shown, so an average can never point at one person.
      </p>
    ),
  },
  phaseCoveredPercent: {
    title: 'What this changes',
    body: (
      <p>
        The point at which a leader is offered the next phase, as a percentage of the questions that
        apply to them. Below it the coach keeps asking and there is no button; at or above it the
        button appears alongside a line saying what is still open, so they can carry on or move on
        knowingly. Raising it to 100 means every applicable question must be answered, which can
        hold a phase open on one a leader would rather not answer.
      </p>
    ),
  },
};

export function ContentEditor() {
  const [view, setView] = useState<ContentView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { activeTab, setActiveTab } = useUrlTabs<ContentTab>({
    defaultTab: 'buckets',
    allowedTabs: TABS,
  });

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

  const index = useMemo(() => (view === null ? null : indexFields(view)), [view]);

  /** The keys whose draft actually differs from what is stored — the real definition of unsaved. */
  const changedKeys = useMemo(() => {
    if (index === null) return [];
    return Object.keys(drafts).filter((key) => drafts[key] !== index.saved[key]);
  }, [drafts, index]);

  const save = async () => {
    if (view === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveContent({
        values: drafts,
        changeSummary: summary.trim(),
        baseVersion: view.baseVersion,
      });
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
  if (view === null || index === null)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  const dirty = changedKeys.length > 0;
  const canSave = dirty && summary.trim().length > 0 && !busy;
  const sections = TAB_PREVIEW[activeTab];
  const unsavedIn = (tab: ContentTab) =>
    changedKeys.filter((key) => index.byTab[tab].includes(key)).length;

  return (
    <div className="space-y-5">
      {/* Said once, at the top, so no field has to repeat it. A dot rather than a box: this is a
          state to glance at, not a notice to read. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            view.editedCount === 0 ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-amber-500'
          )}
        />
        <span className={view.editedCount === 0 ? 'text-muted-foreground' : 'text-foreground'}>
          {view.editedCount === 0
            ? 'Everything here matches the source documents.'
            : `${view.editedCount} ${view.editedCount === 1 ? 'field differs' : 'fields differ'} from the source documents.`}
        </span>
        <FieldHelp title="What “matches the source” means">
          <p>
            The wording you originally supplied is checked into the project as read-only source
            documents. A field marked <strong>edited</strong> is one you have changed since — which
            is exactly what this screen is for.
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

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Bounded as well as sticky. Sticky alone pinned a panel taller than the viewport, which
            fixes its top in place and puts its bottom permanently out of reach; the cap turns it
            into its own scroll region against a still page. A max-height rather than a height, now
            that the panel shows one block instead of four: a short block should be a short panel,
            not a tall box with a hole in it. Collapsed by default on a narrow screen, where a second
            column would push the fields off the page — and absent entirely on a tab whose fields
            have no rendering to preview. */}
        {sections.length > 0 && (
          <aside className="lg:sticky lg:top-2 lg:order-2 lg:col-span-5 lg:max-h-[calc(100vh-5.5rem)]">
            <button
              type="button"
              onClick={() => setPreviewOpen((open) => !open)}
              className="text-muted-foreground hover:text-foreground mb-3 text-xs underline underline-offset-4 lg:hidden"
            >
              {previewOpen ? 'Hide how this appears' : 'See how this appears'}
            </button>
            <div className={cn('lg:max-h-full', previewOpen ? 'block' : 'hidden lg:block')}>
              <ContentPreview
                view={view}
                drafts={drafts}
                show={sections}
                className="lg:max-h-[calc(100vh-5.5rem)]"
              />
            </div>
          </aside>
        )}

        <div className={cn('lg:order-1', sections.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12')}>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ContentTab)}>
            <TabsList className="h-auto flex-wrap justify-start">
              {TABS.map((tab) => {
                const unsaved = unsavedIn(tab);
                return (
                  <TabsTrigger key={tab} value={tab}>
                    {TAB_LABELS[tab]}
                    {/* Tabs hide things; this is the debt they incur. A dot here is the only way a
                        leader-facing sentence edited under one tab is still visible from another. */}
                    {unsaved > 0 && (
                      <>
                        <span aria-hidden className="bg-primary ml-2 size-1.5 rounded-full" />
                        <span className="sr-only">
                          , {unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}
                        </span>
                      </>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="buckets" className="mt-5">
              <Lead>
                The name, description and coach note for each of the nine areas of leadership time.
              </Lead>
              <Ledger>
                {view.buckets.map((bucket, i) => (
                  <LedgerRow key={bucket.bucketSlug} ordinal={String(i + 1).padStart(2, '0')}>
                    <Field
                      field={bucket.title}
                      draft={drafts[bucket.title.key]}
                      onChange={change}
                    />
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
                      /* This note used to say the range was "shown to the leader". Nothing renders it
                         on any leader-facing surface: the coach is given it at the start of phases 1
                         and 3, and is told to recognise what it hears with it rather than quote it.
                         Corrected in F18 t-1, on the task whose whole purpose is that this screen
                         tells the truth about where a field lands — so the wording survives the move
                         out of nine repeated paragraphs and into the field it describes. */
                      help={
                        <FieldHelp title="Where this range goes">
                          <p>
                            The range in your own words. It is given to the coach rather than shown
                            on screen, so it shapes what the coach notices and is never read out.
                          </p>
                          <p>
                            The numbers that decide whether a bar is marked over or under are set
                            separately and are not on this screen.
                          </p>
                        </FieldHelp>
                      }
                    />
                  </LedgerRow>
                ))}
              </Ledger>
            </TabsContent>

            <TabsContent value="phases" className="mt-5">
              <Lead
                help={
                  <FieldHelp title="What a leader reads first">
                    <p>
                      Every phase opens with these words before anyone types anything. They set what
                      the phase is, what it involves, and roughly how long it takes, so the process
                      never feels open-ended.
                    </p>
                    <p>
                      Most of this wording was written for the app rather than taken from your
                      documents, so it is measured against the shipped wording rather than a source
                      document. The one exception is the second part of Phase 0, which is your own
                      outline and is marked as such.
                    </p>
                  </FieldHelp>
                }
              >
                What a leader reads as each phase opens, before anyone types anything.
              </Lead>
              <Ledger>
                {view.signposts.map((signpost, i) => (
                  <LedgerRow key={signpost.phaseKey} ordinal={String(i)}>
                    <p className="text-foreground text-sm font-medium">
                      {phaseLabel(signpost.phaseKey)}
                    </p>
                    <Field
                      field={signpost.involves}
                      draft={drafts[signpost.involves.key]}
                      onChange={change}
                    />
                    <Field
                      field={signpost.duration}
                      draft={drafts[signpost.duration.key]}
                      onChange={change}
                    />
                    {signpost.opening.map((beat) => (
                      <Field
                        key={beat.key}
                        field={beat}
                        draft={drafts[beat.key]}
                        onChange={change}
                        multiline
                      />
                    ))}
                    {signpost.opening.length === 0 && (
                      <p className="text-muted-foreground text-xs">
                        This phase opens on its heading alone. The summary needs no introduction
                        because the document is the point.
                      </p>
                    )}
                  </LedgerRow>
                ))}
              </Ledger>
            </TabsContent>

            <TabsContent value="framing" className="mt-5 space-y-8">
              <div>
                <GroupHeading>The frame and the footnote</GroupHeading>
                <Lead>What the audit is said to be, and what is said under a finished one.</Lead>
                <Ledger>
                  {view.prose.map((field) => (
                    <LedgerRow key={field.key}>
                      <Field field={field} draft={drafts[field.key]} onChange={change} multiline />
                    </LedgerRow>
                  ))}
                </Ledger>
              </div>

              <div>
                <GroupHeading>Total-hours bands</GroupHeading>
                <Lead>How a week&rsquo;s total is described back, band by band.</Lead>
                <Ledger>
                  {view.bands.map((band) => (
                    <LedgerRow key={band.id}>
                      <Field
                        field={band.label}
                        draft={drafts[band.label.key]}
                        onChange={change}
                        multiline
                        rows={3}
                      />
                    </LedgerRow>
                  ))}
                </Ledger>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="mt-5">
              <Lead>
                The only numbers on this screen. These change what the programme does rather than
                what it says.
              </Lead>
              <Ledger>
                {view.rules.map((rule) => {
                  const draft = drafts[rule.key];
                  const help = RULE_HELP[rule.key];
                  return (
                    <LedgerRow key={rule.key}>
                      <label className="block">
                        <FieldLabel
                          marker={
                            <FieldMarker
                              field={rule}
                              dirty={draft !== undefined && draft !== rule.value}
                            />
                          }
                          help={
                            help === undefined ? undefined : (
                              <FieldHelp title={help.title}>{help.body}</FieldHelp>
                            )
                          }
                        >
                          {rule.label}
                        </FieldLabel>
                        <Input
                          type="number"
                          min={rule.min}
                          max={rule.max}
                          value={draft ?? rule.value}
                          onChange={(e) => change(rule.key, e.target.value)}
                          className="w-28 text-sm tabular-nums"
                        />
                      </label>
                    </LedgerRow>
                  );
                })}
              </Ledger>
            </TabsContent>
          </Tabs>

          {/* Below the panes rather than inside one: what is being saved is the whole set of edits,
              across every tab, and a save bar that lived in a tab would look like it saved that tab. */}
          <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 mt-6 border-t pt-4 pb-4 backdrop-blur">
            <div className="flex flex-wrap items-end gap-3">
              <label htmlFor="content-change-summary" className="min-w-[15rem] flex-1">
                <FieldLabel
                  help={
                    <FieldHelp title="Why this is required">
                      <p>
                        Every save is kept as a numbered version you can compare and roll back to.
                        This line is what makes that history readable a year from now — without it
                        the history is a list of anonymous diffs.
                      </p>
                      <p>
                        It also keeps the record straight about authorship: these are your words,
                        and a change with a reason attached can never be mistaken for someone else
                        rewriting them.
                      </p>
                    </FieldHelp>
                  }
                >
                  What changed, and why
                </FieldLabel>
                <Input
                  id="content-change-summary"
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Softened the wording on organisational oversight"
                  className="text-sm"
                />
              </label>
              <Button type="button" onClick={() => void save()} disabled={!canSave}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
            {/* One line, always present, so the bar does not change height as its state changes. */}
            <p className="mt-2 min-h-[1.25rem] text-xs">
              {error !== null ? (
                <span className="text-destructive">{error}</span>
              ) : notice !== null ? (
                <span className="text-emerald-700 dark:text-emerald-400">{notice}</span>
              ) : dirty ? (
                <span className="text-muted-foreground">
                  {changedKeys.length} unsaved {changedKeys.length === 1 ? 'change' : 'changes'}
                  {summary.trim().length === 0 && '. Add a line about what changed before saving.'}
                </span>
              ) : (
                <span className="text-muted-foreground">No unsaved changes.</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
