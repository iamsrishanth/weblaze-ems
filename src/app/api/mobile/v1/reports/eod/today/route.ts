import {
  EOD_COLUMNS,
  METRICS_COLUMNS,
  eodDto,
  metricsDto,
  organizationClock,
  runMobileRoute,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async ({ client, user }) => {
    const { date } = organizationClock()
    const { data: report, error } = await client
      .from("eod_report")
      .select(EOD_COLUMNS)
      .eq("user_id", user.id)
      .eq("report_date", date)
      .maybeSingle()
    if (error) throw error
    if (!report) return null
    const { data: metrics, error: metricsError } = await client
      .from("daily_metrics")
      .select(METRICS_COLUMNS)
      .eq("user_id", user.id)
      .eq("entry_date", date)
      .maybeSingle()
    if (metricsError) throw metricsError
    return {
      report: eodDto(report as Record<string, unknown>),
      metrics: metrics ? metricsDto(metrics as Record<string, unknown>) : null,
    }
  })
}
