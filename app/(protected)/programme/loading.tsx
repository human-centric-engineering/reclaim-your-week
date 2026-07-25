/**
 * Programme loading state (F4 t-4). Shown while the shell's server component resolves. Kept in the
 * programme's calm register — a quiet spine and a soft signpost band, not a busy dashboard skeleton
 * (I-frame: this is not a productivity exercise). Mirrors the resting shape of `programme-shell` so
 * the transition into content does not jump.
 */

export default function ProgrammeLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14" aria-busy="true">
      <header className="mb-12 space-y-4">
        <div className="bg-muted h-3 w-40 animate-pulse rounded" />
        <div className="bg-muted h-9 w-56 animate-pulse rounded" />
      </header>

      <div className="grid gap-x-14 gap-y-12 md:grid-cols-[15rem_1fr]">
        <aside className="space-y-6 md:pt-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="bg-muted h-3 w-3 shrink-0 animate-pulse rounded-full" />
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            </div>
          ))}
        </aside>

        <main className="min-w-0 space-y-9">
          <div className="bg-muted h-28 animate-pulse rounded-2xl" />
          <div className="space-y-4">
            <div className="bg-muted h-4 w-full animate-pulse rounded" />
            <div className="bg-muted h-4 w-4/5 animate-pulse rounded" />
          </div>
        </main>
      </div>

      <span className="sr-only">Gathering your audit…</span>
    </div>
  );
}
