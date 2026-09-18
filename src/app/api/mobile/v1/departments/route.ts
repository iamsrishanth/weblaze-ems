import {
  MobileApiError,
  runMobileRoute,
  stringOrNull,
  stringValue,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

type DbRow = Record<string, unknown>

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    if (context.user.role !== "super_admin") {
      throw new MobileApiError(
        "FORBIDDEN",
        "Only super admins can view all departments.",
        403,
      )
    }

    const { data: departmentData, error: departmentError } = await context.client
      .from("department")
      .select("id,name,head_id,leads_target,calls_target,is_active,created_at,updated_at")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
    if (departmentError) throw departmentError

    const departments = (departmentData ?? []) as DbRow[]
    const headIds = Array.from(
      new Set(
        departments
          .map((row) => stringOrNull(row.head_id))
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const headNames = new Map<string, string>()
    if (headIds.length > 0) {
      const { data: heads, error: headsError } = await context.client
        .from("app_user")
        .select("id,name")
        .in("id", headIds)
      if (headsError) throw headsError
      for (const row of (heads ?? []) as DbRow[]) {
        headNames.set(stringValue(row.id), stringValue(row.name))
      }
    }

    const { data: users, error: usersError } = await context.client
      .from("app_user")
      .select("id,department_id")
      .eq("status", "active")
    if (usersError) throw usersError

    const memberCounts = new Map<string, number>()
    for (const row of (users ?? []) as DbRow[]) {
      const departmentId = stringOrNull(row.department_id)
      if (departmentId) {
        memberCounts.set(
          departmentId,
          (memberCounts.get(departmentId) ?? 0) + 1,
        )
      }
    }

    return {
      items: departments.map((row) => {
        const id = stringValue(row.id)
        const headId = stringOrNull(row.head_id)
        return {
          id,
          name: stringValue(row.name),
          head_id: headId,
          head_name: headId ? headNames.get(headId) ?? null : null,
          member_count: memberCounts.get(id) ?? 0,
          leads_target: Number(row.leads_target ?? 0),
          calls_target: Number(row.calls_target ?? 0),
          is_active: row.is_active !== false,
          created_at: stringValue(row.created_at),
          updated_at: stringValue(row.updated_at),
        }
      }),
    }
  })
}
