/**
 * Pure logic for the content-source verbatim check (I11).
 *
 * `content-source.md` claims every blockquote in it is taken verbatim from one of
 * Rashmir's source documents in `.context/app/sources/`. This module decides, for
 * each blockquote, whether that claim holds.
 *
 * Kept free of filesystem I/O so it can be unit-tested; `check.ts` does the reading.
 */

/** A blockquote block lifted out of a markdown file. */
export interface QuoteBlock {
  /** 1-indexed line number of the block's first line. */
  line: number;
  /** Raw text with the `>` markers stripped, newlines preserved. */
  raw: string;
}

export type Verdict =
  /** Appears character-for-character in a source document. */
  | 'exact'
  /** An editorial callout written for this repo, not a quote. */
  | 'editorial'
  /** Verbatim apart from marked `[substitutions]` — the I1 re-point to third person. */
  | 'bracketed'
  /** A verbatim prefix, explicitly truncated with a trailing ellipsis. */
  | 'truncated'
  /** Present in no source document. A paraphrase, a synthesis, or invented. */
  | 'altered';

export interface Classified {
  line: number;
  verdict: Verdict;
  text: string;
  /** Populated for `altered` only: the nearest source sentence and its similarity. */
  nearest?: { file: string; sentence: string; ratio: number };
}

/**
 * Collapse the differences that are formatting rather than wording: smart quotes,
 * dash variants, markdown emphasis, and line wrapping. What survives is the words.
 */
export function normalise(input: string): string {
  const unified = input
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .replace(/—/g, '--');
  const unstyled = unified.replace(/\*\*|__|`/g, '').replace(/(?<!\w)_|_(?!\w)/g, '');
  return unstyled.replace(/\s+/g, ' ').trim();
}

/** Pull every contiguous run of `>` lines out of a markdown document. */
export function extractBlockquotes(markdown: string): QuoteBlock[] {
  const blocks: QuoteBlock[] = [];
  let current: string[] = [];
  let start: number | null = null;

  markdown.split('\n').forEach((line, index) => {
    if (line.startsWith('>')) {
      start ??= index + 1;
      current.push(line.replace(/^>\s?/, ''));
      return;
    }
    if (current.length > 0 && start !== null) {
      blocks.push({ line: start, raw: current.join('\n') });
    }
    current = [];
    start = null;
  });

  if (current.length > 0 && start !== null) {
    blocks.push({ line: start, raw: current.join('\n') });
  }
  return blocks;
}

/**
 * Editorial callouts open with a bolded lead-in (`**Drift correction (2026-07-23).**`).
 * That convention is what separates a note written here from a quote taken from Rashmir.
 */
export function isEditorial(raw: string): boolean {
  const first = raw.split('\n')[0]?.trimStart() ?? '';
  return first.startsWith('**') && /\.\*\*/.test(first);
}

/** Every fragment either side of a `[substitution]` must still appear in one source. */
function matchesWithSubstitutions(text: string, sources: Map<string, string>): boolean {
  const fragments = text
    .split(/\[[^\]]*\]/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 20);
  if (fragments.length === 0) return false;
  return [...sources.values()].some((source) =>
    fragments.every((fragment) => source.includes(fragment))
  );
}

function similarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === 0) return 1;
  // Cheap token-overlap score. Only ever used to point a human at the nearest
  // source line, never to decide a verdict.
  const bTokens = new Set(longer.split(' '));
  const shared = shorter.split(' ').filter((token) => bTokens.has(token)).length;
  return shared / Math.max(shorter.split(' ').length, 1);
}

function nearestSentence(
  text: string,
  sources: Map<string, string>
): { file: string; sentence: string; ratio: number } | undefined {
  let best: { file: string; sentence: string; ratio: number } | undefined;
  for (const [file, source] of sources) {
    for (const sentence of source.split(/(?<=[.?!"])\s+/)) {
      if (sentence.length < 25) continue;
      const ratio = similarity(text, sentence);
      if (!best || ratio > best.ratio) best = { file, sentence, ratio };
    }
  }
  return best;
}

/**
 * Classify one blockquote against the normalised source corpus.
 *
 * Order matters: `exact` is tested before the tolerances, so a passage that happens
 * to contain brackets is still reported as exact rather than excused as a substitution.
 */
export function classify(block: QuoteBlock, sources: Map<string, string>): Classified {
  const text = normalise(block.raw);
  const at = { line: block.line, text };

  if (isEditorial(block.raw)) return { ...at, verdict: 'editorial' };
  if ([...sources.values()].some((source) => source.includes(text))) {
    return { ...at, verdict: 'exact' };
  }

  const trimmed = text.replace(/[.…]+$/, '').trim();
  const lower = trimmed.toLowerCase();
  if ([...sources.values()].some((source) => source.toLowerCase().includes(lower))) {
    return { ...at, verdict: 'truncated' };
  }
  if (text.includes('[') && text.includes(']') && matchesWithSubstitutions(text, sources)) {
    return { ...at, verdict: 'bracketed' };
  }
  return { ...at, verdict: 'altered', nearest: nearestSentence(text, sources) };
}

/** Classify every blockquote in `content-source.md` against the source corpus. */
export function checkContentSource(
  contentSource: string,
  sources: Map<string, string>
): Classified[] {
  const normalisedSources = new Map(
    [...sources].map(([file, body]) => [file, normalise(body)] as const)
  );
  return extractBlockquotes(contentSource).map((block) => classify(block, normalisedSources));
}
