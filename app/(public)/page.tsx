import type { Metadata } from 'next';
import Link from 'next/link';
import { RECLAIM_BUCKETS } from '@/lib/app/programme/content';

/**
 * The landing page (post-v1 P4).
 *
 * ## Why this looks nothing like a SaaS landing page
 *
 * Three constraints from the source documents govern every choice here, and together they rule out
 * almost everything a template landing page does:
 *
 * - **I-frame — this is not a productivity exercise.** It is an invitation to a next level of
 *   leadership, which may mean letting go. So there is no "save 10 hours a week", no efficiency
 *   promise, no before/after. A page selling time saved would be selling the one thing the product
 *   must not optimise for.
 * - **I16 + Brief §2 — no pressure on next steps, anywhere in the product.** A landing page is
 *   *made* of pressure by convention. This one has no trial countdown and no social-proof wall; the
 *   strongest thing it does is say where invitations come from.
 * - **Brief §7 — calm, uncluttered, generous white space, no stock-photo energy, no gradients.** The
 *   brand direction is explicit about the last two, so the visual language is typographic: hairline
 *   rules, a numbered contents list, and a great deal of nothing.
 *
 * ## Invite-only is the real design decision
 *
 * v1 is invite-gated (F8). The starter template's two "Get Started" buttons pointed at `/signup` and
 * were, as the post-v1 audit found (P1), the only routes to it in the app. Removing them is **not a
 * gate** — Sunrise's signup page still exists and there is no platform seam to close it
 * (sunrise#463); the real gate is entitlement at run creation (I14). But a page inviting you to sign
 * up for something you cannot use is worse than one that says plainly how you get in.
 *
 * So the primary action is **sign in**, for someone holding an invitation, and everyone else is told
 * where invitations come from — without a waiting-list form, which would be a next step under
 * pressure by another name.
 *
 * ## The nine areas are named but not described
 *
 * The names make the page substantive instead of vague. The diagnostic prose beneath each — the part
 * that is actually Rashmir's IP (I11) — stays inside the audit. Read from `RECLAIM_BUCKETS` so that
 * the day she renames one in the admin content editor, this page follows.
 */

const description =
  'A guided time audit for leaders carrying more than they can sustain. It asks where your week actually goes, draws it back to you, and leaves the decisions with you.';

export const metadata: Metadata = {
  title: 'Reclaim Your Week',
  description,
  openGraph: { title: 'Reclaim Your Week', description, type: 'website' },
};

