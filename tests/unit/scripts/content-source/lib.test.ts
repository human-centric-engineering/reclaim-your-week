/**
 * Tests: content-source verbatim checker (invariant I11)
 *
 * This checker is the mechanical half of I11. Its job is to catch a paraphrase
 * that reads as well as the original, which is the failure mode a human review
 * reliably misses — on 2026-07-23 nine altered blockquotes had survived one.
 *
 * The tests that matter are the ones proving it does not wave things through:
 * a reordered phrase, an added qualifier, a swapped noun. Tolerances exist for
 * marked substitutions and marked truncation, and each is tested for its bound
 * as well as its behaviour.
 *
 * @see scripts/content-source/lib.ts
 */

import { describe, it, expect } from 'vitest';

import {
  checkContentSource,
  classify,
  extractBlockquotes,
  isEditorial,
  normalise,
  parseChecksumManifest,
  verifyChecksums,
  type Verdict,
} from '@/scripts/content-source/lib';

const SOURCE_TEXT = `# Time Audit Tool: System Prompt

**2. Learning & development**
Reading, courses, self-development and time with mentors, coaches and advisors. Research suggests a minimum of 2-3 hours per week (approx. 5% of working time) for sustained leadership effectiveness. This is usually the first thing to disappear under pressure.

Your role is to guide the leader through an honest, reflective conversation about how they are currently spending their time.

For leaders running at 55+ hours, name the hours question clearly: the goal is not just to reallocate time but to reclaim a sustainable way of working. Sometimes the most strategic thing a leader can do is stop.

Ask: "Does this look right? Anything you would move to a different category?"
`;

const sources = (): Map<string, string> => new Map([['prompt.md', SOURCE_TEXT]]);

/**
 * Classify one blockquote's text. `classify` receives the block with its `>`
 * markers already stripped by `extractBlockquotes`, so this passes text as-is.
 */
const verdictOf = (text: string): Verdict =>
  classify({ line: 1, raw: text }, new Map([['prompt.md', normalise(SOURCE_TEXT)]])).verdict;

describe('parseChecksumManifest', () => {
  it('parses shasum output into filename -> digest', () => {
    const manifest = parseChecksumManifest('abc123  Brief.md\ndef456  Prompt_Text.md\n');
    expect(manifest.get('Brief.md')).toBe('abc123');
    expect(manifest.get('Prompt_Text.md')).toBe('def456');
  });

  it('keeps filenames containing spaces intact', () => {
    // The originals arrived in a folder named "Time Audit Markdown"; spaces are realistic.
    expect(parseChecksumManifest('abc123  Time Audit Notes.md').get('Time Audit Notes.md')).toBe(
      'abc123'
    );
  });

  it('ignores blank lines rather than emitting an empty-named entry', () => {
    expect(parseChecksumManifest('abc123  a.md\n\n   \ndef456  b.md\n').size).toBe(2);
  });
});

describe('verifyChecksums', () => {
  const manifest = new Map([
    ['a.md', 'aaa'],
    ['b.md', 'bbb'],
  ]);

  it('passes when every digest matches', () => {
    expect(
      verifyChecksums(
        new Map([
          ['a.md', 'aaa'],
          ['b.md', 'bbb'],
        ]),
        manifest
      )
    ).toEqual([]);
  });

  it('catches an edited source — the case the manifest exists for', () => {
    expect(
      verifyChecksums(
        new Map([
          ['a.md', 'CHANGED'],
          ['b.md', 'bbb'],
        ]),
        manifest
      )
    ).toEqual([{ file: 'a.md', fault: 'modified' }]);
  });

  it('catches a source added without being recorded', () => {
    const digests = new Map([
      ['a.md', 'aaa'],
      ['b.md', 'bbb'],
      ['c.md', 'ccc'],
    ]);
    expect(verifyChecksums(digests, manifest)).toEqual([{ file: 'c.md', fault: 'unlisted' }]);
  });

  it('catches a source deleted from the folder', () => {
    // Checking only files-on-disk would miss this entirely.
    expect(verifyChecksums(new Map([['a.md', 'aaa']]), manifest)).toEqual([
      { file: 'b.md', fault: 'missing' },
    ]);
  });

  it('reports every fault in one pass rather than stopping at the first', () => {
    const digests = new Map([
      ['a.md', 'CHANGED'],
      ['c.md', 'ccc'],
    ]);
    expect(verifyChecksums(digests, manifest)).toEqual([
      { file: 'a.md', fault: 'modified' },
      { file: 'c.md', fault: 'unlisted' },
      { file: 'b.md', fault: 'missing' },
    ]);
  });

  it('fails closed when the manifest is empty — no manifest is not a pass', () => {
    expect(verifyChecksums(new Map([['a.md', 'aaa']]), new Map())).toEqual([
      { file: 'a.md', fault: 'unlisted' },
    ]);
  });
});

