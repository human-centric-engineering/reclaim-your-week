/**
 * A leader's own profile, read back to them.
 *
 * **This URL used to be Sunrise's.** `app/(protected)/profile/page.tsx` was removed rather than left
 * alongside, because two files cannot answer one path and keeping the URL is the whole point: the
 * account menu, the platform dashboard and anybody's bookmarks all still point at `/profile`. What
 * changed is the frame it renders in and the register it speaks in, not where it lives. See
 * `app/(programme)/layout.tsx` for why the frame moved up to cover it.
 *
 * The shape is the platform's and stays: a thin Server Component that reads the session, fetches the
 * user, and hands presentation to a component. `clearInvalidSession` is core's, and is what turns a
 * stale cookie into a clean sign-in rather than a crash; it redirects, so nothing after it runs.
 */

import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth/utils';
import { clearInvalidSession } from '@/lib/auth/clear-session';
import { prisma } from '@/lib/db/client';
import { ProfileView } from '@/components/app/reclaim/account/profile-view';

export const metadata: Metadata = {
  title: 'Your profile',
  description: 'What this account holds about you.',
};

export default async function ProfilePage() {
  const session = await getServerSession();

  if (!session) {
    clearInvalidSession('/profile');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      bio: true,
      timezone: true,
      location: true,
    },
  });

  if (!user) {
    clearInvalidSession('/profile');
  }

  return (
    <ProfileView
      name={user.name}
      email={user.email}
      bio={user.bio}
      location={user.location}
      timezone={user.timezone}
      image={user.image}
      emailVerified={user.emailVerified}
      role={user.role}
      createdAt={user.createdAt}
    />
  );
}
