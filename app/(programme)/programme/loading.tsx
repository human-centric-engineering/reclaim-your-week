/**
 * Programme loading state (F4 t-4). Shown while the shell's server component resolves. Kept in the
 * programme's calm register — a quiet spine and a soft signpost band, not a busy dashboard skeleton
 * (I-frame: this is not a productivity exercise). Mirrors the resting shape of `programme-shell` so
 * the transition into content does not jump: a bar, a rail, a conversation column, a composer.
 */

export default function ProgrammeLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <div className="border-border/60 flex h-14 shrink-0 items-center gap-4 border-b px-5">
        <div className="bg-muted h-3 w-36 animate-pulse rounded" />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="border-border/60 hidden w-60 shrink-0 space-y-6 border-r px-6 py-8 lg:block">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="bg-muted h-3 w-3 shrink-0 animate-pulse rounded-full" />
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            </div>
          ))}
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 px-6 py-10">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="bg-muted h-28 animate-pulse rounded-2xl" />
              <div className="space-y-4">
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-4/5 animate-pulse rounded" />
              </div>
            </div>
          </div>
          <div className="border-border/60 shrink-0 border-t px-6 py-5">
            <div className="bg-muted mx-auto h-12 max-w-3xl animate-pulse rounded-2xl" />
          </div>
        </main>
      </div>

      <span className="sr-only">Gathering your audit…</span>
    </div>
  );
}
