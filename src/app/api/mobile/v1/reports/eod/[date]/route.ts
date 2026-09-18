import {
  EOD_COLUMNS,
  MobileApiError,
  eodDto,
  organizationClock,
  parseDate,
  parseOptionalNonNegativeInteger,
  parseStringArray,
  readJsonBody,
  requirePositiveHours,
  runMobileRoute,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"
type RouteContext = { params: Promise<{ date: string }> }

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return runMobileRoute(request, async (userContext) => {
    const reportDate = parseDate((await context.params).date, "date")
    const { date: today, hour } = organizationClock()
    if (!reportDate || reportDate !== today) {
      throw new MobileApiError("INVALID_DATE", "Only the current organization day can be submitted.", 422)
    }
    const body = await readJsonBody(request)
    const summary = typeof body.summary === "string" ? body.summary.trim() : ""
    if (summary.length < 10) {
      throw new MobileApiError("VALIDATION_ERROR", "Summary must be at least 10 characters.", 422, {
        summary: "Use at least 10 characters.",
      })
    }
    const hours = requirePositiveHours(body.hours_worked ?? body.hours)
    const taskIds = parseStringArray(body.task_ids, "task_ids") ?? []
    const leads = parseOptionalNonNegativeInteger(body.leads, "leads")
    const calls = parseOptionalNonNegativeInteger(body.calls, "calls")
    const existingResult = await userContext.client
      .from("eod_report")
      .select(EOD_COLUMNS)
      .eq("user_id", userContext.user.id)
      .eq("report_date", reportDate)
      .maybeSingle()
    if (existingResult.error) throw existingResult.error
    const existing = existingResult.data as Record<string, unknown> | null
    const expected = body.expected_updated_at
    if (existing && (typeof expected !== "string" || String(existing.updated_at) !== expected)) {
      throw new MobileApiError("CONFLICT", "The report changed elsewhere. Reload before saving.", 409)
    }
    const status = hour >= 18 ? "late" : "submitted"
    const payload = {
      summary,
      hours_worked: hours,
      tasks_completed: taskIds,
      status,
      submitted_at: new Date().toISOString(),
    }
    const reportQuery = existing
      ? userContext.client.from("eod_report").update(payload).eq("id", String(existing.id)).eq("updated_at", String(existing.updated_at))
      : userContext.client.from("eod_report").insert({
          user_id: userContext.user.id,
          report_date: reportDate,
          ...payload,
        })
    const reportResult = await reportQuery.select(EOD_COLUMNS).maybeSingle()
    if (reportResult.error) {
      if (reportResult.error.code === "23505") {
        throw new MobileApiError("CONFLICT", "The report already exists. Reload before saving.", 409)
      }
      throw reportResult.error
    }
    if (!reportResult.data) throw new MobileApiError("CONFLICT", "The report changed elsewhere. Reload before saving.", 409)

    const shouldWriteMetrics = userContext.department?.name.toLocaleLowerCase().includes("sales") && (leads !== undefined || calls !== undefined)
    if (shouldWriteMetrics) {
      const metricsPayload = { user_id: userContext.user.id, entry_date: reportDate, leads: leads ?? 0, calls: calls ?? 0 }
      const metricsResult = await userContext.client.from("daily_metrics").upsert(metricsPayload, { onConflict: "user_id,entry_date" })
      if (metricsResult.error) throw metricsResult.error
    }
    return {
      report: eodDto(reportResult.data as Record<string, unknown>),
      metrics: null,
      warning: shouldWriteMetrics ? undefined : "Sales metrics are not enabled for this department.",
    }
  })
}
