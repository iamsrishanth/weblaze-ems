import {
  StatGridSkeleton,
  ListCardSkeleton,
} from "@/components/states";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-foreground/[0.07]" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-foreground/[0.07]" />
      </div>

      {/* KPI grid */}
      <StatGridSkeleton count={4} />

      {/* Main content skeletons */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ListCardSkeleton rows={5} />
        <ListCardSkeleton rows={4} />
      </div>
    </div>
  );
}
