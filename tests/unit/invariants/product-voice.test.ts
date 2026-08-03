/**
 * I1 + I2 over the copy the **app** authors, not just the agent (plan.md open item 8, decided
 * 2026-07-26).
 *
 * `voice.test.ts` guards four fields of `reclaimCoachAgent`. That was the whole of the enforcement
 * for ten features, and the consequence was visible on screen: the coach never used an em dash while
 * the interface around it used one every other paragraph, and a leader reads one screen rather than
 * two sources. I2 now binds coach-voiced product copy too, and this is what says so.
 *
 * ## Why an explicit file list, and why the completeness assertion is the point
 *
 * Every alternative rots. A marker comment gets copy-pasted without thought. A directory rule cannot
 * express that `signposts.ts` in `lib/` is coach voice while `actions.ts` next door is plumbing. An
 * allowlist of known violations only ever grows.
 *
 * So: two lists, and an assertion that their union is exactly what is on disk. A new component fails
 * this suite until somebody classifies it, and the failure message tells them what the two lists
 * mean. It is brittle in the one direction that helps.
 *
 * ## What is deliberately not checked here
 *
 * - **`lib/app/programme/content.ts`** — Rashmir's verbatim content, nineteen em dashes and all.
 *   I11 outranks I2; paraphrasing to satisfy a formatting rule is the drift the content chain exists
 *   to prevent.
 * - **"We" as vendor-we vs inclusive-we** — a judgement no regex makes. Specification, enforced by
 *   review (I1).
 * - **System and error strings** — exempt by I1's rule 3. They live in files that are otherwise
 *   coach-voiced, so this guard checks the file and trusts the rules that no error string carries an
 *   em dash or a banned term. In practice none does.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { EM_DASH, FIRST_PERSON_RASHMIR, stripComments } from '@/tests/helpers/voice-rules';

const RECLAIM_COMPONENTS = 'components/app/reclaim';

/**
 * The app's own email templates, added post-v1.
 *
 * They were outside this guard for ten features, and the cost was found rather than reasoned about:
 * the platform's stock `welcome` email went to every account ever created, telling leaders that
 * Reclaim Your Week "is your production-ready Next.js starter template designed for rapid application
 * development". Nothing caught it, because an email is the one surface nobody on the build ever reads.
 *
 * An email is coach voice by any reading of I1 — it is the product speaking to a leader, in prose, at
 * a moment they are paying attention. The only reason it was not covered is that the original list
 * was drawn by directory.
 */
const RECLAIM_EMAILS = 'components/app/emails';

/** Both trees the completeness assertion below holds to account. */
const GUARDED_DIRS = [RECLAIM_COMPONENTS, RECLAIM_EMAILS];

/**
 * Copy a leader reads in the coach's voice. Everything the audit says to them, in other words,
 * wherever it happens to live.
 */
