import {
  ATTENDANCE_COLUMNS,
  MobileApiError,
  attendanceDto,
  organizationClock,

  parseMonth,
  parsePage,
  parseUuid,
  runMobileRoute,
  scopedUserIds,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    const url = new URL(request.url)
    const params = url.searchParams
    const page = parsePage(params)
    const requestedUserId = parseUuid(params.get("user_id"), "user_id")
    const month = parseMonth(params.get("month"))
    const userIds = await scopedUserIds(context, requestedUserId)
    const query = context.client
      .from("attendance")
      .select(ATTENDANCE_COLUMNS, { count: "exact" })
      .order("work_date", { ascending: false })
      .order("id", { ascending: false })
      .range(page.offset, page.offset + page.page_size - 1)

    if (userIds && userIds.length === 0) {
      return { items: [], page: page.page, page_size: page.page_size, total: 0 }
    }
    if (userIds) query.in("user_id", userIds)
    if (month) {
      const [year, monthNumber] = month.split("-").map(Number)
      const nextMonth = monthNumber === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`
      query.gte("work_date", `${month}-01`)
      query.lt("work_date", nextMonth)
    }

    const { data, error, count } = await query
    if (error) throw error
    return {
      items: (data ?? []).map((row) => attendanceDto(row as Record<string, unknown>)),
      page: page.page,
      page_size: page.page_size,
      total: count ?? 0,
    }
  })
}

export async function assertToday(date: string): Promise<void> {
  if (date !== organizationClock().date) {
    throw new MobileApiError("INVALID_DATE", "Attendance writes are limited to the current organization day.", 422)
  }
}
