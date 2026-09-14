'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { authenticatedAction } from '@/lib/auth/require-role'
import { logAuditEvent, AuditActions } from '@/lib/audit'
import type { AppUser } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserWithDepartment extends AppUser {
  department_name: string | null
}

// ---------------------------------------------------------------------------
// Default credentials
// ---------------------------------------------------------------------------

// Every account an admin creates starts with this password. The profile row is
// written with must_change_pw = true, so /setup forces the user to replace it
// on first sign-in (see 001_schema.sql:102 for the column default).
const DEFAULT_USER_PASSWORD = 'Weblaze@2026'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['super_admin', 'admin', 'employee']),
  department_id: z.string().uuid('Invalid department ID').nullable().optional(),
})

const updateUserSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
  role: z.enum(['super_admin', 'admin', 'employee']).optional(),
  department_id: z.string().uuid('Invalid department ID').nullable().optional(),
  name: z.string().min(1, 'Name is required').optional(),
})

const getUsersSchema = z.object({
  role: z.string().optional(),
  department_id: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  search: z.string().optional(),
})

// ---------------------------------------------------------------------------
// getUsers
// ---------------------------------------------------------------------------

export const getUsers = authenticatedAction({
  schema: getUsersSchema,
  roles: ['admin', 'super_admin'],
  handler: async ({ input, profile }) => {
    const supabase = await createClient()

    let query = supabase
      .from('app_user')
      .select('*, department:department(name)')
      .order('created_at', { ascending: false })

    // Admin scope: only own department
    if (profile.user.role === 'admin') {
      if (profile.user.department_id) {
        query = query.eq('department_id', profile.user.department_id)
      } else {
        return [] as UserWithDepartment[]
      }
    }

    if (input.role) query = query.eq('role', input.role)
    if (input.department_id) query = query.eq('department_id', input.department_id)
    if (input.status) query = query.eq('status', input.status)
    if (input.search) {
      query = query.or(
        `name.ilike.%${input.search}%,email.ilike.%${input.search}%`
      )
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)

    // Flatten department name
    const users: UserWithDepartment[] = (data ?? []).map((row: Record<string, unknown>) => {
      const dept = row.department as { name?: string } | null
      return {
        ...(row as unknown as AppUser),
        department_name: dept?.name ?? null,
      }
    })

    return users
  },
})

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

export const createUser = authenticatedAction({
  schema: createUserSchema,
  roles: ['admin', 'super_admin'],
  handler: async ({ input, profile }) => {
    // Admin can only create users in their own department
    if (profile.user.role === 'admin') {
      if (
        !profile.user.department_id ||
        input.department_id !== profile.user.department_id
      ) {
        throw new Error(
          'You can only create users in your own department.'
        )
      }
      // Admin cannot create super_admin
      if (input.role === 'super_admin') {
        throw new Error(
          'Only super admins can create super admin accounts.'
        )
      }
    }

    const serviceClient = createServiceClient()

    // 1. Create the auth user with the shared default password
    const { data: authUser, error: authError } =
      await serviceClient.auth.admin.createUser({
        email: input.email,
        password: DEFAULT_USER_PASSWORD,
        email_confirm: true,
        user_metadata: { name: input.name },
      })

    if (authError) {
      if (authError.message?.includes('already been registered')) {
        throw new Error(`A user with email "${input.email}" already exists.`)
      }
      throw new Error(authError.message)
    }

    if (!authUser?.user) {
      throw new Error('Failed to create auth user — no user returned.')
    }

    // 2. Create the app_user profile row
    const { error: profileError } = await serviceClient
      .from('app_user')
      .insert({
        id: authUser.user.id,
        email: input.email,
        name: input.name,
        role: input.role,
        department_id: input.department_id ?? null,
        status: 'active',
        must_change_pw: true,
      })

    if (profileError) {
      // Best-effort cleanup: delete the auth user if profile insert fails
      await serviceClient.auth.admin.deleteUser(authUser.user.id)
      throw new Error(profileError.message)
    }

    // 3. No recovery email is sent — the account is usable immediately with the
    //    default password, and must_change_pw forces a change at first sign-in.

    revalidatePath('/admin/users')

    // Audit log
    await logAuditEvent({
      actorId: profile.user.id,
      action: AuditActions.USER_CREATED,
      targetType: 'app_user',
      targetId: authUser.user.id,
      details: { email: input.email, role: input.role, department_id: input.department_id },
    })

    return { id: authUser.user.id }
  },
})

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------

