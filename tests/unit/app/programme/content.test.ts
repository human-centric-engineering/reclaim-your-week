/**
 * I11 hop 2 — the `reclaim-audit` config defaults match Rashmir's content **character-for-character**
 * (F2 t-3).
 *
 * hop 1 (`npm run leaf:content-diff`) proves the blockquotes in `.context/app/content-source.md`
 * match the read-only originals in `.context/app/sources/`. This test is hop 2: it parses those same
 * blockquotes straight out of `content-source.md` and asserts the nine bucket `description`s and the
 * `footnote` shipped as config defaults are byte-identical to them. Together the hops close the loop
 * — hop 1 (extract == source) and hop 2 (code == extract) — so a paraphrase can't slip in at either
 * step. Nine altered blockquotes survived to 2026-07-23 precisely because only one hop existed.
 *
 * The parse deliberately does NOT normalise (no smart-quote or dash folding): "character-identical"
 * is the contract, so an em dash reworded to a comma must fail. The only transformation is stripping
 * the `>` markers and joining a blockquote's wrapped lines with single spaces — which is exactly how
 * the defaults in `content.ts` are stored.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { extractBlockquotes } from '@/scripts/content-source/lib';
import { reclaimConfigSchema } from '@/lib/app/programme/module';
import {
  RECLAIM_PROCESS_OUTLINE,
  RECLAIM_UNDER_DELEGATION_INVITATION,
  RECLAIM_JOURNEY_FRAMING,
  RECLAIM_FORWARD_CLOSE,
  RECLAIM_CLOSING_AFFIRMATION,
  RECLAIM_STRATEGY_MIRROR,
  RECLAIM_PHASE2_COACHING_SIGNAL,
  RECLAIM_RECENT_AUDIT_CONFIRM,
  RECLAIM_IDEAL_WEEK_FRAMING,
  RECLAIM_IDEAL_WEEK_CHALLENGE,
  RECLAIM_HOURS_55_NOTE,
  RECLAIM_PERMISSION_CHALLENGE,
  RECLAIM_WANTED_NOT_DUTIFUL,
  RECLAIM_ACTION_SPECIFICITY,
} from '@/lib/app/programme/content';

const CONTENT_SOURCE = join(process.cwd(), '.context', 'app', 'content-source.md');
const markdown = readFileSync(CONTENT_SOURCE, 'utf8');
const lines = markdown.split('\n');
const quotes = extractBlockquotes(markdown);

// `extractBlockquotes` strips the `>` markers but keeps newlines; a config string is a single line,
// so join the wrapped lines with a space. No other transformation — the comparison is exact.
const joinQuote = (raw: string) => raw.replace(/\n/g, ' ');

/** The first blockquote that begins after the given 1-indexed heading line. */
function firstQuoteAfter(headingLine: number): string {
  const block = quotes.find((q) => q.line > headingLine);
  if (!block) throw new Error(`no blockquote found after line ${headingLine}`);
  return joinQuote(block.raw);
}

/** 1-indexed line of the first source line matching `re` (fails loudly if absent). */
function lineOf(re: RegExp): number {
  const idx = lines.findIndex((l) => re.test(l));
  if (idx === -1) throw new Error(`heading not found: ${re}`);
  return idx + 1;
}

const config = reclaimConfigSchema.parse({});

