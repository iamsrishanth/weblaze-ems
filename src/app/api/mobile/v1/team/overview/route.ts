import {
  MobileApiError,
  fetchDepartmentNames,
  organizationClock,
  parseUuid,
  runMobileRoute,
  stringOrNull,
  stringValue,
} from "@/lib/mobile/daily"
import type { UserRole, UserStatus } from "@/types"

export const dynamic = "force-dynamic"

type DbRow = Record<string, unknown>

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    if (context.user.role === "employee") {
      throw new MobileApiError(
        "FORBIDDEN",
        "You do not have permission to view team information.",
        403,
      )
    }

    if (context.user.role === "admin" && !context.user.department_id) {
      throw new MobileApiError(
        "SCOPE_REQUIRED",
        "An administrator must be assigned to a department.",
        403,
      )
    }

    const requestedDepartmentId = parseUuid(
      new URL(request.url).searchParams.get("department_id"),
      "department_id",
    )

    let usersQuery = context.client
      .from("app_user")
      .select("id,name,role,status,department_id")
      .eq("status", "active")
      .order("name", { ascending: true })
      .order("id", { ascending: true })

    if (context.user.role === "admin") {
      if (
        requestedDepartmentId &&
        requestedDepartmentId !== context.user.department_id
      ) {
        throw new MobileApiError(
          "FORBIDDEN",
          "You may only view your own department.",
          403,
        )
      }
      usersQuery = usersQuery.eq("department_id", context.user.department_id)
    } else if (requestedDepartmentId) {
      usersQuery = usersQuery.eq("department_id", requestedDepartmentId)
    }

    const { data: userData, error: usersError } = await usersQuery
    if (usersError) throw usersError

    const users = (userData ?? []) as DbRow[]
    if (users.length === 0) {
      return {
        members: [],
        not_checked_in_count: 0,
        missing_eod_count: 0,
        blocked_task_count: 0,
      }
    }

    const userIds = users.map((row) => stringValue(row.id)).filter(Boolean)
    const date = organizationClock().date

    const [attendanceResult, eodResult, blockedTaskResult] = await Promise.all([
      context.client
        .from("attendance")
        .select("user_id,check_in_at")
        .in("user_id", userIds)
        .eq("work_date", date),
      context.client
        .from("eod_report")
        .select("user_id,status")
        .in("user_id", userIds)
        .eq("report_date", date),
      context.client
        .from("task")
        .select("assigned_to")
        .in("assigned_to", userIds)
        .eq("status", "blocked"),
    ])

    if (attendanceResult.error) throw attendanceResult.error
    if (eodResult.error) throw eodResult.error
    if (blockedTaskResult.error) throw blockedTaskResult.error

    const checkedInIds = new Set(
      ((attendanceResult.data ?? []) as DbRow[])
        .filter((row) => Boolean(row.check_in_at))
        .map((row) => stringValue(row.user_id))
        .filter(Boolean),
    )
    const submittedEodIds = new Set(
      ((eodResult.data ?? []) as DbRow[])
        .filter((row) => row.status === "submitted" || row.status === "late")
        .map((row) => stringValue(row.user_id))
        .filter(Boolean),
    )
    const blockedTaskCounts = new Map<string, number>()
    for (const row of (blockedTaskResult.data ?? []) as DbRow[]) {
      const userId = stringValue(row.assigned_to)
      if (userId) {
        blockedTaskCounts.set(userId, (blockedTaskCounts.get(userId) ?? 0) + 1)
      }
    }

    const departmentIds = Array.from(
      new Set(
        users
          .map((row) => stringOrNull(row.department_id))
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const departmentNames = await fetchDepartmentNames(
      context.client,
      departmentIds,
    )

    const members = users.map((row) => {
      const userId = stringValue(row.id)
      const blockedTaskCount = blockedTaskCounts.get(userId) ?? 0
      const departmentId = stringOrNull(row.department_id)
      return {
        id: userId,
        name: stringValue(row.name),
        role: row.role as UserRole,
        status: row.status as UserStatus,
        department_name: departmentId
          ? departmentNames.get(departmentId) ?? null
          : null,
        checked_in: checkedInIds.has(userId),
        eod_submitted: submittedEodIds.has(userId),
        blocked_task_count: blockedTaskCount,
      }
    })

    return {
      members,
      not_checked_in_count: members.filter((member) => !member.checked_in).length,
      missing_eod_count: members.filter((member) => !member.eod_submitted).length,
      blocked_task_count: members.reduce(
        (total, member) => total + member.blocked_task_count,
        0,
      ),
    }
  })
}