/** Set like a printed contents page: number, hairline, name. Descriptions live inside the audit. */
function Areas() {
  return (
    <ol className="mt-8 grid gap-x-12 sm:grid-cols-2">
      {RECLAIM_BUCKETS.map((bucket, i) => (
        <li key={bucket.slug} className="border-border/70 flex items-baseline gap-5 border-b py-4">
          <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className="text-foreground text-[1.02rem] leading-snug font-light">
            {bucket.title}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A section with a small left-hand label, in the manner of a set text. */
function Movement({
  label,
  children,
  aside,
}: {
  label: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-border border-t py-20 sm:py-24">
      <div className="grid gap-x-16 gap-y-6 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
            {label}
          </h2>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      {/* ── Masthead. One sentence, stating the frame rather than a benefit. ─────────────────── */}
      <section className="grid gap-x-16 gap-y-10 pt-20 pb-24 sm:pt-32 sm:pb-32 md:grid-cols-[1fr_17rem]">
        <div>
          <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
            A guided time audit
          </p>
          <h1 className="text-foreground mt-6 max-w-2xl text-4xl leading-[1.12] font-light text-balance sm:text-5xl">
            Most leaders have never looked honestly at where their week goes.
          </h1>
          <p className="text-muted-foreground mt-7 max-w-xl text-lg leading-relaxed font-light">
            This is an hour spent finding out. Not so that you can be more efficient, but so that
            you can see what your time is already saying about your priorities, and decide what you
            want to do about that.
          </p>
        </div>

        <aside className="border-primary/25 self-start border-l pt-1 pl-6 md:mt-6">
          <p className="text-foreground text-[0.98rem] leading-relaxed font-light">
            Designed by Rashmir Balasubramaniam, for purpose-driven leaders carrying more than they
            can sustain.
          </p>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">Open by invitation.</p>
        </aside>
      </section>

      {/* ── The frame. The one thing that must not be misread. ───────────────────────────────── */}
      <Movement label="What this is not">
        <div className="max-w-2xl space-y-5">
          <p className="text-foreground text-xl leading-relaxed font-light text-balance">
            This is not a productivity exercise.
          </p>
          <p className="text-muted-foreground leading-relaxed font-light">
            It will not hand you a tighter calendar or a system for fitting more in. It is an
            invitation to a next level of leadership, and that often turns out to mean letting go of
            something you are good at and have been holding on to for longer than you meant to.
          </p>
          <p className="text-muted-foreground leading-relaxed font-light">
            Nothing here tells you what your week means. It shows you what is there, asks what you
            notice, and leaves the reading to you.
          </p>
        </div>
      </Movement>

      {/* ── The nine areas. Substance, set as a contents page. ───────────────────────────────── */}
      <Movement
        label="Nine areas"
        aside={
          <p className="text-muted-foreground mt-4 max-w-xs text-sm leading-relaxed">
            Your week is divided across these, in hours rather than percentages. Percentages hide
            overwork by forcing a total of one hundred.
          </p>
        }
      >
        <Areas />
      </Movement>

      {/* ── Reassurance, in Brief §7's register. ─────────────────────────────────────────────── */}
      <Movement label="Before you start">
        <div className="bg-muted/60 max-w-2xl rounded-lg p-7 sm:p-9">
          <ul className="space-y-4">
            {[
              'It is fine if you are not using your time well yet. That is usually why people do this.',
              'It is fine to do it during an atypical week. Most weeks are atypical.',
              'This is not about achieving a perfect calendar. There is no such thing.',
              'No one is judging how you spend your time. It is better to know than not to know.',
            ].map((line) => (
              <li key={line} className="text-secondary-foreground/90 leading-relaxed font-light">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Movement>

      {/* ── What it asks, and what happens to it. Privacy stated plainly, not buried. ────────── */}
      <Movement label="How it works">
        <div className="max-w-2xl space-y-10">
          <div className="space-y-4">
            <h3 className="text-foreground text-lg font-light">
              About an hour, in one sitting or several
            </h3>
            <p className="text-muted-foreground leading-relaxed font-light">
              Seven phases: your role and what is on your plate, then your week across the nine
              areas, then energy, the week you would design, the gap between the two, and one thing
              to do about it. You can stop and come back. It remembers where you were.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-foreground text-lg font-light">
              Your calendar, if you want the reality check
            </h3>
            <p className="text-muted-foreground leading-relaxed font-light">
              You can upload a calendar export to compare what you estimated against what actually
              happened. It is genuinely optional and the audit works without it.{' '}
              <span className="text-foreground">
                No meeting title, attendee or description is ever stored.
              </span>{' '}
              The file is read in memory, turned into hours per area, and discarded.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-foreground text-lg font-light">What you say stays yours</h3>
            <p className="text-muted-foreground leading-relaxed font-light">
              Your answers are confidential. Sharing your summary is offered at the end and never
              required, and nothing goes to anyone unless you choose it. You can ask for everything
              to be deleted at any time.{' '}
              <Link href="/privacy" className="text-primary underline underline-offset-4">
                The privacy notice says exactly what is held, and for how long
              </Link>
              .
            </p>
          </div>
        </div>
      </Movement>

      {/* ── The close. An open door, not a push. ─────────────────────────────────────────────── */}
      <section className="border-border border-t py-20 sm:py-28">
        <div className="max-w-2xl">
          <h2 className="text-foreground text-2xl leading-snug font-light text-balance">
            If you have an invitation, it starts whenever you have the hour.
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              href="/login"
              className="bg-primary text-primary-foreground rounded-full px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
            <Link href="/about" className="text-primary text-sm underline underline-offset-4">
              Read more about the audit
            </Link>
          </div>
          <p className="text-muted-foreground mt-10 max-w-md text-sm leading-relaxed">
            Invitations come from Rashmir directly. If this sounds useful and you do not have one,{' '}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              get in touch
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
