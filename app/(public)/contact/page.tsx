import type { Metadata } from 'next';
import Link from 'next/link';
import { EnquiryForm } from '@/components/app/contact/enquiry-form';

/**
 * Contact — the form first, the explanation after.
 *
 * ## What this replaced
 *
 * The starter template's page: a two-column card layout selling Sunrise, with a placeholder
 * `hello@example.com`, a "Pro Support package" that does not exist, and a GitHub issues link. None
 * of it was about this product, and the last of it invited a leader with a broken sign-in to open a
 * public issue on a framework repository.
 *
 * ## Why this page carries weight the template's did not
 *
 * Three separate things point here and nothing else does:
 *
 * - the landing page ends "Invitations come from Rashmir directly. If this sounds useful and you do
 *   not have one, get in touch" — so **this is the only door into an invite-only audit** (F8);
 * - the privacy notice names it twice as the route for a copy, a correction, or erasure, which
 *   makes it a stated part of a data-protection promise, not marketing furniture;
 * - the audit itself has no support surface. A leader stuck mid-phase has this page or nothing.
 *
 * ## Order: masthead, form, then the notes
 *
 * The first draft explained the four audiences at length *before* the form, and buried the only
 * interactive thing on the page below three screens of prose. **The tick boxes already say what the
 * four reasons are**, so the prose was restating the form to someone who had not reached it yet.
 * What survives sits underneath as short notes: the things a person might want *after* deciding to
 * write, not before.
 *
 * ## The coaching note is a signpost, not a sales page
 *
 * Rashmir's practice is described in the **third person and sparingly** (I1), the same register as
 * `/about`, and links out to her own pages rather than restating her offers or, especially, her
 * prices: those are hers to state and hers to change, and a stale figure on a page she does not
 * control would be worse than no figure. I16 applies as much here as inside the audit, so there is
 * no urgency device, no scarcity note, and no waiting list.
 */

const description =
  'Ask for an invitation to Reclaim Your Week, raise a question about the audit, or enquire about coaching with Rashmir Balasubramaniam.';

export const metadata: Metadata = {
  title: 'Contact',
  description,
  openGraph: { title: 'Contact Reclaim Your Week', description, type: 'website' },
};

/** A short note under the form, set as a list entry rather than a card. */
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="border-border/70 border-b py-5 first:pt-0">
      <h3 className="text-foreground text-[1.02rem] font-light">{title}</h3>
      <p className="text-muted-foreground mt-2 leading-relaxed font-light">{children}</p>
    </li>
  );
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      {/* ── Masthead. Two lines, then the form. ─────────────────────────────────────────────── */}
      <section className="grid gap-x-16 gap-y-6 pt-16 pb-10 sm:pt-20 md:grid-cols-[1fr_17rem]">
        <div>
          <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
            Contact
          </p>
          <h1 className="text-foreground mt-5 max-w-2xl text-4xl leading-[1.14] font-light text-balance">
            Ask a question, or request an invitation.
          </h1>
        </div>
        <aside className="border-primary/25 self-start border-l pt-1 pl-6 md:mt-8">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Messages go to a person, not a queue. A reply usually comes within a few working days.
          </p>
        </aside>
      </section>

      {/* ── The form, immediately. It is what the page is for. ──────────────────────────────── */}
      <section className="border-border border-t pt-10 pb-16 sm:pb-20">
        <EnquiryForm />
      </section>

      {/* ── The notes. What someone might want after deciding to write, not before. ─────────── */}
      <section className="border-border border-t py-14 sm:py-16">
        <div className="grid gap-x-16 gap-y-6 md:grid-cols-[14rem_1fr]">
          <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
            Worth knowing
          </h2>
          <ul className="max-w-2xl">
            <Note title="Invitations">
              There is no waiting list and nothing to buy. Something about your work and what is
              making the week hard to hold is the most useful thing to say.{' '}
              <Link href="/about" className="text-primary underline underline-offset-4">
                The about page
              </Link>{' '}
              describes the audit in full.
            </Note>

            <Note title="Working with Rashmir">
              Rashmir Balasubramaniam coaches leaders, entrepreneurs and social innovators, from
              transformational leadership coaching through purpose work to long-run strategic
              thought partnership. Her own pages set that out in full:{' '}
              <a
                href="https://rashmir.net/coaching"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4"
              >
                rashmir.net/coaching
              </a>
              . This audit is one instrument from that practice; doing it is not the same as working
              with her.
            </Note>

            <Note title="Something not working">
              A sign-in that will not take, a phase that will not advance, a chart that looks wrong.
              Say roughly what you were doing and when. There is no ticket number and no support
              portal; it comes straight through.
            </Note>

            <Note title="Your data">
              A copy of what is held about you, a correction, or deletion of the whole lot, handled
              within a month.{' '}
              <Link href="/privacy" className="text-primary underline underline-offset-4">
                The privacy notice
              </Link>{' '}
              says what is held, why, and for how long.
            </Note>
          </ul>
        </div>
      </section>

      {/* ── The close. Already have an invitation? Then this page is not the one you want. ───── */}
      <section className="border-border border-t py-16 sm:py-20">
        <div className="flex max-w-2xl flex-wrap items-center gap-x-8 gap-y-4">
          <p className="text-muted-foreground leading-relaxed font-light">
            Already have an invitation? You do not need to write.
          </p>
          <Link href="/login" className="text-primary text-sm underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