export const updateUser = authenticatedAction({
  schema: updateUserSchema,
  roles: ['admin', 'super_admin'],
  handler: async ({ input, profile }) => {
    const supabase = await createClient()

    // Fetch the target user
    const { data: targetUser, error: fetchError } = await supabase
      .from('app_user')
      .select('*')
      .eq('id', input.id)
      .maybeSingle<AppUser>()

    if (fetchError || !targetUser) {
      throw new Error('User not found.')
    }

    // Admin scope check
    if (profile.user.role === 'admin') {
      // Cannot manage users outside own department
      if (targetUser.department_id !== profile.user.department_id) {
        throw new Error('You can only manage users in your own department.')
      }
      // Cannot promote to super_admin
      if (input.role === 'super_admin') {
        throw new Error(
          'Only super admins can promote users to super admin.'
        )
      }
      // Cannot change department to one outside own scope
      if (
        input.department_id &&
        input.department_id !== profile.user.department_id
      ) {
        throw new Error(
          'You can only assign users to your own department.'
        )
      }
    }

    // Super admin can change anything, but prevent self-demotion
    if (
      profile.user.id === input.id &&
      input.role &&
      input.role !== 'super_admin' &&
      profile.user.role === 'super_admin'
    ) {
      throw new Error('You cannot change your own role.')
    }

    const updates: Record<string, unknown> = {}
    if (input.role !== undefined) updates.role = input.role
    if (input.department_id !== undefined) updates.department_id = input.department_id
    if (input.name !== undefined) updates.name = input.name
    updates.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('app_user')
      .update(updates)
      .eq('id', input.id)

    if (error) throw new Error(error.message)

    revalidatePath('/admin/users')

    // Audit log
    await logAuditEvent({
      actorId: profile.user.id,
      action: input.role && input.role !== targetUser.role
        ? AuditActions.ROLE_CHANGED
        : AuditActions.USER_UPDATED,
      targetType: 'app_user',
      targetId: input.id,
      details: {
        changes: updates,
        previous: { role: targetUser.role, department_id: targetUser.department_id },
      },
    })

    return { id: input.id }
  },
})

// ---------------------------------------------------------------------------
// deactivateUser
// ---------------------------------------------------------------------------

const toggleStatusSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
})

export const deactivateUser = authenticatedAction({
  schema: toggleStatusSchema,
  roles: ['admin', 'super_admin'],
  handler: async ({ input, profile }) => {
    const supabase = await createClient()

    const { data: targetUser, error: fetchError } = await supabase
      .from('app_user')
      .select('*')
      .eq('id', input.id)
      .maybeSingle<AppUser>()

    if (fetchError || !targetUser) {
      throw new Error('User not found.')
    }

    // Cannot deactivate self
    if (input.id === profile.user.id) {
      throw new Error('You cannot deactivate your own account.')
    }

    // Admin scope check
    if (profile.user.role === 'admin') {
      if (targetUser.department_id !== profile.user.department_id) {
        throw new Error('You can only manage users in your own department.')
      }
    }

    const { error } = await supabase
      .from('app_user')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)

    if (error) throw new Error(error.message)

    revalidatePath('/admin/users')
    return { id: input.id }
  },
})

// ---------------------------------------------------------------------------
// reactivateUser
// ---------------------------------------------------------------------------

export const reactivateUser = authenticatedAction({
  schema: toggleStatusSchema,
  roles: ['admin', 'super_admin'],
  handler: async ({ input, profile }) => {
    const supabase = await createClient()

    const { data: targetUser, error: fetchError } = await supabase
      .from('app_user')
      .select('*')
      .eq('id', input.id)
      .maybeSingle<AppUser>()

    if (fetchError || !targetUser) {
      throw new Error('User not found.')
    }

    if (profile.user.role === 'admin') {
      if (targetUser.department_id !== profile.user.department_id) {
        throw new Error('You can only manage users in your own department.')
      }
    }

    const { error } = await supabase
      .from('app_user')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)

    if (error) throw new Error(error.message)

    revalidatePath('/admin/users')
    return { id: input.id }
  },
})

// ---------------------------------------------------------------------------
// getDepartments (needed for user create/edit dialogs)
// ---------------------------------------------------------------------------

export const getDepartmentsForSelect = authenticatedAction({
  schema: z.object({}),
  roles: ['admin', 'super_admin'],
  handler: async ({ profile }) => {
    const supabase = await createClient()

    let query = supabase
      .from('department')
      .select('id, name')
      .order('name')

    // Admin only sees own department
    if (profile.user.role === 'admin' && profile.user.department_id) {
      query = query.eq('id', profile.user.department_id)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; name: string }[]
  },
})
