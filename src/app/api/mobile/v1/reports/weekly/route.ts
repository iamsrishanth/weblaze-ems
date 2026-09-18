import {
  WEEKLY_COLUMNS,
  parsePage,
  parseUuid,
  runMobileRoute,
  scopedUserIds,
  weeklyDto,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    const params = new URL(request.url).searchParams
    const page = parsePage(params)
    const requestedUserId = parseUuid(params.get("user_id"), "user_id")
    const userIds = await scopedUserIds(context, requestedUserId)
    const query = context.client
      .from("weekly_report")
      .select(WEEKLY_COLUMNS, { count: "exact" })
      .order("week_start", { ascending: false })
      .order("id", { ascending: false })
      .range(page.offset, page.offset + page.page_size - 1)

    if (userIds && userIds.length === 0) {
      return { items: [], page: page.page, page_size: page.page_size, total: 0 }
    }
    if (userIds) query.in("user_id", userIds)
    const weekStart = params.get("week_start")
    if (weekStart) query.eq("week_start", weekStart)

    const { data, error, count } = await query
    if (error) throw error
    return {
      items: (data ?? []).map((row) => weeklyDto(row as Record<string, unknown>)),
      page: page.page,
      page_size: page.page_size,
      total: count ?? 0,
    }
  })
}
