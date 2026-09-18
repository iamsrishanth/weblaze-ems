import {
  MobileApiError,
  TASK_COLUMNS,
  TASK_STATUSES,
  parseUuid,
  readJsonBody,
  runMobileRoute,
  taskDto,
  taskNames,
  validateEnum,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"
type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return runMobileRoute(request, async (userContext) => {
    const id = parseUuid((await context.params).id, "id")
    if (!id) throw new MobileApiError("INVALID_FIELD", "Task id is required.", 400)
    const body = await readJsonBody(request)
    const status = validateEnum(body.status, TASK_STATUSES, "status")
    if (typeof body.expected_updated_at !== "string" || !body.expected_updated_at) {
      throw new MobileApiError("INVALID_FIELD", "expected_updated_at is required.", 422, { expected_updated_at: "This field is required." })
    }

    const { data: task, error } = await userContext.client.from("task").select(TASK_COLUMNS).eq("id", id).maybeSingle()
    if (error) throw error
    if (!task) throw new MobileApiError("NOT_FOUND", "Task not found.", 404)
    const row = task as Record<string, unknown>
    const assignedTo = String(row.assigned_to)
    if (userContext.user.role === "employee" && assignedTo !== userContext.user.id) throw new MobileApiError("FORBIDDEN", "You may only update your assigned tasks.", 403)
    if (userContext.user.role === "admin") {
      if (!userContext.user.department_id) throw new MobileApiError("SCOPE_REQUIRED", "An administrator must be assigned to a department.", 403)
      const { data: assignee, error: assigneeError } = await userContext.client.from("app_user").select("department_id").eq("id", assignedTo).maybeSingle()
      if (assigneeError) throw assigneeError
      if (!assignee || assignee.department_id !== userContext.user.department_id) throw new MobileApiError("FORBIDDEN", "The task is outside your department.", 403)
    }
    if (String(row.updated_at) !== body.expected_updated_at) throw new MobileApiError("CONFLICT", "Task was updated by another request. Reload before saving.", 409)

    const { data: updated, error: updateError } = await userContext.client
      .from("task")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("updated_at", body.expected_updated_at)
      .select(TASK_COLUMNS)
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) throw new MobileApiError("CONFLICT", "Task was updated by another request. Reload before saving.", 409)
    const updatedRow = updated as Record<string, unknown>
    const names = await taskNames(userContext, [updatedRow])
    return taskDto(updatedRow, names.get(String(updatedRow.id)))
  })
}
