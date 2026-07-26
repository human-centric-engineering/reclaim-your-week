import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * About (post-v1 P4) — the method, and who it is by.
 *
 * The landing page says what the audit is for; this says how it thinks, for someone deciding whether
 * to spend the hour. Longer form, same register.
 *
 * **I1 governs the whole page.** The audit is an instrument Rashmir designed; it is not her, and it
 * does not speak as her. So every reference here is third person and deliberately sparing — the page
 * describes a method and attributes it, rather than performing a personality. That is also why there
 * is no founder photograph and no first-person letter, both of which the template offered.
 */

const description =
  'How the audit works, what it asks of you, and who designed it. A method for looking at your week honestly, built for leaders who are carrying too much.';

export const metadata: Metadata = {
  title: 'About',
  description,
  openGraph: { title: 'About Reclaim Your Week', description, type: 'website' },
};

/** A numbered phase, set as a list entry rather than a card. */
function Phase({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="border-border/70 grid gap-x-6 gap-y-2 border-b py-6 sm:grid-cols-[3rem_1fr]">
      <span className="text-muted-foreground text-xs tabular-nums sm:pt-1.5">{n}</span>
      <div>
        <h3 className="text-foreground text-lg font-light">{title}</h3>
        <p className="text-muted-foreground mt-2 leading-relaxed font-light">{children}</p>
      </div>
    </li>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      <section className="grid gap-x-16 gap-y-8 pt-20 pb-20 sm:pt-28 md:grid-cols-[1fr_17rem]">
        <div>
          <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
            About
          </p>
          <h1 className="text-foreground mt-6 max-w-2xl text-4xl leading-[1.14] font-light text-balance">
            A method for looking at your week without flinching.
          </h1>
          <p className="text-muted-foreground mt-7 max-w-xl text-lg leading-relaxed font-light">
            Reclaim Your Week is a structured conversation, not a form and not a dashboard. It asks
            before it tells, it works in hours rather than percentages, and it hands every
            conclusion back to you.
          </p>
        </div>
        <aside className="border-primary/25 self-start border-l pt-1 pl-6 md:mt-6">
          <p className="text-muted-foreground text-sm leading-relaxed">
            About an hour. In one sitting or several. Open by invitation.
          </p>
        </aside>
      </section>

      <section className="border-border border-t py-20 sm:py-24">
        <div className="grid gap-x-16 gap-y-6 md:grid-cols-[14rem_1fr]">
          <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
            The premise
          </h2>
          <div className="max-w-2xl space-y-5">
            <p className="text-muted-foreground leading-relaxed font-light">
              Leaders who care about their work tend to accumulate it. Not through poor discipline,
              but because the things they are best at keep coming back to them, and because saying
              no to good work is harder than saying yes to it. Over a few years, a week fills with
              things that were once the right call and are no longer the best use of the person
              doing them.
            </p>
            <p className="text-muted-foreground leading-relaxed font-light">
              That is very difficult to see from inside. Calendars are not read as evidence, and
              recollection flatters. So the audit does something simple and slightly uncomfortable:
              it asks you to put numbers on it, then shows you the shape those numbers make.
            </p>
            <p className="text-foreground leading-relaxed font-light">
              What it will not do is tell you the shape is wrong. A quarter spent on your team at
              the cost of strategy might be exactly the right choice, and only you know that.
            </p>
          </div>
        </div>
      </section>

      <section className="border-border border-t py-20 sm:py-24">
        <div className="grid gap-x-16 gap-y-6 md:grid-cols-[14rem_1fr]">
          <div>
            <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
              The seven phases
            </h2>
            <p className="text-muted-foreground mt-4 max-w-xs text-sm leading-relaxed">
              Each ends with a pause. You cannot move on from a phase without saying what you
              noticed in it, which is deliberate.
            </p>
          </div>
          <ol className="max-w-2xl">
            <Phase n="00" title="Setup">
              Your role, your organisation, how many hours you are working, what your priorities are
              for the rest of the year, and what is keeping you up at night. Ten questions, and they
              shape everything that follows.
            </Phase>
            <Phase n="01" title="Current reality">
              Your week across the nine areas, in hours. Optionally reconciled against a calendar
              export. This is where the picture first appears as a chart.
            </Phase>
            <Phase n="02" title="Energy">
              Which of those hours give energy and which take it. Two weeks that look identical on
              paper can feel entirely different.
            </Phase>
            <Phase n="03" title="The ideal week">
              The same nine areas, but the week you would design if you were starting from the
              priorities you named at the beginning.
            </Phase>
            <Phase n="04" title="The gap">
              The difference between the two, with what you said was keeping you up at night
              returned to you in your own words. Not a score. A comparison.
            </Phase>
            <Phase n="05" title="One thing">
              Not a plan with twelve actions. One change, when you will start it, and how you will
              know it worked.
            </Phase>
            <Phase n="06" title="Summary">
              A standalone summary you can keep, share with whoever you want, or not. Sharing is
              offered once and never asked about again.
            </Phase>
          </ol>
        </div>
      </section>

      <section className="border-border border-t py-20 sm:py-24">
        <div className="grid gap-x-16 gap-y-6 md:grid-cols-[14rem_1fr]">
          <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
            Coming back
          </h2>
          <div className="max-w-2xl space-y-5">
            <p className="text-muted-foreground leading-relaxed font-light">
              A single audit is a snapshot. The useful thing is the second one, a quarter or so
              later, which opens by putting the two side by side so you can see what moved.
            </p>
            <p className="text-muted-foreground leading-relaxed font-light">
              The comparison shows the difference in hours and says nothing about whether it is good
              news. If you deliberately gave a quarter to your team, a chart calling that a decline
              would be wrong, and the tool is not in a position to know which it was.
            </p>
          </div>
        </div>
      </section>

      <section className="border-border border-t py-20 sm:py-24">
        <div className="grid gap-x-16 gap-y-6 md:grid-cols-[14rem_1fr]">
          <h2 className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
            Who designed it
          </h2>
          <div className="max-w-2xl space-y-5">
            <p className="text-muted-foreground leading-relaxed font-light">
              The method, the nine areas and the benchmarks are Rashmir Balasubramaniam&rsquo;s,
              drawn from her work with purpose-driven leaders across nonprofits, foundations and
              mission-led businesses.
            </p>
            <p className="text-muted-foreground leading-relaxed font-light">
              This tool is an instrument built to her design. It is not her, and it does not pretend
              to be: it will not improvise, it will not give you a verdict, and where it quotes her
              framework it does so in her words rather than a summary of them. Working through it is
              not the same as working with her, and it is not meant to be.
            </p>
          </div>
        </div>
      </section>

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
            <Link href="/privacy" className="text-primary text-sm underline underline-offset-4">
              What happens to what you tell it
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