const COACH_VOICED = [
  // F11. The claim page for a group invite link is the FIRST thing a leader ever reads of this
  // product — before an account, before consent, standing in a room with a phone. If any screen is
  // coach voice, it is this one.
  'components/app/reclaim/access/join-form.tsx',
  // The leader's own menu in the programme bar. Short strings, and one of them is how the product
  // refers to the audits somebody has made of their working life, so it is the product speaking.
  'components/app/reclaim/account-menu.tsx',
  // The two account screens, once they joined the audit's frame and stopped being Sunrise's. They are
  // the product talking about somebody's own record of themselves, and one of them has to say what
  // closing an account does to their audits, which is the most consequential sentence on either.
  'components/app/reclaim/account/account-settings.tsx',
  'components/app/reclaim/account/profile-view.tsx',
  'components/app/reclaim/begin-audit.tsx',
  'components/app/reclaim/calendar/calendar-branch.tsx',
  'components/app/reclaim/calendar/calendar-entry.tsx',
  'components/app/reclaim/calendar/calendar-review.tsx',
  'components/app/reclaim/calendar/calendar-upload.tsx',
  // The three charts. Each one's headings, subtitles, keys and delta labels are the product telling a
  // leader what they are looking at ("How far your ideal week sits from the week you have now"), which
  // is prose whatever else a chart is. The palette beside them is not, and stays in the list below.
  'components/app/reclaim/chart/gap-chart.tsx',
  'components/app/reclaim/chart/ideal-week-chart.tsx',
  'components/app/reclaim/chart/reclaim-chart.tsx',
  'components/app/reclaim/coach-chat.tsx',
  // The conversational phase surface. The panel speaks to the leader about their own answers ("Taken
  // from what you said. Have we got it right?"), which is as much coach voice as a phase panel is.
  'components/app/reclaim/coach/captured-panel.tsx',
  // The composer, for a question whose answers are a fixed set. Every word in it is read at the
  // moment a leader is deciding what to say, including the line that tells them the set is an offer
  // rather than a limit, which is the sentence that keeps the choice open.
  'components/app/reclaim/coach/choice-composer.tsx',
  'components/app/reclaim/coach/phase-conversation.tsx',
  // What a leader is told the coach is doing while a turn runs. Four short strings, and every one of
  // them is the tool speaking about itself mid-conversation, which is exactly where I1's "never in
  // the first person" is easiest to break.
  'components/app/reclaim/coach/status.ts',
  // Reading the transcript and drawing a turn. No copy of its own — it renders the coach's words and
  // the leader's — but it is the coach speaking on screen, and a stray label added here would be too.
  'components/app/reclaim/coach/transcript.tsx',
  'components/app/reclaim/consent-gate.tsx',
  // The audit history. Everything a leader reads about their own past audits: the list, the link into
  // it from the entry screen, and a finished audit opened again. Prose about their working life, at a
  // moment they are deciding whether to do this a second time, so it is coach voice throughout.
  'components/app/reclaim/history/audit-history.tsx',
  'components/app/reclaim/history/history-link.tsx',
  'components/app/reclaim/history/run-review.tsx',
  'components/app/reclaim/phase-rail.tsx',
  // A completed phase, opened again from the spine. It tells the leader what this screen is and what
  // it will not do to their audit, in prose, so it is coach voice by the same reading as the panels.
  'components/app/reclaim/phase-review.tsx',
  'components/app/reclaim/phase/advance-controls.tsx',
  'components/app/reclaim/phase/fields.tsx',
  'components/app/reclaim/phase/phase1-panel.tsx',
  'components/app/reclaim/phase/phase2-panel.tsx',
  'components/app/reclaim/phase/phase3-panel.tsx',
  'components/app/reclaim/phase/phase4-panel.tsx',
  'components/app/reclaim/phase/phase5-panel.tsx',
  'components/app/reclaim/phase/phase6-panel.tsx',
  'components/app/reclaim/phase/reflection.tsx',
  'components/app/reclaim/phase/setup-panel.tsx',
  // The bar the full-screen frame carries, and the rail along the bottom. Between them they hold
  // every word that is on screen no matter which part of the audit is open, which is the strongest
  // reason to guard them: nothing else is read as often.
  'components/app/reclaim/programme-chrome.tsx',
  'components/app/reclaim/programme-footer.tsx',
  'components/app/reclaim/programme-shell.tsx',
  // Two words and an icon, both of which the leader reads as the product describing a choice.
  'components/app/reclaim/theme-switch.tsx',
  'components/app/reclaim/referral-invite.tsx',
  'components/app/reclaim/repeat/comparison.tsx',
  'components/app/reclaim/repeat/trend-lines.tsx',
  'components/app/reclaim/signpost.tsx',
  'components/app/reclaim/summary/shared-summary.tsx',
  'components/app/reclaim/summary/summary-view.tsx',
  // Coach voice that does not live under `components/`. The server writes the phase signposts — the
  // agent's own orienting job, done server-side — so a directory rule would have missed them.
  'lib/app/programme/runs/signposts.ts',
  // The categoriser's prompt, whose `reasoning` output renders to the leader in `calendar-review`.
  'lib/app/programme/calendar/categorise.ts',
  // The per-turn instructions the coach reads. Not copy a leader sees, and in scope anyway: a model
  // writes like the context it is given, so an em dash or a banned term here comes back out in the
  // conversation. Rashmir's verbatim content reaches this file as imported constants, never as
  // literal text, so the zero-tolerance rule can stay bare here too.
  'lib/app/programme/coach/phase-context.ts',
  // The trigger that makes the coach speak first. It is persisted as a message and stays in the
  // model's history for the whole run, so it is read every turn by the thing whose voice this guard
  // protects — the strongest case in this list for a file no leader ever sees.
  'lib/app/programme/coach/opening.ts',
  // F19. The canned analyst reading a fabricated preview audit carries. It renders in the summary and
  // in the PDF, in the analyst's own section, so somebody walking a test account reads it exactly where
  // a leader reads the real thing — and the point of walking a test account is to judge how the screen
  // reads. Prose that failed I2 here would be prose nobody could tell apart from a real reading.
  'lib/app/programme/preview/fixtures.ts',
  // F19. The coach's own turns in a fabricated transcript. A tester reads these in the chat panel in
  // exactly the position the real coach's words occupy, and an operator reads them again in the admin
  // transcript view. If any prose in this repo is coach voice, it is the prose written as the coach.
  'lib/app/programme/preview/conversation.ts',
  // F19. The leader's side of a fabricated audit. Not coach voice by authorship, and held to the same
  // rules anyway for two reasons: it renders inside the phase panels beside copy that is, and it sits
  // in the transcript one line above coach turns. A banned term or an em dash reads as the product's
  // wherever it lands, and nobody looking at the screen is checking who typed which line.
  'lib/app/programme/preview/answers.ts',
  // The three emails the app authors. `welcome.tsx` is here because its absence had a cost; the other
  // two were already clean, which is luck rather than enforcement, and this is what ends the luck.
  'components/app/emails/invitation.tsx',
  'components/app/emails/quarterly-nudge.tsx',
  'components/app/emails/welcome.tsx',
  // F15. The one message a finished audit sends. Most of its design is what it does not say, and
  // the voice rules are the half a guard can hold.
  'components/app/emails/audit-complete.tsx',
  // F18 t-2. The envelope around a message Rashmir wrote herself. Her body is hers and is not
  // scanned by anything — she is a person writing to a person — but every word this file authors
  // around it is the product speaking to a leader, and the frame is where a stray "we" would land.
  'components/app/emails/coach-message.tsx',
  // F15. The PDF is the artifact a leader keeps and may hand to someone else, so it is the single
  // most durable thing the product says in its own voice. Its headings ("Where the week went", "One
  // way this could go") and its one framing sentence are authored here rather than passed in.
  'components/app/reclaim/report/summary-pdf-document.tsx',
  // F15. Four words on a control, and they are still four words a leader reads.
  'components/app/reclaim/report/download-report.tsx',
];

