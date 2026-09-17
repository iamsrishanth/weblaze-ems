import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Extra classes for the icon chip (e.g. tone the icon). */
  iconClassName?: string;
  /** Small line under the value — context for the number. */
  hint?: ReactNode;
  /** Extra content under the value (e.g. a <BulletChart />). */
  children?: ReactNode;
  /** Tint the value (e.g. positive green for "Present Today"). */
  valueClassName?: string;
  className?: string;
}

/**
 * KPI stat card — one consistent card for every dashboard metric.
 * Title 13px medium, value 26px semibold mono with tabular numerals.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  hint,
  children,
  valueClassName,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("animate-fade-in-up gap-0 py-5", className)}>
      <CardContent className="px-5">
        <div className="flex items-start justify-between gap-2">
          <p className="pt-1 text-[13px] font-medium text-muted-foreground">
            {label}
          </p>
          {Icon ? (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground",
                iconClassName
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "numeric mt-1.5 text-[26px] leading-9 font-semibold tracking-tight text-foreground",
            valueClassName
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
