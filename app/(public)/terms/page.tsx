import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * The terms (post-v1 P4).
 *
 * Replaces the Sunrise starter template's terms page, which was headed "Terms of Service for
 * Sunrise". Written to be readable, because these are the terms a leader accepts at the door before
 * an audit they were invited to — not a click-through on a purchase.
 *
 * Three clauses carry real weight in the build rather than boilerplate weight:
 *
 * - **What the audit is not** — it is not coaching, not advice, and not a substitute for judgement.
 *   That is I16 as a legal statement rather than a design one.
 * - **Aggregate use** — Brief §2 asks that the terms "allow for data to be used in aggregate", and
 *   F10 t-3's cross-client picture reads recorded consent as its lawful basis. The clause has to
 *   exist and has to be accurate about what is pooled.
 * - **Whose the method is** — the nine areas, the benchmarks and the diagnostic prose are Rashmir's
 *   IP. A leader gets their own results to use as they like; they do not get the framework.
 *
 * **The legal wording is not settled** (plan open item 7). This is accurate to the system and to the
 * intent, awaiting a lawyer's pass; `policyVersion` should be bumped when that lands, which re-asks
 * everyone.
 */

const description =
  'The terms for using Reclaim Your Week: what the audit is, what it is not, what happens to your results, and whose the method is.';

export const metadata: Metadata = {
  title: 'Terms',
  description,
  openGraph: { title: 'Terms — Reclaim Your Week', description, type: 'website' },
};

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border border-t py-12 sm:py-14">
      <div className="grid gap-x-14 gap-y-4 md:grid-cols-[14rem_1fr]">
        <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
          {title}
        </h2>
        <div className="text-muted-foreground max-w-2xl space-y-4 leading-relaxed font-light">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      <section className="pt-20 pb-16 sm:pt-28">
        <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">Terms</p>
        <h1 className="text-foreground mt-6 max-w-3xl text-4xl leading-[1.14] font-light text-balance">
          What you are agreeing to, in language you can actually read.
        </h1>
        <p className="text-muted-foreground mt-7 max-w-2xl text-lg leading-relaxed font-light">
          Short, because there is not much to agree to. You were invited, the audit is free, and
          what you get out of it is yours.
        </p>
        <div className="border-secondary bg-muted/60 mt-10 max-w-2xl rounded-lg border-l-2 p-6">
          <p className="text-secondary-foreground/90 text-sm leading-relaxed">
            <strong className="font-medium">A note on this version.</strong> These terms accurately
            describe how the audit works today. The final legal wording is being settled with{' '}
            {BRAND.legalName}&rsquo;s advisers, and you will be asked to accept the updated version
            when it is ready.
          </p>
        </div>
      </section>

      <Clause title="Who this is between">
        <p>
          You, and {BRAND.legalName}, which operates Reclaim Your Week on behalf of Rashmir
          Balasubramaniam&rsquo;s coaching practice.
        </p>
      </Clause>

      <Clause title="Getting in">
        <p>
          Access is by invitation. An invitation is for you, at the address it was sent to, and is
          not transferable — passing it on will not work, because access is checked against the
          person who accepted it.
        </p>
        <p>
          A standard invitation includes one complete audit. Some arrangements include repeat audits
          over a period; if that applies to you it was agreed with Rashmir directly and the audit
          knows about it.
        </p>
      </Clause>

      <Clause title="What the audit is, and what it is not">
        <p>
          It is a structured reflection. It asks questions, records what you say, draws it back to
          you, and asks what you notice.
        </p>
        <p>
          <strong className="text-foreground font-medium">
            It is not coaching, consultancy, financial, legal, medical or employment advice, and it
            is not a substitute for your own judgement.
          </strong>{' '}
          It does not tell you whether your week is good or bad, and it is not in a position to:
          only you know which of your hours were deliberate. Decisions you make afterwards are
          yours.
        </p>
        <p>
          The conversation is run by a large language model. It can be wrong, and it should not be
          treated as an authority. Where the audit quotes the framework it does so in
          Rashmir&rsquo;s own words; everything around that is generated.
        </p>
      </Clause>

      <Clause title="What you put in">
        <p>
          Be as honest as you find useful. Please do not enter anything about other people that they
          would not want recorded, and do not enter special-category information — health details,
          political or religious views, and the like. The audit does not ask for any and does not
          need it.
        </p>
        <p>
          You keep everything you contribute. Nothing you write becomes anyone else&rsquo;s property
          by being typed here.
        </p>
      </Clause>

      <Clause title="What you get out">
        <p>
          Your results are yours. Keep them, share them, act on them, publish them if you want to.
        </p>
        <p>
          Sharing is always your choice. A summary link is generated only if you ask for one;
          sending your result to Rashmir is a separate opt-in; and whether a comment you leave may
          be quoted anonymously is a third, asked separately from either.
        </p>
      </Clause>

      <Clause title="Anonymised patterns">
        <p>
          By accepting these terms you agree that your audit may contribute to anonymised patterns
          across everyone using it — how hours tend to distribute across the nine areas, and which
          areas are most often left empty.
        </p>
        <p>
          Only numbers and the fixed area names are pooled.{' '}
          <strong className="text-foreground font-medium">
            Nothing you have written in your own words is ever included
          </strong>
          , figures covering only a handful of people are withheld rather than shown, and you are
          never named. You can withdraw this at any time.
        </p>
      </Clause>

      <Clause title="Whose the method is">
        <p>
          The nine areas, the benchmark ranges, the phase structure and the diagnostic writing
          behind them are Rashmir Balasubramaniam&rsquo;s intellectual property. You are welcome to
          use them for your own leadership and to talk about what you learned.
        </p>
        <p>
          What you may not do is reproduce the framework as your own, build a competing assessment
          from it, or run it as a service for others. If you want to use it in your organisation
          beyond your own reflection, ask — the answer is often yes.
        </p>
      </Clause>

      <Clause title="Availability, and endings">
        <p>
          This is offered as it is, without a service-level promise. It may be unavailable at times,
          and features may change.
        </p>
        <p>
          You can stop using it and have everything deleted whenever you like — see{' '}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            the privacy notice
          </Link>
          . Access may be withdrawn if the terms above are broken, in which case you will be told
          why and can still ask for your data.
        </p>
        <p>
          To the extent the law allows, liability is limited to what you paid, which for an invited
          audit is nothing. Nothing here limits liability for death, personal injury, or fraud.
        </p>
      </Clause>

      <Clause title="Which law">
        <p>
          These terms are governed by the law of England and Wales, and its courts have
          jurisdiction.
        </p>
      </Clause>

      <section className="border-border border-t py-14">
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          See also{' '}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            the privacy notice
          </Link>
          , which says exactly what is recorded, who can see it, and how to have it deleted.
        </p>
      </section>
    </div>
  );
}
