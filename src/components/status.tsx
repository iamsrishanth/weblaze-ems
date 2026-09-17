import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Centralised status colour system — the single source of truth.
 *
 * DESIGN.md §3 status colour map:
 *   Present / submitted / done ........ #22C55E (positive)
 *   Late .............................. #F59E0B (warning)
 *   Half day .......................... #38BDF8 (partial — not negative)
 *   Missed / not submitted / overdue .. #EF4444 (negative)
 *   Neutral / pending ................. #94A3B8 (neutral)
 *
 * Rules:
 *  - Never encode status in colour alone — `<StatusPill>` always renders a
 *    text label next to the colour dot (WCAG 1.4.1).
 *  - The dot carries the exact brand colour; the label uses a lighter tint
 *    so text contrast stays ≥ 4.5:1 on the dark card surface (#1E293B).
 *  - The Weblaze blue is NOT a status colour (links / selected states only).
 */

export type StatusTone =
  | "positive"
  | "warning"
  | "partial"
  | "negative"
  | "neutral";

/** The exact DESIGN.md status colours (dots, bars, charts). */
export const STATUS_COLORS: Record<StatusTone, string> = {
  positive: "#22C55E",
  warning: "#F59E0B",
  partial: "#38BDF8",
  negative: "#EF4444",
  neutral: "#94A3B8",
};

/** Readable label tints for text on dark surfaces. */
const TONE_TEXT: Record<StatusTone, string> = {
  positive: "text-[#4ADE80]",
  warning: "text-[#FCD34D]",
  partial: "text-[#7DD3FC]",
  negative: "text-[#FCA5A5]",
  neutral: "text-[#CBD5E1]",
};

const TONE_PILL: Record<StatusTone, string> = {
  positive:
    "border-status-positive/25 bg-status-positive/10 text-[#4ADE80]",
  warning: "border-status-warning/25 bg-status-warning/10 text-[#FCD34D]",
  partial: "border-status-partial/25 bg-status-partial/10 text-[#7DD3FC]",
  negative:
    "border-status-negative/25 bg-status-negative/10 text-[#FCA5A5]",
  neutral: "border-status-neutral/25 bg-status-neutral/10 text-[#CBD5E1]",
};

/** Class string for inline links / "view all" anchors (Weblaze blue accent). */
export const LINK_CLASSES =
  "text-blue-400 transition-colors duration-150 hover:text-blue-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400";

/**
 * Map any status-ish string used in the app to a tone.
 * Covers attendance, EOD, task status, task priority, user status.
 */
export function statusTone(status: string): StatusTone {
  switch (status) {
    // attendance / EOD / tasks / users — positive
    case "present":
    case "submitted":
    case "done":
    case "active":
      return "positive";
    // late
    case "late":
      return "warning";
    // partial (sky)
    case "half_day":
    case "in_progress":
      return "partial";
    // negative
    case "missed":
    case "absent":
    case "blocked":
    case "not_submitted":
    case "inactive":
    case "overdue":
      return "negative";
    // priorities: escalating ramp slate → sky → amber → red
    case "medium":
      return "partial";
    case "high":
      return "warning";
    case "urgent":
      return "negative";
    // neutral / unstarted
    default:
      return "neutral";
  }
}

/** Human label for a status string ("half_day" → "Half Day"). */
export function statusLabel(status: string): string {
  switch (status) {
    case "half_day":
      return "Half Day";
    case "in_progress":
      return "In Progress";
    case "not_submitted":
      return "Not Submitted";
    case "todo":
      return "To Do";
    default:
      return status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Text colour classes for a tone (e.g. tinting a KPI number). */
export function toneText(tone: StatusTone): string {
  return TONE_TEXT[tone];
}

interface StatusPillProps {
  /** Raw status value, e.g. "half_day", "submitted", "urgent". */
  status: string;
  /** Override the derived label. */
  label?: string;
  className?: string;
  /** Render a larger pill (page-level status displays). */
  size?: "sm" | "md";
}

/**
 * Status pill: colour dot + text label. The only sanctioned way to render
 * attendance / EOD / task / user status anywhere in the app.
 */
export function StatusPill({
  status,
  label,
  className,
  size = "sm",
}: StatusPillProps) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_PILL[tone],
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          size === "sm" ? "" : "size-2"
        )}
        style={{ backgroundColor: STATUS_COLORS[tone] }}
      />
      {label ?? statusLabel(status)}
    </span>
  );
}

/** Neutral identity badge (role chip) — deliberately NOT status-coloured. */
export function RoleBadge({
  role,
  className,
}: {
  role: string;
  className?: string;
}) {
  const label =
    role === "super_admin"
      ? "Super Admin"
      : role === "admin"
        ? "Admin"
        : "Employee";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-300",
        className
      )}
    >
      {label}
    </span>
  );
}

/** Compact stat row: dot + label + numeric value, for summary strips. */
export function StatusCount({
  status,
  count,
  className,
}: {
  status: string;
  count: ReactNode;
  className?: string;
}) {
  const tone = statusTone(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[tone] }}
      />
      <span className="text-xs text-muted-foreground">
        {statusLabel(status)}
      </span>
      <span className={cn("numeric text-xs font-semibold", TONE_TEXT[tone])}>
        {count}
      </span>
    </span>
  );
}
