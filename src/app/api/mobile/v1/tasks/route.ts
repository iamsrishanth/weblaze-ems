import {
  TASK_COLUMNS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  MobileApiError,
  parseDate,
  parsePage,
  parseUuid,
  runMobileRoute,
  taskDto,
  taskNames,
  validateEnum,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    const params = new URL(request.url).searchParams
    const page = parsePage(params)
    const requestedAssignee = parseUuid(params.get("assigned_to"), "assigned_to")
    if (context.user.role === "employee" && requestedAssignee && requestedAssignee !== context.user.id) {
      throw new MobileApiError("FORBIDDEN", "You may only access your own tasks.", 403)
    }
    if (context.user.role === "admin" && !context.user.department_id) {
      throw new MobileApiError("SCOPE_REQUIRED", "An administrator must be assigned to a department.", 403)
    }

    const query = context.client
      .from("task")
      .select(TASK_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page.offset, page.offset + page.page_size - 1)

    if (context.user.role === "employee") {
      query.eq("assigned_to", context.user.id)
    } else if (requestedAssignee) {
      query.eq("assigned_to", requestedAssignee)
    } else if (context.user.role === "admin") {
      const { data: users, error } = await context.client.from("app_user").select("id").eq("department_id", context.user.department_id)
      if (error) throw error
      const ids = (users ?? []).map((row) => row.id as string)
      if (ids.length === 0) return { items: [], page: page.page, page_size: page.page_size, total: 0 }
      query.in("assigned_to", ids)
    }

    const status = params.get("status")
    const priority = params.get("priority")
    if (status && status !== "all") query.eq("status", validateEnum(status, TASK_STATUSES, "status"))
    if (priority && priority !== "all") query.eq("priority", validateEnum(priority, TASK_PRIORITIES, "priority"))
    const search = params.get("search")
    if (search) query.ilike("title", `%${search.slice(0, 100)}%`)
    const dueFrom = parseDate(params.get("due_from"), "due_from")
    const dueTo = parseDate(params.get("due_to"), "due_to")
    if (dueFrom) query.gte("due_date", dueFrom)
    if (dueTo) query.lte("due_date", dueTo)

    const { data, error, count } = await query
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    const names = await taskNames(context, rows)
    return {
      items: rows.map((row) => taskDto(row, names.get(String(row.id)))),
      page: page.page,
      page_size: page.page_size,
      total: count ?? 0,
    }
  })
}
