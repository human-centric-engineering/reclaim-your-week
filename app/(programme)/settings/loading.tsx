/**
 * Shown while the settings page's server component resolves. Same reasoning as
 * `profile/loading.tsx`: the resting shape of what arrives, in this frame's register rather than the
 * platform card skeleton it replaces. The tab strip and one card are enough to hold the space; the
 * form inside it is Sunrise's and draws its own.
 */

export default function SettingsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <div className="border-border/60 flex h-14 shrink-0 items-center border-b px-4 sm:px-6">
        <div className="bg-muted h-3 w-36 animate-pulse rounded" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <div className="space-y-3">
            <div className="bg-muted h-3 w-32 animate-pulse rounded" />
            <div className="bg-muted h-9 w-64 animate-pulse rounded" />
            <div className="bg-muted h-4 w-full max-w-lg animate-pulse rounded" />
          </div>

          <div className="space-y-6">
            <div className="bg-muted h-10 w-full animate-pulse rounded-lg" />
            <div className="border-border/70 space-y-4 rounded-2xl border px-6 py-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                  <div className="bg-muted h-10 w-full animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Opening your account settings…</span>
    </div>
  );
}
