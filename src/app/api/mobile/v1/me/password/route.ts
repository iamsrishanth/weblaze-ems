import {
  createRequestId,
  jsonError,
  jsonSuccess,
  MobileApiError,
  normalizeMobileError,
} from "@/lib/mobile/api"
import { getMobileUserContext } from "@/lib/mobile/context"
import { readJsonBody } from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const requestId = createRequestId()

  try {
    const context = await getMobileUserContext(request)
    const body = await readJsonBody(request)
    const password = typeof body.password === "string" ? body.password : ""
    const confirmPassword =
      typeof body.confirm_password === "string" ? body.confirm_password : ""

    if (password.length < 8) {
      throw new MobileApiError(
        "VALIDATION_ERROR",
        "Password must be at least 8 characters.",
        422,
        { password: "Use at least 8 characters." },
      )
    }
    if (password !== confirmPassword) {
      throw new MobileApiError(
        "VALIDATION_ERROR",
        "Passwords do not match.",
        422,
        { confirm_password: "Passwords must match." },
      )
    }

    const { error: authError } = await context.client.auth.updateUser({
      password,
    })
    if (authError) {
      throw new MobileApiError(
        "PASSWORD_UPDATE_FAILED",
        "The password could not be updated.",
        422,
      )
    }

    const { data, error: profileError } = await context.client
      .from("app_user")
      .update({ must_change_pw: false })
      .eq("id", context.user.id)
      .select("id,email,name,role,department_id,manager_id,status,must_change_pw,join_date,created_at,updated_at")
      .single()
    if (profileError || !data) {
      throw new MobileApiError(
        "PROFILE_UPDATE_FAILED",
        "The password changed, but the account setup state could not be saved. Please retry.",
        500,
      )
    }

    return jsonSuccess(
      {
        user: data,
        department: context.department,
        capabilities: {
          can_view_team: context.user.role !== "employee",
          can_manage_tasks: context.user.role !== "employee",
          can_manage_users: context.user.role !== "employee",
          can_manage_departments: context.user.role === "super_admin",
          can_view_reports: context.user.role !== "employee",
          can_export: true,
          uses_sales_metrics:
            context.department?.name.toLocaleLowerCase().includes("sales") ?? false,
        },
        organization: {
          timezone: "Asia/Kolkata",
          workweek: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ],
        },
        setup_required: false,
        server_time: new Date().toISOString(),
      },
      requestId,
    )
  } catch (error) {
    return jsonError(
      error instanceof MobileApiError ? error : normalizeMobileError(error),
      requestId,
    )
  }
}
