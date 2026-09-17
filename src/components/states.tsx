import type { ComponentType, ReactNode } from "react";
import { OctagonXIcon, RefreshCwIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  /** Primary action, e.g. a <Button /> or link. */
  action?: ReactNode;
  className?: string;
}

/**
 * Empty state — icon in a tinted circle, one-line explanation, optional
 * primary action. Every data surface renders this instead of a blank area.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "animate-fade-in-up flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Retry callback — renders a Retry button when provided. */
  onRetry?: () => void;
  /** Alternative to onRetry: navigate to a URL. */
  retryHref?: string;
  className?: string;
}

/**
 * Error state — never swallow an error into an empty state. Destructive
 * tint, human message, retry affordance.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryHref,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "animate-fade-in-up flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
        <OctagonXIcon className="size-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {onRetry || retryHref ? (
        <div className="mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            render={retryHref ? <a href={retryHref} /> : undefined}
          >
            <RefreshCwIcon className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Skeleton block with the app's shimmer (sweep disabled for reduced motion). */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton rounded-md bg-foreground/[0.07]",
        className
      )}
    />
  );
}

/** Loading skeleton for a table / stacked list of rows. */
export function TableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5 p-5", className)}>
      <SkeletonBlock className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** Loading skeleton matching the StatCard footprint. */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-0 py-5", className)}>
      <CardContent className="px-5">
        <div className="flex items-start justify-between gap-2">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="size-8 rounded-lg" />
        </div>
        <SkeletonBlock className="mt-3 h-8 w-16" />
        <SkeletonBlock className="mt-2 h-3 w-20" />
      </CardContent>
    </Card>
  );
}

/** Loading skeleton for a KPI grid. */
export function StatGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Loading skeleton for a card with a title + list of rows. */
export function ListCardSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0", className)}>
      <SkeletonBlock className="m-5 mb-0 h-4 w-32" />
      <div className="space-y-2.5 p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4"
          >
            <SkeletonBlock className="h-4 flex-1" />
            <SkeletonBlock className="h-5 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}
