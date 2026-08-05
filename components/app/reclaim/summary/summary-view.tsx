'use client';

/**
 * The report (F7 t-4, §10) — the artifact the audit exists to produce.
 *
 * ## What changed when the public link went
 *
 * This began as "the summary": eight §10 fields, laid out. It carried no prose the leader wrote,
 * because the same object was served from an unauthenticated URL and anything a model wrote from
 * their words could travel there. So the artifact was a printout of nine numbers and a job title,
 * produced at the end of forty minutes of somebody being listened to.
 *
 * The link is gone (`share.ts`), a report agent reads the whole audit (`report/agent.ts`), and this
 * is where that lands: **a report with an arc**. The chapters, the gaps, the pathway and the closing
 * line are all its work, and all of them are optional, because a reading that was refused or never
 * generated must render as the shorter document it is, with no placeholder and no apology.
 *
 * ## The order is the argument
 *
 * Figures, then the reading of the figures (I12, applied to a page rather than a beat). A leader
 * meets their own week before anything interprets it, and the interpretation never appears above the
 * thing it interprets. The chosen action sits before the pathway for the same reason: they decided,
 * and the pathway exists so they can see past their own decision, not so the tool can propose a
 * better one (I16).
 *
 * ## Why it reads like paper
 *
 * Tracked uppercase eyebrows, hairline rules, a light display weight and a lot of margin. The
 * register is a printed document rather than a dashboard, because that is what it is: a thing to
 * keep, print, and hand to somebody. Everything is a semantic token, so the same document is a warm
 * near-white sheet in light mode and a lifted card in dark without a second set of rules.
 */

import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';
import { NO_VALUE } from '@/components/app/reclaim/format';
import { CHAPTER_TITLES } from '@/lib/app/programme/report/chapters';

/**
 * The audit's date, spelled out.
 *
 * `en-GB` explicitly rather than the reader's locale: this is a British product with one author, the
 * document is printed and posted and quoted, and a date that renders as 8/5/2026 in one place and
 * 5/8/2026 in another is a document that cannot be cited. A date that will not parse renders as
 * nothing at all, which is better than "Invalid Date" on somebody's report.
 */
function auditDate(iso: string): string | null {
  const on = new Date(iso);
  if (Number.isNaN(on.getTime())) return null;
  return on.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The tracked uppercase label above a section. One component so the tracking never drifts. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.22em] uppercase">
      {children}
    </p>
  );
}

