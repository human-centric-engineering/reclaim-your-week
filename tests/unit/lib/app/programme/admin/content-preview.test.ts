/**
 * The content preview (F18 t-1). Pure.
 *
 * Three things are load-bearing, and the third is the one that will still be earning its keep in a
 * year:
 *
 *   1. **The draft wins.** The whole point is reading a sentence before it is saved, so an unsaved
 *      edit must reach the preview and the stored value must reach it where there is no edit.
 *   2. **Reach is stated honestly.** Some of Rashmir's writing is briefing the coach is given and told
 *      not to quote, and a preview drawing it as a leader's screen would be a lie in the one place
 *      built to stop those. The benchmark range is the specific field the editor described wrongly
 *      until this task.
 *   3. **Coverage.** Every field the editor exposes is either previewed or named as deliberately not
 *      previewable. That is what stops a field added to the form later from having nowhere to be read
 *      — the failure mode this feature exists to fix, arriving again by omission.
 */

import { describe, it, expect } from 'vitest';
import { reclaimConfigSchema } from '@/lib/app/programme/module';
import { buildContentView } from '@/lib/app/programme/admin/content-diff';
import {
  buildContentPreview,
  editableKeys,
  previewedKeys,
} from '@/lib/app/programme/admin/content-preview';

const view = () => buildContentView(reclaimConfigSchema.parse({}));

describe('buildContentPreview — the draft', () => {
  it('shows the stored value where nothing has been edited', () => {
    const v = view();
    const preview = buildContentPreview(v, {});

    const first = v.buckets[0];
    expect(first).toBeDefined();
    expect(preview.areas[0]?.title.text).toBe(first?.title.value);
  });

  it('shows an unsaved draft in place of the stored value', () => {
    const v = view();
    const key = v.buckets[0]?.title.key;
    expect(key).toBeDefined();

    const preview = buildContentPreview(v, { [key ?? '']: 'Running the place' });

    expect(preview.areas[0]?.title.text).toBe('Running the place');
    // And only that one moved: a preview that redrew everything from defaults would hide the edit.
    expect(preview.areas[1]?.title.text).toBe(v.buckets[1]?.title.value);
  });

  it('carries a drafted signpost into the card a leader actually meets', () => {
    const v = view();
    const signpost = v.signposts.find((s) => s.opening.length > 0);
    expect(signpost).toBeDefined();
    const beatKey = signpost?.opening[0]?.key as string;

    const preview = buildContentPreview(v, { [beatKey]: 'A different way in.' });
    const phase = preview.phases.find((p) => p.phaseKey === signpost?.phaseKey);

    expect(phase?.signpost.opening[0]).toBe('A different way in.');
    // The card is rendered by the leader's own `<Signpost>`, which needs the phase's own label and
    // section number from the map rather than an index invented here.
    expect(phase?.label.length).toBeGreaterThan(0);
    expect(phase?.index).toBeGreaterThanOrEqual(0);
  });

  it('labels a phase the map no longer has as itself rather than dropping it', () => {
    const v = view();
    const withOrphan = {
      ...v,
      signposts: [
        ...v.signposts,
        {
          phaseKey: 'phase-9-retired',
          involves: {
            key: 'x.involves',
            label: 'i',
            value: 'v',
            matchesSource: true,
            sourceKind: 'authored' as const,
          },
          duration: {
            key: 'x.duration',
            label: 'd',
            value: 'v',
            matchesSource: true,
            sourceKind: 'authored' as const,
          },
          opening: [],
        },
      ],
    };

    const preview = buildContentPreview(withOrphan, {});
    const orphan = preview.phases.find((p) => p.phaseKey === 'phase-9-retired');

    expect(orphan).toBeDefined();
    expect(orphan?.label).toBe('phase-9-retired');
  });
});

describe('buildContentPreview — where a field lands', () => {
  it('puts the benchmark range with the coach, not on a screen', () => {
    // The editor claimed this one was "shown to the leader" until F18 t-1. Nothing renders it: the
    // coach is given it in phases 1 and 3 and told to recognise what it hears with it.
    const preview = buildContentPreview(view(), {});

    for (const area of preview.areas) {
      expect(area.benchmarkNote.reach).toBe('coach');
    }
  });

  it('puts the governing frame, the deep-work note and the bands in the briefing', () => {
    const preview = buildContentPreview(view(), {});
    const keys = preview.briefing.map((l) => l.key);

    expect(keys).toContain('governingFrame');
    expect(keys).toContain('deepWorkNote');
    expect(preview.briefing.every((l) => l.reach === 'coach')).toBe(true);
    // Every band label, and they are all briefing: a band decides what the coach says about a weekly
    // total, and no screen prints one.
    expect(keys.filter((k) => k.startsWith('hourBands.')).length).toBe(view().bands.length);
  });

  it('puts the footnote under the summary, where a leader reads it', () => {
    const preview = buildContentPreview(view(), {});

    expect(preview.summary.map((l) => l.key)).toEqual(['footnote']);
    expect(preview.summary[0]?.reach).toBe('screen');
  });

  it('does not preview a threshold or an email address', () => {
    const preview = buildContentPreview(view(), {});

    expect(preview.notPreviewed).toContain('abandonedAfterDays');
    expect(preview.notPreviewed).toContain('aggregateMinimumCohort');
    expect(preview.notPreviewed).toContain('phaseCoveredPercent');
    expect(preview.notPreviewed).toContain('consultationEmail');
  });
});

describe('buildContentPreview — coverage', () => {
  it('previews every editable field, or names it as not previewable', () => {
    const v = view();
    const preview = buildContentPreview(v, {});
    const shown = new Set([...previewedKeys(preview, v), ...preview.notPreviewed]);

    const missing = editableKeys(v).filter((key) => !shown.has(key));
    expect(
      missing,
      'a field can be edited on this screen and read nowhere on it — add it to a preview block, or to notPreviewed with a reason'
    ).toEqual([]);
  });

  it('does not claim to preview a field the editor does not expose', () => {
    const v = view();
    const preview = buildContentPreview(v, {});
    const editable = new Set(editableKeys(v));

    for (const key of previewedKeys(preview, v)) {
      expect(editable.has(key), `${key} is previewed but is not an editable field`).toBe(true);
    }
  });
});
