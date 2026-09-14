import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type {
  UserRole,
  AppUser,
  Department,
  AuthProfile,
  ActionResult,
} from '@/types'
import type { z } from 'zod'

// ---------------------------------------------------------------------------
// Custom error class for access-denial so callers can distinguish
// between auth errors and generic runtime errors.
// ---------------------------------------------------------------------------
export class AccessDeniedError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' = 'FORBIDDEN'
  ) {
    super(message)
    this.name = 'AccessDeniedError'
  }
}

// ---------------------------------------------------------------------------
// requireRole
//
// Usage inside a Server Action or Server Component:
//
//   const { user, profile } = await requireRole(['admin', 'super_admin'])
//
// Throws AccessDeniedError if:
//   1. No authenticated user (UNAUTHENTICATED)
//   2. Authenticated user has no matching `app_user` row (FORBIDDEN)
//   3. User's role is not in the allowed list (FORBIDDEN)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Cached profile lookup
//
// React's `cache` deduplicates within a single request. Keyed by user id only
// (not by the Supabase client, which is a fresh object on every call and would
// defeat the memoisation).
// ---------------------------------------------------------------------------
const loadProfile = cache(
  async (
    userId: string
  ): Promise<{ appUser: AppUser | null; profileError: unknown }> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('app_user')
      .select(
        'id, name, email, role, department_id, manager_id, status, must_change_pw, join_date'
      )
      .eq('id', userId)
      .maybeSingle<AppUser>()

    return { appUser: data, profileError: error }
  }
)

export async function requireRole(
  allowedRoles: UserRole[]
): Promise<AuthProfile> {
  const supabase = await createClient()

  // --- 1. Get the verified user from the Auth server ---
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new AccessDeniedError(
      'Authentication required. Please log in.',
      'UNAUTHENTICATED'
    )
  }

  // --- 2. Fetch the user's profile from app_user ---
  // Cached per request: a dashboard render triggers many server actions and
  // each one would otherwise re-read the same profile row.
  const { appUser, profileError } = await loadProfile(user.id)

  if (profileError || !appUser) {
    throw new AccessDeniedError(
      'User profile not found. Contact an administrator.',
      'FORBIDDEN'
    )
  }

  if (appUser.status !== 'active') {
    throw new AccessDeniedError(
      'Your account has been deactivated. Contact an administrator.',
      'FORBIDDEN'
    )
  }

  // --- 3. Role check ---
  if (!allowedRoles.includes(appUser.role)) {
    throw new AccessDeniedError(
      `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}. Your role: ${appUser.role}`,
      'FORBIDDEN'
    )
  }

  // --- 4. Optionally load the department ---
  let department: Department | null = null
  if (appUser.department_id) {
    const { data: dept } = await supabase
      .from('department')
      .select('*')
      .eq('id', appUser.department_id)
      .maybeSingle<Department>()

    department = dept ?? null
  }

  return { user: appUser, department }
}

// ---------------------------------------------------------------------------
// authenticatedAction
//
// Wraps a Server Action (`'use server'` function) so that:
//   1. Input is validated against a Zod schema.
//   2. requireRole() is called before the handler executes.
//   3. The handler receives the parsed input + the AuthProfile.
//
// Returns a standardised ActionResult:
//   { success: true, data }   on success
//   { success: false, error } on failure
//
// Example:
//
//   const loginSchema = z.object({ email: z.string().email() })
//
//   export const doSomething = authenticatedAction({
//     schema: loginSchema,
//     roles: ['admin'],
//     handler: async ({ input, profile }) => {
//       // … perform privileged work …
//       return { ok: true }
//     },
//   })
// ---------------------------------------------------------------------------
type ActionHandler<TInput, TOutput> = (ctx: {
  input: TInput
  profile: AuthProfile
}) => Promise<TOutput>

interface AuthenticatedActionOptions<TInput, TOutput> {
  /** Zod schema used to validate the raw input. */
  schema: z.ZodType<TInput>
  /** Roles allowed to execute this action. */
  roles: UserRole[]
  /** The actual business logic. */
  handler: ActionHandler<TInput, TOutput>
}

export function authenticatedAction<TInput, TOutput>({
  schema,
  roles,
  handler,
}: AuthenticatedActionOptions<TInput, TOutput>) {
  return async (rawInput: unknown): Promise<ActionResult<TOutput>> => {
    try {
      // 1. Validate input
      const parsed = schema.safeParse(rawInput)
      if (!parsed.success) {
        return {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path as (string | number)[],
            message: issue.message,
          })),
        }
      }

      // 2. Authorisation check
      const profile = await requireRole(roles)

      // 3. Execute business logic
      const result = await handler({ input: parsed.data, profile })

      return { success: true, data: result }
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        return {
          success: false,
          error: error.message,
          code: error.code,
        }
      }

      console.error('[authenticatedAction] Unexpected error:', error)
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
      }
    }
  }
}
