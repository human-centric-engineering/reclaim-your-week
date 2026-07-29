/**
 * Shown while the profile page's server component resolves.
 *
 * It replaces Sunrise's card skeleton, which was drawn against the old two-card layout and would now
 * be a skeleton of a page that no longer exists. Same register as `programme/loading.tsx`: the resting
 * shape of what is about to arrive, quiet, no spinner. The bar is drawn as a plain rule rather than
 * `ProgrammeChrome`, because the real bar renders instantly once the page does and a placeholder that
 * is nearly the bar reads as the bar failing to load.
 */

export default function ProfileLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <div className="border-border/60 flex h-14 shrink-0 items-center border-b px-4 sm:px-6">
        <div className="bg-muted h-3 w-36 animate-pulse rounded" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <div className="space-y-3">
            <div className="bg-muted h-3 w-32 animate-pulse rounded" />
            <div className="bg-muted h-9 w-56 animate-pulse rounded" />
            <div className="bg-muted h-4 w-full max-w-lg animate-pulse rounded" />
          </div>

          <div className="border-border/70 flex items-center gap-5 rounded-2xl border px-6 py-6">
            <div className="bg-muted h-16 w-16 shrink-0 animate-pulse rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="bg-muted h-5 w-48 animate-pulse rounded" />
              <div className="bg-muted h-4 w-64 animate-pulse rounded" />
            </div>
          </div>

          <div className="border-border/70 divide-border/50 divide-y rounded-2xl border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-baseline gap-4 px-6 py-4">
                <div className="bg-muted h-4 w-32 shrink-0 animate-pulse rounded" />
                <div className="bg-muted h-4 w-40 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Finding your profile…</span>
    </div>
  );
}
