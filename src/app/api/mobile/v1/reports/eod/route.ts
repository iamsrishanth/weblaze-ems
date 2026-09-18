import {
  EOD_COLUMNS,
  METRICS_COLUMNS,
  eodDto,
  metricsDto,
  parseDate,
  parsePage,
  parseUuid,
  runMobileRoute,
  scopedUserIds,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    const params = new URL(request.url).searchParams
    const page = parsePage(params)
    const requestedUserId = parseUuid(params.get("user_id"), "user_id")
    const dateFrom = parseDate(params.get("date_from"), "date_from")
    const dateTo = parseDate(params.get("date_to"), "date_to")
    const userIds = await scopedUserIds(context, requestedUserId)
    const query = context.client
      .from("eod_report")
      .select(EOD_COLUMNS, { count: "exact" })
      .order("report_date", { ascending: false })
      .order("id", { ascending: false })
      .range(page.offset, page.offset + page.page_size - 1)

    if (userIds && userIds.length === 0) {
      return { items: [], page: page.page, page_size: page.page_size, total: 0 }
    }
    if (userIds) query.in("user_id", userIds)
    if (dateFrom) query.gte("report_date", dateFrom)
    if (dateTo) query.lte("report_date", dateTo)

    const { data, error, count } = await query
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    const metricDates = rows.map((row) => String(row.report_date)).filter(Boolean)
    const metrics = new Map<string, Record<string, unknown>>()
    if (metricDates.length > 0 && userIds && userIds.length > 0) {
      const metricsQuery = context.client
        .from("daily_metrics")
        .select(METRICS_COLUMNS)
        .in("user_id", userIds)
        .in("entry_date", metricDates)
      const result = await metricsQuery
      if (result.error) throw result.error
      for (const row of (result.data ?? []) as Record<string, unknown>[]) {
        metrics.set(`${String(row.user_id)}:${String(row.entry_date)}`, row)
      }
    }

    return {
      items: rows.map((row) => ({
        report: eodDto(row),
        metrics: metrics.has(`${String(row.user_id)}:${String(row.report_date)}`)
          ? metricsDto(metrics.get(`${String(row.user_id)}:${String(row.report_date)}`) as Record<string, unknown>)
          : null,
      })),
      page: page.page,
      page_size: page.page_size,
      total: count ?? 0,
    }
  })
}