/** A section heading in the document's display weight. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-foreground text-xl leading-snug font-light">{children}</h2>;
}

export function SummaryView({ summary }: { summary: AuditSummary }) {
  const heading = summary.firstName ? `${summary.firstName}'s time audit` : 'Your time audit';
  const sub = [summary.role, summary.orgType].filter(Boolean).join(' · ');
  const report = summary.report;
  const hasIdeal = summary.rows.some((r) => r.ideal !== null);

  return (
    <article className="mx-auto max-w-3xl">
      {/*
        The masthead. A rule under it rather than a box around it: the document should look like it
        was set, not like it was rendered into a card.
      */}
      <header className="border-border/70 border-b pb-8">
        <p className="text-primary text-[0.68rem] font-medium tracking-[0.24em] uppercase">
          Reclaim your week
        </p>
        <h1 className="text-foreground mt-3 text-[2rem] leading-[1.15] font-light sm:text-[2.6rem]">
          {heading}
        </h1>
        {(sub || summary.period) && (
          <p className="text-muted-foreground mt-3 text-sm">
            {sub}
            {sub && summary.period ? ' · ' : ''}
            {summary.period ? `audited over the ${summary.period}` : ''}
          </p>
        )}
        {/*
          The date, and it is not decoration. "Twelve hours in delivery" is a fact about one
          particular week: a report that does not say which week is a document quietly making a claim
          about now, months after it stopped being true.
        */}
        {auditDate(summary.auditedOn) !== null && (
          <p className="text-muted-foreground mt-1 text-sm">{auditDate(summary.auditedOn)}</p>
        )}
      </header>

      <div className="space-y-12 pt-10">
        {summary.priorities && (
          <section className="space-y-3">
            <Eyebrow>Priorities this year</Eyebrow>
            <p className="text-foreground text-[1.05rem] leading-relaxed font-light">
              {summary.priorities}
            </p>
          </section>
        )}

        <section className="space-y-4">
          <Eyebrow>Where the week went</Eyebrow>
          <ReclaimChart data={summary.current} />
        </section>

        {hasIdeal && (
          <section className="space-y-4">
            <SectionTitle>Now, and the week you wanted</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-left">
                    <th className="py-2 pr-4 text-[0.65rem] font-medium tracking-[0.14em] uppercase">
                      Area
                    </th>
                    <th className="py-2 pr-4 text-[0.65rem] font-medium tracking-[0.14em] uppercase">
                      Now
                    </th>
                    <th className="py-2 text-[0.65rem] font-medium tracking-[0.14em] uppercase">
                      Wanted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.token} className="border-border/50 border-b">
                      <td className="text-foreground py-2.5 pr-4">{r.title}</td>
                      <td className="text-muted-foreground py-2.5 pr-4 tabular-nums">
                        {r.current}h
                      </td>
                      <td className="text-foreground py-2.5 tabular-nums">
                        {r.ideal === null ? NO_VALUE : `${r.ideal}h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/*
          The arc, and the part of this document that is about a person rather than a week.

          Written by the report agent from everything the run recorded (`report/agent.ts`), which
          became possible only when the public link went. It sits **after** the figures (I12): a
          leader meets their own week before anything narrates it.

          The chapters arrive already in the product's order and their headings are the product's
          too (`CHAPTER_TITLES`), so a model cannot name a section of somebody's report. Set larger
          than the rest of the page, because it is the thing to read.
        */}
        {report != null &&
          report.chapters.map((chapter) => (
            <section key={chapter.section} className="space-y-4">
              <SectionTitle>{CHAPTER_TITLES[chapter.section]}</SectionTitle>
              <div className="space-y-4">
                {chapter.paragraphs.map((paragraph, index) => (
                  // Paragraphs carry no identity of their own, so the index is the key. The array is
                  // rendered whole and never sorted or filtered, which is what makes that safe.
                  <p
                    key={index}
                    className="text-foreground text-[1.05rem] leading-[1.75] font-light"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}

        {/*
          §10's "key gaps identified" (F14). A reading *of* the figures above, which is why it can
          never appear before them.
        */}
        {report != null && report.gaps.length > 0 && (
          <section className="space-y-4">
            <SectionTitle>What stands out</SectionTitle>
            <ul className="space-y-3">
              {report.gaps.map((gap) => (
                <li
                  key={gap.token}
                  className="border-border/70 text-foreground border-l-2 pl-4 leading-relaxed"
                >
                  {gap.observation}
                </li>
              ))}
            </ul>
          </section>
        )}

        {summary.action.chosen && (
          <section className="bg-muted rounded-2xl px-7 py-6">
            <Eyebrow>What you will start</Eyebrow>
            <p className="text-foreground mt-3 text-[1.35rem] leading-snug font-light">
              {summary.action.chosen}
            </p>
            {(summary.action.when || summary.action.howKnown) && (
              <dl className="border-border/60 mt-4 space-y-1.5 border-t pt-4 text-sm">
                {summary.action.when && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Starting:</dt>
                    <dd className="text-foreground">{summary.action.when}</dd>
                  </div>
                )}
                {summary.action.howKnown && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">You will know it worked when:</dt>
                    <dd className="text-foreground">{summary.action.howKnown}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
        )}

        {/*
          §10's "phased pathway forward". After the chosen action on purpose: the leader has already
          decided what they are starting, and this exists so they can see further than that one step.

          The horizons are labelled rather than numbered. "1, 2, 3" is a schedule someone is being
          held to; "now / next / later" is a shape, which is what a possibility should look like.
        */}
        {report != null && report.pathway.length > 0 && (
          <section className="space-y-4">
            <SectionTitle>One way this could go</SectionTitle>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Not a plan, and nothing here is owed. It is what a sequence could look like from where
              you are.
            </p>
            <ol className="mt-2 space-y-6">
              {report.pathway.map((step) => (
                <li key={step.horizon} className="grid gap-1 sm:grid-cols-[5.5rem_1fr] sm:gap-4">
                  <p className="text-primary pt-1 text-[0.65rem] font-medium tracking-[0.2em] uppercase">
                    {step.horizon}
                  </p>
                  <div>
                    <p className="text-foreground leading-relaxed">{step.step}</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      {step.difference}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* The last words, and deliberately without a heading: a closing line that announced itself
            would be a conclusion, which is the one thing this document does not draw. */}
        {report?.closing != null && (
          <p className="text-foreground border-border/70 border-t pt-8 text-[1.15rem] leading-relaxed font-light">
            {report.closing}
          </p>
        )}

        <footer className="border-border/70 space-y-4 border-t pt-6">
          {/*
            Where to take this next, on the artifact rather than only on the screen. Somebody reading
            their own report six months from now, deciding they want to talk to a person, should not
            have to find the app again to work out who. Operator-set, so it is read off the summary
            rather than hard-coded in two render surfaces.
          */}
          <p className="text-muted-foreground text-sm leading-relaxed">
            If you would like to take this further, Rashmir Balasubramaniam can be reached at{' '}
            <a
              href={`mailto:${summary.contactEmail}`}
              className="text-primary underline underline-offset-4"
            >
              {summary.contactEmail}
            </a>
            . The work is yours either way.
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">{summary.footnote}</p>
        </footer>
      </div>
    </article>
  );
}
