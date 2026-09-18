import {
  TASK_COLUMNS,
  MobileApiError,
  parseUuid,
  runMobileRoute,
  taskDto,
  taskNames,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return runMobileRoute(request, async (userContext) => {
    const id = parseUuid((await context.params).id, "id")
    if (!id) throw new MobileApiError("INVALID_FIELD", "Task id is required.", 400)
    const { data, error } = await userContext.client.from("task").select(TASK_COLUMNS).eq("id", id).maybeSingle()
    if (error) throw error
    if (!data) throw new MobileApiError("NOT_FOUND", "Task not found.", 404)
    const row = data as Record<string, unknown>
    const assignedTo = String(row.assigned_to)
    if (userContext.user.role === "employee" && assignedTo !== userContext.user.id) {
      throw new MobileApiError("NOT_FOUND", "Task not found.", 404)
    }
    if (userContext.user.role === "admin") {
      if (!userContext.user.department_id) throw new MobileApiError("SCOPE_REQUIRED", "An administrator must be assigned to a department.", 403)
      const { data: assignee, error: assigneeError } = await userContext.client.from("app_user").select("department_id").eq("id", assignedTo).maybeSingle()
      if (assigneeError) throw assigneeError
      if (!assignee || assignee.department_id !== userContext.user.department_id) throw new MobileApiError("NOT_FOUND", "Task not found.", 404)
    }
    const names = await taskNames(userContext, [row])
    return taskDto(row, names.get(String(row.id)))
  })
}
