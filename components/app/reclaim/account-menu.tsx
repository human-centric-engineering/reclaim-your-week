'use client';

/**
 * The leader's own menu, in the programme bar.
 *
 * **Why this is not `components/auth/user-button.tsx`.** That component is the platform's and is
 * used in the platform's header, where the product it fronts is a dashboard. Here the product is the
 * audit, and the first thing in this menu has to be **your audits** — the surface a leader comes back
 * for. The platform component cannot carry a leaf route, and it is not ours to edit. So the menu is
 * composed from the same primitives, the same session client and the same sign-out, and differs only
 * in what it offers and how heavy it looks.
 *
 * **It replaced a link that said "Leave the audit".** That link existed because the audit had left
 * the platform's layout and had no other way out, and it pointed at the dashboard, which is a page
 * about an account rather than about a week. Now the bar carries the account itself, so leaving is
 * something a leader does on purpose rather than the only navigation on offer.
 *
 * Loading renders a placeholder the same size as the avatar, so the bar does not jump when the
 * session arrives. Signed out renders nothing by default: the programme is behind the edge gate, and
 * a menu offering "log in" on a page nobody can reach signed out would be answering a question no one
 * asked.
 *
 * **`signedOut` is what lets the public pages use this menu.** They wear the same frame but are
 * reachable by anyone, so there the empty corner is wrong — a visitor holding an invitation needs the
 * way in, and a leader arriving from the audit's own footer needs their audits back. The caller
 * passes what belongs in that corner rather than this component guessing, because what is right
 * depends on the page it is standing on and only the page knows that.
 */

import Link from 'next/link';
import { useState } from 'react';
import { CalendarRange, LogOut, Settings, Shield, User } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth/client';
import { useAnalytics, EVENTS } from '@/lib/analytics';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils/initials';

export interface AccountMenuProps {
  /** What stands in the corner with no session. Omitted on the programme, which is gated anyway. */
  signedOut?: React.ReactNode;
}

export function AccountMenu({ signedOut }: AccountMenuProps = {}) {
  const { data: session, isPending } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const { track, reset } = useAnalytics();

  if (isPending) {
    return <div aria-hidden className="bg-muted/60 h-8 w-8 animate-pulse rounded-full" />;
  }

  if (!session) return <>{signedOut ?? null}</>;

  const { user } = session;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: async () => {
            await track(EVENTS.USER_LOGGED_OUT);
            await reset();
            // A hard navigation, so nothing of the session survives in memory.
            window.location.href = '/';
          },
          onError: () => setSigningOut(false),
        },
      });
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Your account"
          className="ring-border/70 hover:ring-primary/50 focus-visible:ring-primary rounded-full ring-1 transition-all focus-visible:ring-2 focus-visible:outline-none"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? undefined} alt="" />
            <AvatarFallback className="text-[0.7rem] font-medium">
              {getInitials(user.name || 'You')}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="text-foreground block truncate text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground block truncate text-xs">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* First, and on purpose: this is the menu's reason for existing. */}
        <DropdownMenuItem asChild>
          <Link href="/programme/history" className="cursor-pointer">
            <CalendarRange className="mr-2 h-4 w-4" />
            Your audits
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Account settings
          </Link>
        </DropdownMenuItem>

        {user.role === 'ADMIN' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer">
                <Shield className="mr-2 h-4 w-4" />
                Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        {/* Radix dismisses the menu the moment an item is selected, which unmounts this item before
            the request it just started has settled — so "Signing out…" was state nobody could ever
            see. Holding the menu open is what makes the label mean something: the leader gets an
            answer that their press landed, and it stays until the hard navigation below takes the
            page. `preventDefault` only suppresses the dismissal; every other item still closes. */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          disabled={signingOut}
          className="cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