/** Plumbing: fetchers, types, palettes, pure arithmetic. Nothing here reaches a leader as prose. */
const NOT_COACH_VOICED = [
  'components/app/reclaim/access/actions.ts',
  'components/app/reclaim/calendar/types.ts',
  'components/app/reclaim/chart/palette.ts',
  // Validating the offer off the stream. It draws nothing and says nothing; the answers it carries
  // were authored server-side and are guarded where they live.
  'components/app/reclaim/coach/choices.ts',
  'components/app/reclaim/format.ts',
  'components/app/reclaim/history/actions.ts',
  'components/app/reclaim/phase/actions.ts',
  'components/app/reclaim/phase/config.ts',
  'components/app/reclaim/phase/hours.ts',
  'components/app/reclaim/repeat/actions.ts',
  'components/app/reclaim/summary/types.ts',
  'components/app/reclaim/types.ts',
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const read = (path: string): string => stripComments(readFileSync(path, 'utf8'));

describe('every reclaim component is classified', () => {
  it('leaves no file unclassified, so a new screen cannot join the product unguarded', () => {
    const onDisk = GUARDED_DIRS.flatMap((dir) => walk(dir)).sort();
    const classified = [...COACH_VOICED, ...NOT_COACH_VOICED]
      .filter((p) => GUARDED_DIRS.some((dir) => p.startsWith(dir)))
      .sort();
    // If this fails, add the new file to COACH_VOICED if a leader reads prose from it, or to
    // NOT_COACH_VOICED if it is plumbing. Do not delete the assertion.
    expect(classified).toEqual(onDisk);
  });

  it('classifies each file exactly once', () => {
    const both = COACH_VOICED.filter((p) => NOT_COACH_VOICED.includes(p));
    expect(both).toEqual([]);
  });
});

describe('I2 — no em dash in coach-voiced copy', () => {
  it.each(COACH_VOICED)('%s contains no U+2014', (path) => {
    // Zero tolerance, no allowlist. `—` used as a null placeholder lives in one shared constant
    // using an en dash, precisely so this assertion can stay bare.
    expect(read(path)).not.toContain(EM_DASH);
  });
});

describe('I2 — banned lexicon in coach-voiced copy', () => {
  it.each(COACH_VOICED)('%s uses none of the banned terms', (path) => {
    const lower = read(path).toLowerCase();
    const hits = RECLAIM_BANNED_LEXICON.filter((term) => lower.includes(term.toLowerCase()));
    expect(hits).toEqual([]);
  });
});

describe('I1 — the tool is not Rashmir, and is never the model', () => {
  it.each(COACH_VOICED)('%s carries no first-person-as-Rashmir construction', (path) => {
    const source = read(path);
    for (const re of FIRST_PERSON_RASHMIR) expect(source).not.toMatch(re);
  });

  it.each(COACH_VOICED)('%s never attributes the tool to Claude or Anthropic', (path) => {
    const source = read(path);
    expect(source).not.toMatch(/\bClaude\b/i);
    expect(source).not.toMatch(/\bAnthropic\b/i);
  });
});

/**
 * Open item 11, decided: the Phase 2 coaching signal is not shown to leaders.
 *
 * Rashmir's sentence stays in `content.ts`, still guarded character-identical, because deciding
 * against rendering it is not a reason to lose her material. What must not come back is the render:
 * the string is facilitator instruction voice ("signal that a dedicated coaching conversation with
 * Rashmir can go much further here"), so a leader reading it reads a leaked prompt. This is the
 * assertion a future session hits when it tries to helpfully wire the unused constant back up.
 */
describe('open item 11 — the Phase 2 coaching signal reaches no leader', () => {
  it('is rendered by no component, and injected by no prompt', () => {
    // **The coach half of this guard was missing.** It searched `components/` only, on the reading
    // that "reaches a leader" means "appears on a screen". Since the audit became a conversation
    // there is a second way to a leader's eyes: the phase context, whose strings the model speaks
    // aloud. A session wiring the unused constant into `phase-context.ts` — an obvious thing to try
    // while giving phase 2 a method — would have passed every check in this file. Found while
    // writing that method.
    const users = [...walk('components'), ...walk('lib/app/programme/coach')]
      .filter((p) => /\.tsx?$/.test(p))
      // Comments stripped: `phase2-panel.tsx` names the constant in its docblock to explain why it
      // is not rendered, and that explanation is the opposite of the problem.
      .filter((p) => read(p).includes('RECLAIM_PHASE2_COACHING_SIGNAL'));
    expect(users).toEqual([]);
  });

  it('has no config toggle that could bring it back', () => {
    const schema = readFileSync('lib/app/programme/module.ts', 'utf8');
    expect(stripComments(schema)).not.toContain('phase2CoachingSignal');
  });
});
