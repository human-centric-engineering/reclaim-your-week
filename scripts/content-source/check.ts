/**
 * Content-source verbatim check (invariant I11).
 *
 * Asserts that every blockquote in `.context/app/content-source.md` appears verbatim
 * in one of Rashmir's original documents in `.context/app/sources/`. Exits 1 on any
 * blockquote that does not.
 *
 * Why this exists: `content-source.md` is a working extract, not the authority. The
 * planned F2 guard compares that extract against `Module.config`, which proves the
 * code matches the extract and nothing about whether the extract matches Rashmir. On
 * 2026-07-23 a first run of this check found nine altered blockquotes, three of them
 * material, including Outlook export steps that appear in no source document. All
 * nine would have passed a config-only guard.
 *
 * Together the two checks give the full chain: sources/ → content-source.md → config.
 *
 * Tolerated, and nothing else:
 *   - editorial callouts, which open with a bolded lead-in and are not quotes
 *   - marked `[substitutions]`, the I1 re-point from first to third person
 *   - truncation marked with a trailing ellipsis
 *
 * Usage: `npm run leaf:content-diff` (leaf tier owns the `leaf:*` namespace).
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { logger } from '@/lib/logging';
import { checkContentSource, type Classified, type Verdict } from '@/scripts/content-source/lib';

const ROOT = process.cwd();
const SOURCES_DIR = path.join(ROOT, '.context/app/sources');
const CONTENT_SOURCE = path.join(ROOT, '.context/app/content-source.md');
const MANIFEST = path.join(SOURCES_DIR, 'CHECKSUMS.txt');
// The folder's own README documents the originals; it is not one of them.
const NOT_A_SOURCE = new Set(['README.md']);

/**
 * Assert the sources are still the bytes Rashmir sent.
 *
 * They are read-only, but nothing stops a formatter or a well-meaning edit from
 * rewriting them — a `prettier --write` over the whole tree nearly did on the day
 * they were checked in. Without this, such a change would silently move the
 * authority that every verbatim claim is measured against, and the diff below
 * would keep passing.
 */
function assertSourcesUnmodified(sources: Map<string, string>): boolean {
  const expected = new Map(
    readFileSync(MANIFEST, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [digest, ...name] = line.trim().split(/\s+/);
        return [name.join(' '), digest] as const;
      })
  );

  let ok = true;
  for (const [file, body] of sources) {
    const actual = createHash('sha256').update(body, 'utf8').digest('hex');
    if (expected.get(file) === actual) continue;
    ok = false;
    logger.error(
      expected.has(file)
        ? `  FAIL  ${file} has been modified since it was checked in`
        : `  FAIL  ${file} is not listed in CHECKSUMS.txt`
    );
  }
  for (const file of expected.keys()) {
    if (sources.has(file)) continue;
    ok = false;
    logger.error(`  FAIL  ${file} is in CHECKSUMS.txt but missing from the folder`);
  }
  if (ok) logger.info(`  OK    ${sources.size} source documents match CHECKSUMS.txt`);
  return ok;
}

function loadSources(): Map<string, string> {
  const sources = new Map<string, string>();
  for (const entry of readdirSync(SOURCES_DIR).sort()) {
    if (!entry.endsWith('.md') || NOT_A_SOURCE.has(entry)) continue;
    sources.set(entry, readFileSync(path.join(SOURCES_DIR, entry), 'utf8'));
  }
  return sources;
}

function tally(results: Classified[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = {
    exact: 0,
    editorial: 0,
    bracketed: 0,
    truncated: 0,
    altered: 0,
  };
  for (const result of results) counts[result.verdict] += 1;
  return counts;
}

function main(): void {
  logger.info('Content-source verbatim check (I11)...');

  const sources = loadSources();
  if (sources.size === 0) {
    logger.error(`  FAIL  No source documents found in ${path.relative(ROOT, SOURCES_DIR)}`);
    process.exit(1);
  }

  if (!assertSourcesUnmodified(sources)) {
    logger.error(
      'The source documents are the authority and must not be edited. Restore them, or if Rashmir sent a new version, regenerate CHECKSUMS.txt and reconcile content-source.md against it.'
    );
    process.exit(1);
  }

  const results = checkContentSource(readFileSync(CONTENT_SOURCE, 'utf8'), sources);
  const counts = tally(results);
  logger.info(`  Checked ${results.length} blockquotes against ${sources.size} source documents`);
  logger.info(
    `  exact ${counts.exact} · truncated ${counts.truncated} · bracketed ${counts.bracketed} · editorial ${counts.editorial}`
  );

  const altered = results.filter((result) => result.verdict === 'altered');
  if (altered.length === 0) {
    logger.info('  OK    Every blockquote appears verbatim in a source document.');
    process.exit(0);
  }

  for (const finding of altered) {
    logger.error(`  FAIL  content-source.md:${finding.line} is in no source document`);
    logger.error(`        QUOTED:  ${finding.text.slice(0, 240)}`);
    if (finding.nearest) {
      const { file, sentence, ratio } = finding.nearest;
      logger.error(`        NEAREST: ${sentence.slice(0, 240)}`);
      logger.error(`        (${Math.round(ratio * 100)}% overlap, ${file})`);
    }
  }
  logger.error(
    `${altered.length} of ${results.length} blockquotes are not verbatim. Correct them against .context/app/sources/ — never the other way round.`
  );
  process.exit(1);
}

main();
