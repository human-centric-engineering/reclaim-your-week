/**
 * What this account knows about a leader, on the programme's own frame.
 *
 * **Why this exists rather than Sunrise's page.** The platform's profile page is two stacked cards of
 * icon-and-label pairs inside the platform header and footer. There is nothing wrong with it; it is
 * simply a different product. A leader reaches this screen from the menu in the audit's own bar,
 * which means the trip from a forty-minute conversation about their working life to "Profile Details"
 * took one click and changed typeface, chrome and register on the way. The frame is the fix, and once
 * a page is inside the frame the cards look like a visitor, so the page is written here instead.
 *
 * **It is a reading, not a form.** Nothing on it can be changed; everything that can is one link away
 * in account settings. That split is the platform's and it is a good one, so it survives the move.
 *
 * The fields are shown even when empty, which is a deliberate choice against hiding them: "Not set"
 * tells a leader the field exists and is theirs to fill, and a page that silently omits what it does
 * not have makes somebody wonder what else it is not saying.
 */

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';
import { getInitials } from '@/lib/utils/initials';

export interface ProfileViewProps {
  name: string;
  email: string;
  /** Free text the leader wrote about themselves. Absent for most accounts. */
  bio: string | null;
  location: string | null;
  timezone: string | null;
  image: string | null;
  emailVerified: boolean;
  /** `ADMIN` for the people who run this, `USER` or absent for everybody else. */
  role: string | null;
  createdAt: Date;
}

export function ProfileView({
  name,
  email,
  bio,
  location,
  timezone,
  image,
  emailVerified,
  role,
  createdAt,
}: ProfileViewProps) {
  return (
    <>
      <ProgrammeChrome here="Your profile" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <header className="space-y-3">
            <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
              Reclaim your week
            </p>
            <h1 className="text-foreground text-3xl leading-tight font-light sm:text-4xl">
              Your profile
            </h1>
            <p className="text-muted-foreground max-w-lg text-[1.02rem] leading-relaxed">
              What this account holds about you. Your audits are a separate thing, kept in your own
              words, and nothing here changes them.
            </p>
          </header>

          <section className="border-border/70 flex flex-col gap-5 rounded-2xl border px-6 py-6 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarImage src={image ?? undefined} alt="" />
              <AvatarFallback className="text-lg font-light">{getInitials(name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-foreground truncate text-xl leading-snug font-light">{name}</h2>
              <p className="text-muted-foreground truncate text-sm">{email}</p>
              <p className="text-muted-foreground/80 text-[0.7rem] tracking-[0.16em] uppercase">
                {role === 'ADMIN' ? 'Administrator' : 'Leader'}
                {emailVerified ? ' · Email confirmed' : ' · Email not yet confirmed'}
              </p>
            </div>

            <Link
              href="/settings"
              className="border-border/70 hover:bg-accent/40 shrink-0 self-start rounded-full border px-5 py-2 text-sm transition-colors sm:self-auto"
            >
              Change these
            </Link>
          </section>

          {bio !== null && bio.trim() !== '' && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
                About you
              </h2>
              <p className="text-foreground/90 text-[1.02rem] leading-relaxed whitespace-pre-wrap">
                {bio}
              </p>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
              Details
            </h2>
            {/*
             * A description list rather than a grid of icon cards: four labelled facts read as prose
             * at this size, and the icons were doing decoration rather than work.
             */}
            <dl className="border-border/70 divide-border/50 divide-y rounded-2xl border">
              <Detail label="Email" value={email} />
              <Detail label="Where you are" value={location} />
              <Detail
                label="Your timezone"
                value={timezone === null ? null : readableZone(timezone)}
              />
              <Detail label="With us since" value={joinedOn(createdAt)} />
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

/** One labelled fact. `null` is shown rather than hidden, so an empty field still reads as a field. */
function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-4">
      <dt className="text-muted-foreground w-40 shrink-0 text-sm">{label}</dt>
      <dd
        className={
          value === null
            ? 'text-muted-foreground/70 min-w-0 text-[1.02rem] font-light'
            : 'text-foreground min-w-0 text-[1.02rem] font-light'
        }
      >
        {value ?? 'Not set'}
      </dd>
    </div>
  );
}

/**
 * `Europe/London` reads as "Europe / London". The stored value is an IANA zone, which is the right
 * thing to store and the wrong thing to show unaltered.
 */
function readableZone(timezone: string): string {
  return timezone.replaceAll('_', ' ').replace('/', ' / ');
}

/** The join date, spelled out. `en-GB` so it is the day first, as a leader here would write it. */
function joinedOn(createdAt: Date): string {
  return new Date(createdAt).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
