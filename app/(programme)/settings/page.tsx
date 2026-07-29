/**
 * Account settings.
 *
 * **This URL used to be Sunrise's.** `app/(protected)/settings/page.tsx` was removed rather than left
 * alongside, for the reason given on `profile/page.tsx`: two files cannot answer one path, and the
 * path is what every link, email and bookmark already uses. The server half below is the platform's
 * work, kept deliberately close to the original so that a future upstream change to the user model is
 * easy to read across; what moved is the frame around it (`app/(programme)/layout.tsx`) and the words
 * above the tabs (`AccountSettings`).
 *
 * The tabs themselves are still `components/settings/settings-tabs.tsx`, which is core's and not
 * ours. See `AccountSettings` for why that boundary was drawn there.
 */

import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth/utils';
import { clearInvalidSession } from '@/lib/auth/clear-session';
import { prisma } from '@/lib/db/client';
import { parseUserPreferences } from '@/lib/validations/user';
import { AccountSettings } from '@/components/app/reclaim/account/account-settings';

export const metadata: Metadata = {
  title: 'Account settings',
  description: 'Your details, how you sign in, and which emails reach you.',
};

export default async function SettingsPage() {
  const session = await getServerSession();

  if (!session) {
    clearInvalidSession('/settings');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      bio: true,
      phone: true,
      timezone: true,
      location: true,
      preferences: true,
      accounts: {
        select: {
          providerId: true,
          password: true,
        },
      },
    },
  });

  if (!user) {
    clearInvalidSession('/settings');
  }

  const preferences = parseUserPreferences(user.preferences);

  // A password row on any linked account is what makes the security tab worth showing.
  const hasPasswordAccount = user.accounts.some((account) => account.password !== null);

  // Everything else the leader could be signing in with, named the way the provider names itself.
  const oauthProviders = user.accounts
    .filter((account) => account.providerId !== 'credential' && account.password === null)
    .map((account) => formatProviderName(account.providerId));

  return (
    <AccountSettings
      user={{
        name: user.name,
        email: user.email,
        bio: user.bio,
        phone: user.phone,
        timezone: user.timezone,
        location: user.location,
        image: user.image,
        emailVerified: user.emailVerified,
        role: user.role,
        createdAt: user.createdAt,
      }}
      preferences={preferences}
      hasPasswordAccount={hasPasswordAccount}
      oauthProviders={oauthProviders}
    />
  );
}

/** Provider ids are lowercase slugs; these are the same providers spelled as people know them. */
function formatProviderName(providerId: string): string {
  const providerNames: Record<string, string> = {
    google: 'Google',
    github: 'GitHub',
    facebook: 'Facebook',
    twitter: 'Twitter',
    apple: 'Apple',
    microsoft: 'Microsoft',
    discord: 'Discord',
    linkedin: 'LinkedIn',
  };

  return providerNames[providerId.toLowerCase()] || providerId;
}