describe('normalise', () => {
  it('collapses line wrapping so a rewrapped quote still matches its source', () => {
    expect(normalise('Reading, courses,\nself-development and time')).toBe(
      'Reading, courses, self-development and time'
    );
  });

  it('unifies smart quotes and dashes, which differ by editor rather than by author', () => {
    expect(normalise('“Does this look right?”')).toBe('"Does this look right?"');
    expect(normalise('a – b')).toBe('a - b');
  });

  it('strips markdown emphasis so bolding a phrase for scanning is not a content change', () => {
    expect(normalise('the corrected **composite** picture')).toBe(
      'the corrected composite picture'
    );
  });

  it('leaves words alone — it must not normalise away a genuine difference', () => {
    expect(normalise('writing, and IP creation')).not.toBe(normalise('writing, and creating IP'));
  });
});

describe('extractBlockquotes', () => {
  it('captures each contiguous run of quoted lines with its starting line number', () => {
    const blocks = extractBlockquotes(
      ['intro', '> one', '> two', '', 'prose', '> three'].join('\n')
    );
    expect(blocks).toEqual([
      { line: 2, raw: 'one\ntwo' },
      { line: 6, raw: 'three' },
    ]);
  });

  it('captures a block that runs to the end of the file', () => {
    expect(extractBlockquotes('text\n> last')).toEqual([{ line: 2, raw: 'last' }]);
  });

  it('ignores prose, so only quoted material is ever held to the verbatim bar', () => {
    expect(extractBlockquotes('no quotes here\nat all')).toEqual([]);
  });
});

describe('isEditorial', () => {
  it('recognises the bolded lead-in convention used for repo notes', () => {
    expect(isEditorial('**Drift correction (2026-07-23).** Nine blockquotes had drifted.')).toBe(
      true
    );
  });

  it('does not excuse a quote that merely contains bold', () => {
    expect(isEditorial('Reading, courses, **self-development** and time with mentors.')).toBe(
      false
    );
  });
});

describe('classify', () => {
  it('passes a quote that appears verbatim in a source document', () => {
    expect(verdictOf('This is usually the first thing to disappear under pressure.')).toBe('exact');
  });

  it('passes a verbatim quote that has been rewrapped and emphasised', () => {
    expect(
      verdictOf(
        'Research suggests a minimum of **2-3 hours**\nper week (approx. 5% of\nworking time)'
      )
    ).toBe('exact');
  });

  describe('catches paraphrase — the whole point of the check', () => {
    it('flags a reordered phrase that reads identically', () => {
      // "IP creation" -> "creating IP": the plausible rewording I11 warns tests will miss.
      expect(
        verdictOf('Reading, courses, self-development and time with coaches, mentors and advisors.')
      ).toBe('altered');
    });

    it('flags an added qualifier', () => {
      expect(verdictOf('This is usually the very first thing to disappear under pressure.')).toBe(
        'altered'
      );
    });

    it('flags a synthesis presented as a quote', () => {
      // The real 55-hours drift: source sentence extended with invented clause.
      expect(
        verdictOf(
          'Sometimes the most strategic thing a leader can do is stop, reclaiming sustainable hours, not just redistributing the ones they have.'
        )
      ).toBe('altered');
    });

    it('flags a dropped clause that changes what is being asked', () => {
      // The real categorisation-review drift: "to a different category" removed.
      expect(verdictOf('"Does this look right? Anything you would move?"')).toBe('altered');
    });

    it('flags text invented wholesale', () => {
      expect(
        verdictOf('Go to File, then Save Calendar, and set the detail level to Full Details.')
      ).toBe('altered');
    });
  });

  describe('tolerances', () => {
    it('accepts a marked [substitution], the I1 re-point to third person', () => {
      expect(
        verdictOf(
          '[The tool guides] the leader through an honest, reflective conversation about how they are currently spending their time.'
        )
      ).toBe('bracketed');
    });

    it('does not let brackets launder a paraphrase in the unbracketed text', () => {
      expect(
        verdictOf(
          '[The tool guides] the leader through an honest, thoughtful discussion about how they are currently using their time.'
        )
      ).toBe('altered');
    });

    it('accepts truncation marked with an ellipsis', () => {
      expect(verdictOf('Reading, courses, self-development and time with mentors, coaches…')).toBe(
        'truncated'
      );
    });

    it('treats an editorial callout as a note rather than a quote', () => {
      expect(verdictOf('**Coverage note (2026-07-23).** Sections were added later.')).toBe(
        'editorial'
      );
    });
  });

  it('reports the nearest source sentence so a failure is actionable', () => {
    const result = classify(
      { line: 42, raw: 'Sometimes the most strategic thing a leader can do is pause.' },
      new Map([['prompt.md', normalise(SOURCE_TEXT)]])
    );
    expect(result.verdict).toBe('altered');
    expect(result.nearest?.file).toBe('prompt.md');
    expect(result.nearest?.sentence).toContain('Sometimes the most strategic thing');
  });
});

describe('checkContentSource', () => {
  it('classifies every blockquote and preserves line numbers for reporting', () => {
    const doc = [
      '# Extract',
      '',
      '> This is usually the first thing to disappear under pressure.',
      '',
      '> This is usually the first thing to vanish under pressure.',
    ].join('\n');

    expect(checkContentSource(doc, sources()).map((r) => [r.line, r.verdict])).toEqual([
      [3, 'exact'],
      [5, 'altered'],
    ]);
  });

  it('returns nothing to fail on a document with no quotes', () => {
    expect(checkContentSource('# Extract\n\nProse only.', sources())).toEqual([]);
  });
});
