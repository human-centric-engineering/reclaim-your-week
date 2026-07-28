/**
 * Account settings, on the programme's own frame.
 *
 * **What this component is and is not.** It is the frame, the heading and the sentence that says what
 * the four tabs are for. It is *not* a reimplementation of them. `SettingsTabs` is Sunrise's, and
 * behind it sit the profile form, the avatar upload, the password change, the email preferences and
 * account deletion, every one of which is real machinery with its own validation, its own API routes
 * and its own tests. Rewriting that to match a typeface would be forking five working forms to gain a
 * visual register, and the fork would rot the first time upstream fixed one of them.
 *
 * So the honest boundary is: the page around the forms is this app's, the forms are the platform's.
 * The cards inside read as slightly more product-like than the rest of the audit, and that is the
 * trade being made on purpose rather than an oversight. If a leader ever needs those forms to speak
 * in the coach's voice, the place to change it is upstream, not here.
 *
 * `SettingsTabs` keeps the tab in the URL (`/settings?tab=security`), which is why the link out of
 * account deletion emails and the browser back button both still land where they should.
 */

import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { getInitials } from '@/lib/utils/initials';
import type { UserPreferences } from '@/types';

export interface AccountSettingsProps {
  user: {
    name: string;
    email: string;
    bio: string | null;
    phone: string | null;
    timezone: string | null;
    location: string | null;
    image: string | null;
    emailVerified: boolean;
    role: string | null;
    createdAt: Date;
  };
  preferences: UserPreferences;
  /** False for an account that only ever signed in through a provider, which hides the password tab. */
  hasPasswordAccount: boolean;
  /** Human-readable provider names, so the account tab can say how somebody actually signs in. */
  oauthProviders: string[];
}

export function AccountSettings({
  user,
  preferences,
  hasPasswordAccount,
  oauthProviders,
}: AccountSettingsProps) {
  return (
    <>
      <ProgrammeChrome here="Account settings" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <header className="space-y-3">
            <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
              Reclaim your week
            </p>
            <h1 className="text-foreground text-3xl leading-tight font-light sm:text-4xl">
              Account settings
            </h1>
            <p className="text-muted-foreground max-w-lg text-[1.02rem] leading-relaxed">
              Your details, how you sign in, which emails reach you, and how to close the account
              altogether. Closing it takes your audits with it, and that is the point of it.
            </p>
          </header>

          <SettingsTabs
            user={user}
            preferences={preferences}
            hasPasswordAccount={hasPasswordAccount}
            oauthProviders={oauthProviders}
            initials={getInitials(user.name)}
          />
        </div>
      </div>
    </>
  );
}
