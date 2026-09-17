/**
 * Generic route-transition skeleton — every authenticated route's
 * loading.tsx re-exports this, so navigating between pages shows an
 * instant, layout-matched placeholder instead of a frozen previous page
 * while the server component streams.
 */
export default function RouteLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-foreground/[0.07]" />
          <div className="h-4 w-64 animate-pulse rounded bg-foreground/[0.07]" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-lg bg-foreground/[0.07]" />
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-card py-4 ring-1 ring-foreground/10"
          >
            <div className="space-y-3 px-4">
              <div className="h-3.5 w-24 animate-pulse rounded bg-foreground/[0.07]" />
              <div className="h-7 w-16 animate-pulse rounded bg-foreground/[0.07]" />
              <div className="h-2.5 w-full animate-pulse rounded-full bg-foreground/[0.05]" />
            </div>
          </div>
        ))}
      </div>

      {/* Content card */}
      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="space-y-3 px-5 py-5">
          <div className="h-4 w-32 animate-pulse rounded bg-foreground/[0.07]" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-border/40 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 animate-pulse rounded-lg bg-foreground/[0.07]" />
                <div className="h-3.5 w-40 animate-pulse rounded bg-foreground/[0.07]" />
              </div>
              <div className="h-5 w-20 animate-pulse rounded-full bg-foreground/[0.07]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
