import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ListCardProps {
  title: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Right-aligned header action (usually a "View all" link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Standard list card — small title with icon, optional header action, and
 * a body that typically holds rows divided by hairlines. The consistent
 * container for every non-tabular list on the dashboard and screens.
 */
export function ListCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  contentClassName,
}: ListCardProps) {
  return (
    <Card className={cn("animate-fade-in-up gap-0 py-0", className)}>
      <CardHeader className="flex-row items-center justify-between border-b border-border/60 px-5 py-3.5">
        <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          {Icon ? <Icon className="size-4 shrink-0" /> : null}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className={contentClassName ?? "p-0"}>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Standard row inside a ListCard body: divide-y container + these rows
 * gives the app's one list rhythm with hover feedback.
 */
export function ListRow({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-accent/40",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Hairline row divider container for ListRow children. */
export function ListRows({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("divide-y divide-border/60", className)}
      {...props}
    >
      {children}
    </div>
  );
}
