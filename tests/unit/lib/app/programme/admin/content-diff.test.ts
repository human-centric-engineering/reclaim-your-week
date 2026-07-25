/**
 * The content editor's view and edit application (F10 t-4). Pure.
 *
 * Two things are load-bearing here and neither is cosmetic. **The divergence marker** is what keeps
 * I11 honest once production content lives in the database rather than in code (plan D7) — without
 * it, Rashmir's words could be changed and the change would be invisible. **The edit narrowing** is
 * what stops a hand-crafted request reaching a field this form does not expose: `openSignup` and the
 * policy version are in the same config object as the bucket descriptions, and a content form that
 * could open the front door would be a hole with a text input on it.
 */

import { describe, it, expect } from 'vitest';
import { reclaimConfigSchema } from '@/lib/app/programme/module';
import { buildContentView, applyContentEdits } from '@/lib/app/programme/admin/content-diff';

const defaults = () => reclaimConfigSchema.parse({});

describe('buildContentView — the divergence marker', () => {
  it('reports every field as matching the source for an unedited config', () => {
    const view = buildContentView(defaults());

    expect(view.editedCount).toBe(0);
    expect(view.buckets.every((b) => b.title.matchesSource && b.description.matchesSource)).toBe(
      true
    );
    expect(view.prose.every((f) => f.matchesSource)).toBe(true);
  });

  it('flags exactly the field that was edited', () => {
    const config = defaults();
    const edited = {
      ...config,
      buckets: config.buckets.map((b, i) =>
        i === 0 ? { ...b, description: 'Reworded by Rashmir.' } : b
      ),
    };

    const view = buildContentView(edited);

    expect(view.editedCount).toBe(1);
    expect(view.buckets[0]?.description.matchesSource).toBe(false);
    expect(view.buckets[0]?.title.matchesSource).toBe(true);
    expect(view.buckets[1]?.description.matchesSource).toBe(true);
  });

  it('compares a reordered bucket against its own source text, not its neighbour’s', () => {
    const config = defaults();
    const reversed = { ...config, buckets: [...config.buckets].reverse() };

    // Nothing was reworded — only moved — so nothing should read as edited.
    expect(buildContentView(reversed).editedCount).toBe(0);
  });

  it('marks the footnote, which I11 says must not be reworded silently', () => {
    const config = { ...defaults(), footnote: 'A different footnote.' };
    const view = buildContentView(config);

    const footnote = view.prose.find((f) => f.key === 'footnote');
    expect(footnote?.matchesSource).toBe(false);
    expect(view.editedCount).toBe(1);
  });
});

describe('applyContentEdits', () => {
  it('applies a bucket title, description and benchmark note', () => {
    const config = defaults();
    const next = applyContentEdits(config, {
      'buckets.0.title': 'Focused work',
      'buckets.0.description': 'New prose.',
      'buckets.0.benchmarkNote': '20–25%',
    });

    expect(next.buckets[0]?.title).toBe('Focused work');
    expect(next.buckets[0]?.description).toBe('New prose.');
    expect(next.buckets[0]?.benchmark.note).toBe('20–25%');
    // The canonical slug is never touched (I7) — it is the storage key every slot hangs off.
    expect(next.buckets[0]?.slug).toBe(config.buckets[0]?.slug);
  });

  it('does not mutate the config it was given', () => {
    const config = defaults();
    const originalTitle = config.buckets[0]?.title;

    applyContentEdits(config, { 'buckets.0.title': 'Something else' });

    expect(config.buckets[0]?.title).toBe(originalTitle);
  });

  it('drops any path the form does not expose, including the access-policy fields', () => {
    const config = defaults();
    const next = applyContentEdits(config, {
      openSignup: 'true',
      policyVersion: 'attacker-1',
      clientWindowMonths: '600',
      'buckets.0.slug': 'renamed',
      footnote: 'A legitimate edit.',
    });

    expect(next.openSignup).toBe(false);
    expect(next.policyVersion).toBe(config.policyVersion);
    expect(next.clientWindowMonths).toBe(config.clientWindowMonths);
    expect(next.buckets[0]?.slug).toBe(config.buckets[0]?.slug);
    // …while the field the form does expose still applies.
    expect(next.footnote).toBe('A legitimate edit.');
  });

  it('applies the two numeric rules, and drops a value that is not a number', () => {
    const config = defaults();

    const applied = applyContentEdits(config, {
      abandonedAfterDays: '30',
      aggregateMinimumCohort: '8',
    });
    expect(applied.abandonedAfterDays).toBe(30);
    expect(applied.aggregateMinimumCohort).toBe(8);

    // A stray keystroke must not become the stall rule: `Number('')` is 0 and `Number('abc')` is NaN,
    // and either written through would make every audit read as stalled, or none of them.
    const rubbish = applyContentEdits(config, {
      abandonedAfterDays: '',
      aggregateMinimumCohort: 'soon',
      footnote: 'A legitimate edit alongside.',
    });
    expect(rubbish.abandonedAfterDays).toBe(config.abandonedAfterDays);
    expect(rubbish.aggregateMinimumCohort).toBe(config.aggregateMinimumCohort);
    // …and the rest of the save is not lost with it.
    expect(rubbish.footnote).toBe('A legitimate edit alongside.');
  });

  it('surfaces the rules and the consultation email, which the UI points the operator here for', () => {
    const view = buildContentView(defaults());
    const keys = view.rules.map((r) => r.key);

    expect(keys).toEqual(['abandonedAfterDays', 'aggregateMinimumCohort']);
    expect(view.prose.map((f) => f.key)).toContain('consultationEmail');
  });

  it('ignores an out-of-range index rather than throwing', () => {
    const config = defaults();
    expect(() => applyContentEdits(config, { 'buckets.99.title': 'Nowhere' })).not.toThrow();
  });

  it('produces a config the module schema still accepts', () => {
    const next = applyContentEdits(defaults(), { 'buckets.0.title': 'Focused work' });
    // The route hands this to the framework's `saveModuleConfig`, which validates against the real
    // schema — so an edit that could not survive that round trip is a bug here, not there.
    expect(() => reclaimConfigSchema.parse(next)).not.toThrow();
  });
});
