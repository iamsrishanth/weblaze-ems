import {
  MobileApiError,
  eodDto,
  metricsDto,
  parseDate,
  parseOptionalNonNegativeInteger,
  parseStringArray,
  readJsonBody,
  requirePositiveHours,
  runMobileRoute,
} from "@/lib/mobile/daily"
import { createServiceClient } from "@/lib/supabase/admin"
import { isEodLate, organizationTimeParts } from "@/lib/work-schedule"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
type RouteContext = { params: Promise<{ date: string }> }

type IdempotentResult = {
  replayed?: boolean
  payload?: {
    report: Record<string, unknown>
    metrics: Record<string, unknown> | null
    warning?: string
  }
}

async function requestHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return runMobileRoute(request, async (userContext) => {
    const reportDate = parseDate((await context.params).date, "date")
    if (!reportDate) {
      throw new MobileApiError("INVALID_DATE", "A report date is required.", 422)
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim()
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
      throw new MobileApiError("IDEMPOTENCY_REQUIRED", "A stable Idempotency-Key is required for report submission.", 400, {
        "idempotency-key": "Use 1-128 letters, numbers, dots, underscores, colons, or hyphens.",
      })
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
    if (new Set(taskIds).size !== taskIds.length) {
      throw new MobileApiError("INVALID_FIELD", "task_ids must not contain duplicates.", 422, {
        task_ids: "Each task may only be listed once.",
      })
    }

    const leads = parseOptionalNonNegativeInteger(body.leads, "leads")
    const calls = parseOptionalNonNegativeInteger(body.calls, "calls")
    const expectedUpdatedAt = typeof body.expected_updated_at === "string" ? body.expected_updated_at : null

    const payload = {
      report_date: reportDate,
      summary,
      hours_worked: hours,
      task_ids: taskIds,
      leads: leads ?? null,
      calls: calls ?? null,
      expected_updated_at: expectedUpdatedAt,
    }
    const hash = await requestHash(payload)
    const service = createServiceClient()
    const result = await service.rpc("mobile_submit_eod_idempotent", {
      p_actor_id: userContext.user.id,
      p_operation: "eod.submit",
      p_idempotency_key: idempotencyKey,
      p_request_hash: hash,
      p_report_date: reportDate,
      p_summary: summary,
      p_hours: hours,
      p_task_ids: taskIds,
      p_status: (() => {
        const current = organizationTimeParts()
        return isEodLate(current.hour, current.minute) ? "late" : "submitted"
      })(),
      p_submitted_at: new Date().toISOString(),
      p_leads: leads,
      p_calls: calls,
      p_expected_updated_at: expectedUpdatedAt,
    })
    if (result.error) throw result.error

    const idempotent = result.data as IdempotentResult | null
    const response = idempotent?.payload
    if (!response?.report) {
      throw new MobileApiError("INTERNAL_ERROR", "The server did not return the saved report.", 500)
    }
    return {
      replayed: idempotent?.replayed === true,
      report: eodDto(response.report),
      metrics: response.metrics ? metricsDto(response.metrics) : null,
      warning: response.warning ?? (userContext.department?.name.toLocaleLowerCase().includes("sales") ? undefined : "Sales metrics are not enabled for this department."),
    }
  })
}
