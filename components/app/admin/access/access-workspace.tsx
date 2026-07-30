'use client';

/**
 * The Access screen's frame (F8 t-1 / F11) — one header, two tabs, two ledgers.
 *
 * ## Why tabs
 *
 * The two ways into the programme — invite a named person, open a door for a room — used to be
 * stacked: form, table, form, table. That reads fine with one row in each and becomes unusable the
 * moment either ledger fills, because the thing an operator came to read is separated from the top of
 * the page by a form they are not using. Each way in is now a tab: one job in view at a time, with
 * its own toolbar and its own list.
 *
 * They are tabs rather than two pages because the two lists answer one another. An invitation's
 * "Source" cell names the group link it was claimed through, and the natural next move from a link
 * that filled up is to go and look at who claimed it. A page boundary would put a round trip in the
 * middle of that.
 *
 * ## Why both tabs load on mount
 *
 * `forceMount` keeps the inactive tab rendered (hidden), which costs one extra `GET` on arrival and
 * buys two things: the counts in the tab strip are true before anything is clicked — so the strip is
 * information rather than only navigation — and switching tabs never re-fetches or drops a half-typed
 * search.
 *
 * Tab state is URL-synced through `useUrlTabs`, matching `user-management-tabs.tsx`, so `?tab=links`
 * is a link somebody can send.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlTabs } from '@/lib/hooks/use-url-tabs';
import { InviteManager } from '@/components/app/admin/access/invite-manager';
import { LinkManager } from '@/components/app/admin/access/link-manager';

const ALLOWED_TABS = ['people', 'links'] as const;
type AccessTab = (typeof ALLOWED_TABS)[number];

/** The count beside a tab's name. Absent until its list has loaded — a "0" that means "not yet" is a lie. */
function TabCount({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span className="bg-muted-foreground/20 ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums">
      {count}
    </span>
  );
}

export function AccessWorkspace() {
  const [inviteCount, setInviteCount] = useState<number | null>(null);
  const [linkCount, setLinkCount] = useState<number | null>(null);
  const { activeTab, setActiveTab } = useUrlTabs<AccessTab>({
    defaultTab: 'people',
    allowedTabs: ALLOWED_TABS,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Access</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Reclaim Your Week is invite-only: an account with no invitation cannot start an audit.
          Invite one person at a time, or open a single link for a whole room.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccessTab)}>
        <TabsList>
          <TabsTrigger value="people">
            People
            <TabCount count={inviteCount} />
          </TabsTrigger>
          <TabsTrigger value="links">
            Group links
            <TabCount count={linkCount} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people" forceMount className="mt-6 data-[state=inactive]:hidden">
          <InviteManager onCountChange={setInviteCount} />
        </TabsContent>
        <TabsContent value="links" forceMount className="mt-6 data-[state=inactive]:hidden">
          <LinkManager onCountChange={setLinkCount} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