describe('I11 hop 2 — config defaults are verbatim from content-source.md', () => {
  it('parses the file (guards against a silent read/parse failure)', () => {
    // If the source ever moves or the blockquote convention changes, fail here rather than
    // vacuously passing the per-field assertions below.
    expect(quotes.length).toBeGreaterThan(50);
    expect(config.buckets).toHaveLength(9);
  });

  it.each([
    'deep-work',
    'learning-development',
    'strategic-planning',
    'team-development',
    'organisational-oversight',
    'fundraising-capital',
    'relationship-building',
    'delivery-operations',
    'recovery-white-space',
  ])('bucket %s description is character-identical to its §1 blockquote', (slug) => {
    // The §1 bucket heading looks like: ### 3. `strategic-planning` — Strategic planning & review
    const headingLine = lineOf(new RegExp('^### \\d+\\. `' + slug + '`'));
    const sourceDescription = firstQuoteAfter(headingLine);

    const bucket = config.buckets.find((b) => b.slug === slug);
    expect(bucket, `config has no bucket ${slug}`).toBeDefined();
    expect(bucket?.description).toBe(sourceDescription);
  });

  it('the recent-audit confirm line appears verbatim inside the §4 shortcut blockquote (F9 t-2)', () => {
    // A **substring** check, not whole-quote identity, and deliberately so: the §4 blockquote is a
    // system-prompt-era instruction whose surrounding sentences ("either in the project files or
    // pasted in") the product retires by having a database. Only the quoted sentence is user-facing.
    // What I11 requires is that the sentence is not paraphrased on its way into the app — which is
    // exactly what containment proves.
    const headingLine = lineOf(/^\*\*The recent-audit shortcut\*\*/);
    const sourceQuote = firstQuoteAfter(headingLine);

    expect(sourceQuote).toContain(RECLAIM_RECENT_AUDIT_CONFIRM);
    expect(config.recentAuditConfirm).toBe(RECLAIM_RECENT_AUDIT_CONFIRM);
    // And the placeholders survive: they are what makes it a confirmation of THEIR context rather
    // than a generic question.
    for (const token of ['[role]', '[organisation]', '[hours]', '[priorities]']) {
      expect(config.recentAuditConfirm).toContain(token);
    }
  });

  it('footnote is character-identical to the §9 blockquote', () => {
    const headingLine = lineOf(/^## 9\. The summary footnote/);
    const sourceFootnote = firstQuoteAfter(headingLine);
    expect(config.footnote).toBe(sourceFootnote);
  });

  it('governing frame is character-identical to the §0 thesis blockquote', () => {
    const headingLine = lineOf(/^## 0\. The governing frame/);
    const sourceFrame = firstQuoteAfter(headingLine);
    expect(config.governingFrame).toBe(sourceFrame);
  });

  it('process outline is character-identical to the §4a blockquote (F6 t-1)', () => {
    const headingLine = lineOf(/^### 4a\. The process outline/);
    const sourceOutline = firstQuoteAfter(headingLine);
    expect(RECLAIM_PROCESS_OUTLINE).toBe(sourceOutline);
  });

  // F7 verbatim copy (Phases 4–6). `quoteContaining` finds the source blockquote by a distinctive
  // phrase — several F7 sections carry more than one blockquote, so "first after heading" isn't enough.
  const quoteContaining = (needle: string): string => {
    const match = quotes.map((q) => joinQuote(q.raw)).find((q) => q.includes(needle));
    if (!match) throw new Error(`no source blockquote contains: ${needle}`);
    return match;
  };

  it.each([
    [
      'under-delegation invitation',
      RECLAIM_UNDER_DELEGATION_INVITATION,
      'lead more through others',
    ],
    ['journey framing', RECLAIM_JOURNEY_FRAMING, 'compound into transformation'],
    ['forward-leaning close', RECLAIM_FORWARD_CLOSE, 'more true to what you are here to do'],
    ['closing affirmation', RECLAIM_CLOSING_AFFIRMATION, 'takes courage'],
    ['strategy mirror', RECLAIM_STRATEGY_MIRROR, 'If a stranger read your calendar'],
    ['Phase 2 coaching signal', RECLAIM_PHASE2_COACHING_SIGNAL, 'can go much further here'],
    // The six the conversational coach needs. Three were already extracted and simply had no
    // constant; three needed a blockquote adding, and the two Brief ones were the §6 coaching-craft
    // bullets, which `extractBlockquotes` never saw because bullets are not blockquotes. So "May I
    // offer a challenge?" — the tool's one licensed piece of directness — was guarded by nothing at
    // all until now.
    ['ideal-week framing', RECLAIM_IDEAL_WEEK_FRAMING, 'a realistic target, not a fantasy'],
    ['ideal-week challenge', RECLAIM_IDEAL_WEEK_CHALLENGE, 'suspiciously similar'],
    ['55+ hours note', RECLAIM_HOURS_55_NOTE, 'the most strategic thing a leader can do is stop'],
    ['permission challenge', RECLAIM_PERMISSION_CHALLENGE, 'May I offer a challenge?'],
    ['wanted, not dutiful', RECLAIM_WANTED_NOT_DUTIFUL, 'or something you think you should?'],
    ['action specificity', RECLAIM_ACTION_SPECIFICITY, 'non-negotiable deep work block'],
  ])('%s config default is character-identical to source (F7, I11)', (_name, constant, needle) => {
    expect(constant).toBe(quoteContaining(needle));
  });

  it('deep-work note is character-identical to the §2 blockquote', () => {
    const headingLine = lineOf(/^## 2\. Deep work — the cross-cutting note/);
    const sourceNote = firstQuoteAfter(headingLine);
    expect(config.deepWorkNote).toBe(sourceNote);
  });
});

describe('config defaults — structural fields (not blockquote-guarded, but pinned)', () => {
  it('carries the nine canonical bucket slugs, colours, and the one conditional bucket', () => {
    expect(config.buckets.map((b) => b.slug)).toEqual([
      'deep-work',
      'learning-development',
      'strategic-planning',
      'team-development',
      'organisational-oversight',
      'fundraising-capital',
      'relationship-building',
      'delivery-operations',
      'recovery-white-space',
    ]);
    for (const b of config.buckets) {
      expect(b.colour).toMatch(/^#[0-9A-F]{6}$/);
    }
    const conditional = config.buckets.filter((b) => b.conditional).map((b) => b.slug);
    expect(conditional).toEqual(['fundraising-capital']);
  });

  it('carries the three hour bands with the open-ended 55+ band', () => {
    expect(config.hourBands.map((b) => b.slug)).toEqual([
      'sustainable',
      'elevated',
      'unsustainable',
    ]);
    const unsustainable = config.hourBands.find((b) => b.slug === 'unsustainable');
    expect(unsustainable?.lowerHours).toBe(55);
    expect(unsustainable?.upperHours).toBeNull();
  });

  it('seeds the consultation email from §10', () => {
    expect(config.consultationEmail).toBe('rashmir@rashmir.net');
  });
});
