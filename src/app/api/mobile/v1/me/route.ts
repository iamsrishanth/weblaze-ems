import {
  createRequestId,
  jsonError,
  jsonSuccess,
  MobileApiError,
  normalizeMobileError,
  ORGANIZATION_TIMEZONE,
  ORGANIZATION_WORKWEEK,
} from "@/lib/mobile/api"
import { getMobileUserContext } from "@/lib/mobile/context"
import type { UserRole } from "@/types"

export const dynamic = "force-dynamic"

function getCapabilities(
  role: UserRole,
  departmentName: string | null,
) {
  const isManager = role === "admin" || role === "super_admin"
  const isSuperAdmin = role === "super_admin"

  return {
    can_view_team: isManager,
    can_manage_tasks: isManager,
    can_manage_users: isManager,
    can_manage_departments: isSuperAdmin,
    can_view_reports: isManager,
    can_export: true,
    uses_sales_metrics:
      departmentName?.toLocaleLowerCase().includes("sales") ?? false,
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestId = createRequestId()

  try {
    const { user, department } = await getMobileUserContext(request)
    const serverTime = new Date()

    return jsonSuccess(
      {
        user,
        department,
        capabilities: getCapabilities(user.role, department?.name ?? null),
        organization: {
          timezone: ORGANIZATION_TIMEZONE,
          workweek: [...ORGANIZATION_WORKWEEK],
        },
        setup_required: user.must_change_pw,
        server_time: serverTime.toISOString(),
      },
      requestId,
      200,
      serverTime,
    )
  } catch (error) {
    const mobileError =
      error instanceof MobileApiError ? error : normalizeMobileError(error)

    return jsonError(mobileError, requestId)
  }
}
