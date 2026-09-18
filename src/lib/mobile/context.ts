import "server-only"

import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/server"
import type { AppUser, Department } from "@/types"

import { MobileApiError } from "./api"

const APP_USER_COLUMNS = [
  "id",
  "email",
  "name",
  "role",
  "department_id",
  "manager_id",
  "status",
  "must_change_pw",
  "join_date",
  "created_at",
  "updated_at",
].join(",")

const DEPARTMENT_COLUMNS = [
  "id",
  "name",
  "head_id",
  "leads_target",
  "calls_target",
  "is_active",
  "created_at",
  "updated_at",
].join(",")

export type MobileUserContext = {
  client: SupabaseClient<Database>
  auth_user: SupabaseAuthUser
  user: AppUser
  department: Department | null
}

export function parseBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim()

  if (!authorization) {
    throw new MobileApiError(
      "AUTH_REQUIRED",
      "A Bearer access token is required.",
      401,
    )
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization)
  if (!match) {
    throw new MobileApiError(
      "AUTH_REQUIRED",
      "A Bearer access token is required.",
      401,
    )
  }

  return match[1]
}

export function createUserScopedClient(
  accessToken: string,
): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new MobileApiError(
      "SERVER_MISCONFIGURED",
      "The authentication service is not configured.",
      500,
    )
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

export async function getMobileUserContext(
  request: Request,
): Promise<MobileUserContext> {
  const accessToken = parseBearerToken(request)
  const client = createUserScopedClient(accessToken)

  let authResult: Awaited<ReturnType<typeof client.auth.getUser>>
  try {
    authResult = await client.auth.getUser(accessToken)
  } catch {
    throw new MobileApiError(
      "AUTH_UNAVAILABLE",
      "Authentication could not be verified.",
      503,
    )
  }

  if (authResult.error || !authResult.data.user) {
    throw new MobileApiError(
      "INVALID_TOKEN",
      "The access token is invalid or expired.",
      401,
    )
  }

  const authUser = authResult.data.user
  const profileResult = await client
    .from("app_user")
    .select(APP_USER_COLUMNS)
    .eq("id", authUser.id)
    .maybeSingle()

  if (profileResult.error) {
    throw new MobileApiError(
      "PROFILE_LOOKUP_FAILED",
      "The user profile could not be loaded.",
      500,
    )
  }

  const user = profileResult.data as AppUser | null
  if (!user) {
    throw new MobileApiError(
      "PROFILE_UNAVAILABLE",
      "An active application profile is required.",
      403,
    )
  }

  if (user.status !== "active") {
    throw new MobileApiError(
      "ACCOUNT_INACTIVE",
      "This account is inactive.",
      403,
    )
  }

  let department: Department | null = null
  if (user.department_id) {
    const departmentResult = await client
      .from("department")
      .select(DEPARTMENT_COLUMNS)
      .eq("id", user.department_id)
      .maybeSingle()

    if (departmentResult.error) {
      throw new MobileApiError(
        "DEPARTMENT_LOOKUP_FAILED",
        "The department could not be loaded.",
        500,
      )
    }

    department = departmentResult.data as Department | null
  }

  return {
    client,
    auth_user: authUser,
    user,
    department,
  }
}
