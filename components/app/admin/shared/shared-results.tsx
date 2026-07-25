'use client';

/**
 * Shared results and the anonymised picture (F10 t-3).
 *
 * The two halves are shown as two different kinds of thing, on purpose. The inbox names people
 * because each of them chose to send their result. The aggregate names nobody, covers only leaders
 * who accepted terms permitting aggregate use, and says so on the page — a figure whose population is
 * invisible invites the reader to assume it covers everyone.
 *
 * Suppressed cells say why they are suppressed. "—" would read as "nobody does this", which is the
 * opposite of "too few people for us to say".
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FieldHelp } from '@/components/ui/field-help';
import { readInbox, type InboxView } from '@/components/app/admin/actions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function SharedResults() {
  const [view, setView] = useState<InboxView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readInbox()
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="text-destructive text-sm">We could not load the shared results.</p>;
  }
  if (view === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const { shared, aggregate } = view;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Shared with you</h2>
        {shared.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody has shared a result yet. Sharing is offered at the end of an audit and never
            required, so an empty list here is a normal outcome rather than a problem.
          </p>
        ) : (
          <ul className="space-y-3">
            {shared.map((entry) => (
              <li key={`${entry.userId}-${entry.auditRunId}`} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/programme/clients/${entry.userId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {entry.name ?? entry.email}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {entry.quarter !== null && `${entry.quarter} · `}shared{' '}
                    {formatDate(entry.sharedAt)}
                  </span>
                </div>
                {entry.feedback !== null && (
                  <blockquote className="mt-2 border-l-2 pl-3 text-sm italic">
                    {entry.feedback.text}
                    <footer className="text-muted-foreground mt-1 text-xs not-italic">
                      {entry.feedback.quoteConsent
                        ? 'Happy to be quoted anonymously'
                        : 'Not for quoting'}
                    </footer>
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-medium">The anonymised picture</h2>
          <FieldHelp title="Who is in this picture">
            <p>
              Only leaders who accepted terms that allow their data to be used in aggregate, and
              only those who <strong>finished</strong> an audit. Nobody is named, and no written
              answer is ever included — these are hours and bucket names only.
            </p>
            <p>
              Figures covering fewer than {aggregate.minimumCohort} leaders are withheld rather than
              rounded. With a small group, an average can identify the person it is averaging.
            </p>
          </FieldHelp>
        </div>

        {aggregate.suppressed ? (
          <p className="text-muted-foreground text-sm">
            {aggregate.cohort === 0
              ? 'No completed audits from leaders who consented to aggregate use yet.'
              : `Only ${aggregate.cohort} ${aggregate.cohort === 1 ? 'leader has' : 'leaders have'} completed an audit under terms allowing aggregate use. Figures start once there are ${aggregate.minimumCohort}, so that no average can point at one person.`}
          </p>
        ) : (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              Across {aggregate.cohort} leaders who completed an audit and consented to aggregate
              use.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-muted-foreground border-b text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Bucket</th>
                    <th className="py-2 pr-4 font-medium">Leaders reporting time</th>
                    <th className="py-2 pr-4 font-medium">Median hours a week</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregate.buckets.map((bucket) => (
                    <tr key={bucket.bucketSlug} className="border-b last:border-0">
                      <td className="py-2 pr-4">{bucket.title}</td>
                      <td className="text-muted-foreground py-2 pr-4 tabular-nums">
                        {bucket.leaders ?? 'withheld'}
                      </td>
                      <td className="text-muted-foreground py-2 pr-4 tabular-nums">
                        {bucket.suppressed ? (
                          <span title="Too few leaders to report without identifying them">
                            withheld
                          </span>
                        ) : (
                          bucket.medianHours
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {aggregate.mostOftenEmpty.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Most often left at zero</h3>
                <p className="text-muted-foreground text-sm">
                  Buckets these leaders reported no time in at all. It is a count of empty buckets,
                  not a claim about what they wanted their week to look like.
                </p>
                <ul className="text-muted-foreground text-sm">
                  {aggregate.mostOftenEmpty.map((entry) => (
                    <li key={entry.bucketSlug}>
                      {entry.title} — {entry.leaders} leaders
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
