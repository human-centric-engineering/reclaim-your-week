import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * The privacy notice (post-v1 P4).
 *
 * ## This replaces a page documented in-file as "Placeholder privacy policy page"
 *
 * Which mattered more than a placeholder normally would, for two reasons. It is the page the
 * **consent gate links leaders to** before they can start an audit (F8 t-4), and F10 t-3's anonymised
 * cross-client aggregate rests its **lawful basis** on consent recorded against a policy version. A
 * placeholder was standing in for both.
 *
 * ## What is authoritative here, and what is not
 *
 * **Every factual statement below is accurate to the implementation** and was written against it, not
 * around it: the slot store, the erasure cascades, the calendar path, the model provider, the share
 * tokens, the retention asymmetry on consent records. Where the build does something unusual — a
 * calendar that is never stored, a consent record that deliberately outlives the account — it is
 * stated rather than glossed.
 *
 * **The legal wording is not settled.** Rashmir's privacy and IP clauses are open item 7 in the plan;
 * this is an accurate description of the system awaiting a lawyer's pass, and `policyVersion` in
 * `Module.config` should be bumped from `draft-1` when that lands, which re-asks everyone for consent.
 * That is the mechanism working, not a nuisance.
 *
 * The controller name comes from `BRAND.legalName` (`NEXT_PUBLIC_LEGAL_NAME`), which must be set to
 * **Nsansa Ltd** — the entity named in the copyright line of the source content
 * ("© Rashmir Balasubramaniam / Nsansa Ltd"). Left unset it falls back to the product name, which
 * would put a product rather than a legal person in the controller field. See [[operations]].
 */

/**
 * The model vendor named to users, in one place because it is a **factual claim about where personal
 * data goes** and a privacy notice that names the wrong processor is worse than one that names none.
 *
 * **Currently OpenAI, for the testing phase only — this must revert to Anthropic before launch.**
 *
 * Brief §3 is an explicit client constraint, not a default: "Claude only. The AI behind this should
 * be Claude (Anthropic API), not ChatGPT, and users do not get a choice", on the grounds that testers
 * reported a noticeably better coaching experience with Claude. Brief §8 restates it as "the one
 * constraint that the AI layer is Anthropic/Claude". Nothing in the code enforces it: the coach agent
 * seeds with `provider: ''` and resolves dynamically, so the layer follows whichever provider is
 * configured and swapping it is an environment change with no diff.
 *
 * That is exactly why this constant exists rather than the vendor being inlined below. The revert is
 * one line, it is on the before-launch list in [[operations]], and if it is ever wrong the page tells
 * a leader their data goes somewhere it does not.
 */
const MODEL_VENDOR = 'OpenAI';

const description =
  'What Reclaim Your Week records about you, what it never records, who can see it, and how to have it deleted.';

export const metadata: Metadata = {
  title: 'Privacy',
  description,
  openGraph: { title: 'Privacy — Reclaim Your Week', description, type: 'website' },
};

