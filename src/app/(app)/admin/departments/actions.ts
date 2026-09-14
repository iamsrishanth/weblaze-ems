'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { authenticatedAction } from '@/lib/auth/require-role'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepartmentWithStats {
  id: string
  name: string
  description: string | null
  head_id: string | null
  head_name: string | null
  head_email: string | null
  leads_target: number | null
  calls_target: number | null
  status: string
  employee_count: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  description: z.string().optional(),
  head_id: z.string().uuid('Invalid user ID').nullable().optional(),
  leads_target: z.number().int().nonnegative().nullable().optional(),
  calls_target: z.number().int().nonnegative().nullable().optional(),
})

const updateDepartmentSchema = z.object({
  id: z.string().uuid('Invalid department ID'),
  name: z.string().min(1, 'Department name is required').optional(),
  description: z.string().optional().nullable(),
  head_id: z.string().uuid('Invalid user ID').nullable().optional(),
  leads_target: z.number().int().nonnegative().nullable().optional(),
  calls_target: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

// ---------------------------------------------------------------------------
// getDepartments
// ---------------------------------------------------------------------------

export const getDepartments = authenticatedAction({
  schema: z.object({}),
  roles: ['super_admin'],
  handler: async () => {
    const supabase = await createClient()

    // Get departments
    const { data: depts, error: deptError } = await supabase
      .from('department')
      .select('*')
      .order('name')

    if (deptError) throw new Error(deptError.message)

    // Get heads in a separate query (more resilient than FK joins)
    const headIds = (depts ?? [])
      .map((d: Record<string, unknown>) => d.head_id as string | null)
      .filter((id): id is string => id !== null && id !== undefined)

    let headMap: Record<string, { name: string; email: string }> = {}
    if (headIds.length > 0) {
      const { data: headUsers, error: headError } = await supabase
        .from('app_user')
        .select('id, name, email')
        .in('id', headIds)

      if (!headError && headUsers) {
        for (const h of headUsers as { id: string; name: string; email: string }[]) {
          headMap[h.id] = { name: h.name, email: h.email }
        }
      }
    }

    // Count employees per department
    const { data: counts, error: countError } = await supabase
      .from('app_user')
      .select('department_id, id')
      .eq('status', 'active')

    if (countError) throw new Error(countError.message)

    const countByDept: Record<string, number> = {}
    for (const row of counts ?? []) {
      const deptId = (row as { department_id: string }).department_id
      if (deptId) {
        countByDept[deptId] = (countByDept[deptId] || 0) + 1
      }
    }

    const departments: DepartmentWithStats[] = (depts ?? []).map(
      (d: Record<string, unknown>) => {
        const headId = d.head_id as string | null
        const head = headId ? headMap[headId] : null
        return {
          id: d.id as string,
          name: d.name as string,
          description: null, // the department table has no description column
          head_id: headId,
          head_name: head?.name ?? null,
          head_email: head?.email ?? null,
          leads_target: (d.leads_target ?? null) as number | null,
          calls_target: (d.calls_target ?? null) as number | null,
          status: d.is_active === false ? 'inactive' : 'active',
          employee_count: countByDept[(d.id as string)] || 0,
          created_at: d.created_at as string,
        }
      }
    )

    return departments
  },
})

// ---------------------------------------------------------------------------
// createDepartment
// ---------------------------------------------------------------------------

export const createDepartment = authenticatedAction({
  schema: createDepartmentSchema,
  roles: ['super_admin'],
  handler: async ({ input }) => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('department')
      .insert({
        name: input.name,
        head_id: input.head_id ?? null,
        leads_target: input.leads_target ?? null,
        calls_target: input.calls_target ?? null,
        is_active: true,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A department named "${input.name}" already exists.`)
      }
      throw new Error(error.message)
    }

    revalidatePath('/admin/departments')
    return data as { id: string }
  },
})

// ---------------------------------------------------------------------------
// updateDepartment
// ---------------------------------------------------------------------------

export const updateDepartment = authenticatedAction({
  schema: updateDepartmentSchema,
  roles: ['super_admin'],
  handler: async ({ input }) => {
    const supabase = await createClient()

    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.head_id !== undefined) updates.head_id = input.head_id
    if (input.leads_target !== undefined) updates.leads_target = input.leads_target
    if (input.calls_target !== undefined) updates.calls_target = input.calls_target
    // `department` stores is_active (boolean), not a status enum
    if (input.status !== undefined) updates.is_active = input.status === 'active'
    // `description` is accepted by the schema but the table has no such column,
    // so it is deliberately not persisted.

    if (Object.keys(updates).length === 0) {
      throw new Error('No changes provided.')
    }

    const { error } = await supabase
      .from('department')
      .update(updates)
      .eq('id', input.id)

    if (error) throw new Error(error.message)

    revalidatePath('/admin/departments')
    return { id: input.id }
  },
})

// ---------------------------------------------------------------------------
// getUsersForDepartmentHead — returns users eligible to be dept heads
// ---------------------------------------------------------------------------

export const getEligibleHeads = authenticatedAction({
  schema: z.object({}),
  roles: ['super_admin'],
  handler: async () => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('app_user')
      .select('id, name, email, role')
      .eq('status', 'active')
      .in('role', ['admin', 'super_admin'])
      .order('name')

    if (error) throw new Error(error.message)
    return data as { id: string; name: string; email: string; role: string }[]
  },
})

// ---------------------------------------------------------------------------
// canDeleteDepartment — checks if a department has active users
// ---------------------------------------------------------------------------

export const canDeleteDepartment = authenticatedAction({
  schema: z.object({ id: z.string().uuid() }),
  roles: ['super_admin'],
  handler: async ({ input }) => {
    const supabase = await createClient()

    const { count, error } = await supabase
      .from('app_user')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', input.id)
      .eq('status', 'active')

    if (error) throw new Error(error.message)

    return { has_active_users: (count ?? 0) > 0, user_count: count ?? 0 }
  },
})
