import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned action area (primary action first). */
  actions?: ReactNode;
  /** Optional filter row rendered under the title (tabs, selects…). */
  children?: ReactNode;
  className?: string;
}

/**
 * Sticky page header — title + primary action + filters.
 *
 * Sticks below the mobile top bar (h-14) on small screens and to the very
 * top from `md:` up (the mobile bar is `md:hidden`, so there is nothing
 * to sit below above 768px), with a translucent blurred backdrop so content
 * scrolls underneath without visual noise. Bleeds to the content container
 * edges via negative margins.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <header className="sticky top-14 z-30 -mx-4 border-b border-border/70 bg-background/85 px-4 py-4 backdrop-blur-md md:top-0 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
        {children ? (
          <div className="mt-3 min-w-0 overflow-x-auto">{children}</div>
        ) : null}
      </header>
    </div>
  );
}