function Clause({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-border border-t py-12 sm:py-14">
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      <section className="pt-20 pb-16 sm:pt-28">
        <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
          Privacy
        </p>
        <h1 className="text-foreground mt-6 max-w-3xl text-4xl leading-[1.14] font-light text-balance">
          What this records about you, and what it never does.
        </h1>
        <p className="text-muted-foreground mt-7 max-w-2xl text-lg leading-relaxed font-light">
          An audit only works if you are honest in it, and you can only be honest if you know where
          what you say ends up. This page is written to be read, not to be survived.
        </p>
        <div className="border-secondary bg-muted/60 mt-10 max-w-2xl rounded-lg border-l-2 p-6">
          <p className="text-secondary-foreground/90 text-sm leading-relaxed">
            <strong className="font-medium">A note on this version.</strong> Everything below
            accurately describes what the system does today. The legal wording is still being
            finalised with {BRAND.legalName}&rsquo;s advisers, and when it is you will be asked to
            accept the updated version — which is why consent here is recorded against a version
            number rather than a tick box.
          </p>
        </div>
      </section>

      <Clause id="who" title="Who holds it">
        <p>
          {BRAND.legalName} is the data controller for Reclaim Your Week. The audit is operated on
          behalf of Rashmir Balasubramaniam, whose coaching practice it belongs to.
        </p>
        <p>
          Questions, or a request to see or delete what is held about you, go to{' '}
          <Link href="/contact" className="text-primary underline underline-offset-4">
            the contact page
          </Link>
          .
        </p>
      </Clause>

      <Clause id="collected" title="What is recorded">
        <p>Three kinds of thing, and nothing else:</p>
        <p>
          <strong className="text-foreground font-medium">Your account.</strong> Your email address
          and the name you signed up with, held so you can sign back in and resume. The audit itself
          asks only for a first name.
        </p>
        <p>
          <strong className="text-foreground font-medium">Your answers.</strong> Everything you
          enter during an audit: your role and organisation type, how many hours you are working,
          your priorities, what is on your mind, the hours you attribute to each of the nine areas,
          your reflections at the end of each section, and the action you choose. Each answer is
          stamped with which audit it belongs to, so a second audit never overwrites your first.
        </p>
        <p>
          <strong className="text-foreground font-medium">Your conversation with the coach.</strong>{' '}
          The messages exchanged in the audit, kept so the conversation makes sense across a session
          and so you can pick it up where you left it.
        </p>
      </Clause>

      <Clause id="calendar" title="Your calendar">
        <p>
          If you choose to upload a calendar export, it is read <em>in memory</em>: the file is
          never written to disk and never stored in the database.
        </p>
        <p>
          <strong className="text-foreground font-medium">
            No meeting title, attendee, location, description or invitation is kept.
          </strong>{' '}
          What is kept is the arithmetic — how many hours fell into each of the nine areas, and a
          note of where that differed from your own estimate. There is no table in this system that
          could hold a meeting, which is a structural fact rather than a policy promise.
        </p>
        <p>
          The upload is optional and the audit works without it. It exists because comparing what
          you think your week looks like against what it actually looked like is often the most
          useful moment in the hour.
        </p>
      </Clause>

      <Clause id="ai" title="The model that runs the conversation">
        <p>
          The coach is a large language model. Your messages, and the parts of your audit needed for
          the conversation to make sense, are sent to {MODEL_VENDOR} to generate each reply.
        </p>
        <p>
          Where your calendar is categorised into areas, the same applies to the event summaries —
          for that one request only, and nothing from it is written down beyond the per-area totals.
        </p>
        <p>The model does not learn from your audit and your answers are not used to train it.</p>
      </Clause>

      <Clause id="who-sees" title="Who can see it">
        <p>
          <strong className="text-foreground font-medium">Rashmir can.</strong> She can see who has
          been given access, how far through an audit you are, and what you told the setup
          questions, because she is the coach and the programme is hers to run. What you wrote about
          what is keeping you up at night sits behind a deliberate extra step rather than on a list.
        </p>
        <p>
          <strong className="text-foreground font-medium">
            Nobody else, unless you choose it.
          </strong>{' '}
          At the end you are offered a link to your summary that you can send to whoever you like,
          and separately the option to share your result with Rashmir. Both are opt-in, offered
          once, and not asked about again. If you leave a comment at the end, whether it may be
          quoted anonymously is a separate question with its own answer.
        </p>
        <p>
          A shared link is an unguessable address. Anyone holding it can see that summary, so treat
          it the way you would a document you emailed.
        </p>
      </Clause>

      <Clause id="aggregate" title="Patterns across everyone">
        <p>
          Where you have accepted terms that permit it, your audit contributes to an anonymised
          picture across leaders — how the hours tend to distribute, which areas are most often
          empty. This is how the work stays informed by more than one person&rsquo;s week.
        </p>
        <p>It is constrained in three ways, enforced in the code rather than by policy:</p>
        <p>
          Only numbers and the fixed area names are ever pooled —{' '}
          <strong>no written answer of yours is ever aggregated</strong>. Figures covering fewer
          than a handful of people are withheld rather than shown, because an average over two
          people is a disclosure. And anyone who has not consented is simply absent, rather than
          included by default.
        </p>
      </Clause>

      <Clause id="email" title="Email">
        <p>
          Two kinds. The invitation that let you in, and — about a quarter after you finish an audit
          — a single note saying the door is open if you would like to look again.
        </p>
        <p>
          That reminder arrives{' '}
          <strong className="text-foreground font-medium">once per audit</strong>, never while you
          have one open, and never as a sequence. Every one carries a link that turns them off in a
          single click, with no need to sign in.
        </p>
        <p>
          Being on Rashmir&rsquo;s mailing list is a separate choice, made separately, and turning
          off reminders does not change it.
        </p>
      </Clause>

      <Clause id="retention" title="How long it is kept, and deleting it">
        <p>
          Your audits are kept while your account exists, because the point of a repeat audit is
          having the first one to compare against.
        </p>
        <p>
          <strong className="text-foreground font-medium">
            You can ask for it all to be deleted.
          </strong>{' '}
          When you do, your account, your audits, every answer you gave, your conversation with the
          coach, your share links and your reminder preference are removed — not hidden.
        </p>
        <p>
          Two things deliberately survive, and it is fairer to say so than to leave it in the small
          print. A record that you accepted a particular version of these terms is kept, with your
          identity detached from it, because it is the evidence that holding your data was lawful
          while you had an account — deleting it would destroy the proof rather than your data. The
          same applies to the record that an invitation was issued. Neither can be traced back to
          you.
        </p>
      </Clause>

      <Clause id="rights" title="Your rights">
        <p>
          You can ask for a copy of everything held about you, ask for it to be corrected, ask for
          it to be deleted, or withdraw your consent to the anonymised picture. Ask through{' '}
          <Link href="/contact" className="text-primary underline underline-offset-4">
            the contact page
          </Link>{' '}
          and it will be handled within a month.
        </p>
        <p>
          Withdrawing consent does not undo an aggregate figure already published, in the sense that
          a number cannot be un-averaged; it does remove you from every one calculated afterwards.
        </p>
      </Clause>

      <Clause id="cookies" title="Cookies">
        <p>
          A cookie keeps you signed in. Anything beyond that is asked for rather than assumed, and
          the preference control is in the footer of every page.
        </p>
      </Clause>

      <section className="border-border border-t py-14">
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          See also{' '}
          <Link href="/terms" className="text-primary underline underline-offset-4">
            the terms
          </Link>
          , which cover what the audit is and is not, and what you can do with what it gives you.
        </p>
      </section>
    </div>
  );
}
