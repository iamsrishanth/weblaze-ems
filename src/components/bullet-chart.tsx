import { cn } from "@/lib/utils";
import { STATUS_COLORS, type StatusTone } from "@/components/status";

interface BulletChartProps {
  /** Current value. Always also rendered as text — never colour-only. */
  value: number;
  /** Target marker. Omit for a plain progress bar. */
  target?: number;
  /** Upper bound of the scale. Defaults to max(value, target) with headroom. */
  max?: number;
  /** Accessible name, e.g. "Leads". */
  label: string;
  /** Optional caption row on the left (defaults to the label). */
  caption?: React.ReactNode;
  /** Right-aligned value text (defaults to "value / target"). */
  valueLabel?: React.ReactNode;
  /** Bar colour tone. Defaults to positive green. */
  tone?: StatusTone;
  /** Hide the qualitative range bands (bad/ok/good). */
  hideBands?: boolean;
  className?: string;
}

/**
 * CSS-only bullet chart for KPI-vs-target (DESIGN.md §4).
 *
 * - Qualitative range bands (bad / ok / good) at ~12% opacity
 * - Measure bar in the status tone
 * - Target marker as a light vertical line
 * - The value is always visible as text next to the chart
 * - Exposed to screen readers via role="img" + aria-label
 */
export function BulletChart({
  value,
  target,
  max,
  label,
  caption,
  valueLabel,
  tone = "positive",
  hideBands = false,
  className,
}: BulletChartProps) {
  const targetValue = target ?? 0;
  const scaleMax = Math.max(max ?? 0, targetValue, value, 1);
  // Leave ~12% headroom past the target so the "good" band is visible.
  const upper = Math.max(
    scaleMax,
    targetValue > 0 ? Math.ceil(targetValue * 1.15) : scaleMax
  );
  const pct = (n: number) =>
    `${Math.min(100, Math.max(0, (n / upper) * 100)).toFixed(2)}%`;

  const reached = targetValue > 0 && value >= targetValue;
  const barTone: StatusTone =
    targetValue > 0 && !reached && value === 0 ? "neutral" : tone;

  const ariaLabel =
    targetValue > 0
      ? `${label}: ${value} against a target of ${targetValue} (${Math.round(
          (value / targetValue) * 100
        )}% of target)`
      : `${label}: ${value}`;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {caption ?? label}
        </span>
        <span className="numeric shrink-0 text-xs font-medium text-foreground">
          {valueLabel ??
            (targetValue > 0 ? (
              <>
                {value}
                <span className="text-muted-foreground"> / {targetValue}</span>
              </>
            ) : (
              value
            ))}
        </span>
      </div>
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative h-2.5 w-full rounded-full bg-foreground/10"
      >
        {/* Qualitative range bands */}
        {!hideBands && targetValue > 0 ? (
          <>
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-status-negative/15"
              style={{ width: pct(targetValue * 0.7) }}
            />
            <div
              className="absolute inset-y-0 bg-status-warning/15"
              style={{
                left: pct(targetValue * 0.7),
                width: `${Math.max(
                  0,
                  Math.min(
                    100 - (targetValue * 0.7 * 100) / upper,
                    ((targetValue - targetValue * 0.7) * 100) / upper
                  )
                ).toFixed(2)}%`,
              }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-full bg-status-positive/15"
              style={{ left: pct(targetValue) }}
            />
          </>
        ) : null}
        {/* Measure bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: pct(value),
            backgroundColor: STATUS_COLORS[barTone],
          }}
        />
        {/* Target marker */}
        {targetValue > 0 ? (
          <div
            aria-hidden="true"
            className="absolute top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-foreground/25 ring-2 ring-background"
            style={{ left: pct(targetValue), marginLeft: -1.5 }}
          />
        ) : null}
      </div>
    </div>
  );
}
