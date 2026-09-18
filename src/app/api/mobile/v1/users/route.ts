import {
  MobileApiError,
  parsePage,
  parseUuid,
  runMobileRoute,
  stringOrNull,
  stringValue,
} from "@/lib/mobile/daily"
import type { UserRole, UserStatus } from "@/types"

export const dynamic = "force-dynamic"

type DbRow = Record<string, unknown>

function parseRole(value: string | null): UserRole | null {
  if (value === null || value === "" || value === "all") return null
  if (value !== "employee" && value !== "admin" && value !== "super_admin") {
    throw new MobileApiError("INVALID_FIELD", "role is invalid.", 400, {
      role: "Must be employee, admin, or super_admin.",
    })
  }
  return value
}

function parseStatus(value: string | null): UserStatus | null {
  if (value === null || value === "" || value === "all") return null
  if (value !== "active" && value !== "inactive") {
    throw new MobileApiError("INVALID_FIELD", "status is invalid.", 400, {
      status: "Must be active or inactive.",
    })
  }
  return value
}

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async (context) => {
    if (context.user.role === "employee") {
      throw new MobileApiError(
        "FORBIDDEN",
        "You do not have permission to view users.",
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

    const params = new URL(request.url).searchParams
    const page = parsePage(params)
    const role = parseRole(params.get("role"))
    const status = parseStatus(params.get("status"))
    const departmentId = parseUuid(
      params.get("department_id"),
      "department_id",
    )
    const search = params.get("search")?.trim().slice(0, 100) ?? ""

    if (
      context.user.role === "admin" &&
      departmentId &&
      departmentId !== context.user.department_id
    ) {
      throw new MobileApiError(
        "FORBIDDEN",
        "You may only view users in your own department.",
        403,
      )
    }

    let query = context.client
      .from("app_user")
      .select("id,name,email,role,status,department_id,manager_id,must_change_pw,join_date,created_at,updated_at", {
        count: "exact",
      })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(page.offset, page.offset + page.page_size - 1)

    if (context.user.role === "admin") {
      query = query.eq("department_id", context.user.department_id)
    } else if (departmentId) {
      query = query.eq("department_id", departmentId)
    }
    if (role) query = query.eq("role", role)
    if (status) query = query.eq("status", status)
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    const rows = (data ?? []) as DbRow[]
    const departmentIds = Array.from(
      new Set(
        rows
          .map((row) => stringOrNull(row.department_id))
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const departments = new Map<string, string>()
    if (departmentIds.length > 0) {
      const departmentResult = await context.client
        .from("department")
        .select("id,name")
        .in("id", departmentIds)
      if (departmentResult.error) throw departmentResult.error
      for (const row of (departmentResult.data ?? []) as DbRow[]) {
        departments.set(stringValue(row.id), stringValue(row.name))
      }
    }

    return {
      items: rows.map((row) => {
        const rowDepartmentId = stringOrNull(row.department_id)
        return {
          id: stringValue(row.id),
          name: stringValue(row.name),
          email: stringValue(row.email),
          role: row.role as UserRole,
          status: row.status as UserStatus,
          department_id: rowDepartmentId,
          department_name: rowDepartmentId
            ? departments.get(rowDepartmentId) ?? null
            : null,
          manager_id: stringOrNull(row.manager_id),
          must_change_pw: Boolean(row.must_change_pw),
          join_date: stringValue(row.join_date),
          created_at: stringValue(row.created_at),
          updated_at: stringValue(row.updated_at),
        }
      }),
      page: page.page,
      page_size: page.page_size,
      total: count ?? 0,
    }
  })
}
