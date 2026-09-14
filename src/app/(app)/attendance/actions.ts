'use server'

import { requireRole, AccessDeniedError } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getClientNetwork } from '@/lib/request-ip'
import type {
  Attendance,
  AppUser,
  Department,
  ActionResult,
  PaginatedResult,
} from '@/types'

// ---------------------------------------------------------------------------
// Attendance IP logging (audit only — never surfaced in the UI)
//
// Written with the service-role client so it bypasses RLS: a user must not be
// able to forge or delete their own IP history. Failures are swallowed — a
// missing log row must never block a check-in or check-out.
// ---------------------------------------------------------------------------
async function logAttendanceIp(params: {
  attendanceId: string
  userId: string
  event: 'check_in' | 'check_out'
}): Promise<void> {
  try {
    const network = await getClientNetwork()
    const serviceClient = createServiceClient()
    await serviceClient.from('attendance_ip_log').insert({
      attendance_id: params.attendanceId,
      user_id: params.userId,
      event: params.event,
      ip: network.ip,
      ip_version: network.ipVersion,
      user_agent: network.userAgent,
    })
  } catch (error) {
    console.error(
      `[attendance] failed to log IP for ${params.event}:`,
      error instanceof Error ? error.message : error
    )
  }
}

// ---------------------------------------------------------------------------
// Generic action wrapper — catches errors and returns ActionResult
// ---------------------------------------------------------------------------
async function wrapAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { success: false, error: error.message, code: error.code }
    }
    console.error('[Attendance Action] Error:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    }
  }
}

// ---------------------------------------------------------------------------
// getProfile — fetch current user profile + department name
// ---------------------------------------------------------------------------
export async function getProfile(): Promise<
  ActionResult<{
    user: AppUser
    department: Department | null
  }>
> {
  return wrapAction(async () => {
    return await requireRole(['employee', 'admin', 'super_admin'])
  })
}

// ---------------------------------------------------------------------------
// getTodayAttendance — fetch today's attendance record for the current user
// ---------------------------------------------------------------------------
export async function getTodayAttendance(): Promise<
  ActionResult<Attendance | null>
> {
  return wrapAction(async () => {
    const { user } = await requireRole(['employee', 'admin', 'super_admin'])
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .eq('work_date', today)
      .maybeSingle()

    if (error) throw error
    return data as Attendance | null
  })
}

// ---------------------------------------------------------------------------
// checkIn — create a new attendance record for today
// ---------------------------------------------------------------------------
export async function checkIn(): Promise<ActionResult<Attendance>> {
  return wrapAction(async () => {
    const { user } = await requireRole(['employee', 'admin', 'super_admin'])
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Prevent duplicate check-in
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('user_id', user.id)
      .eq('work_date', today)
      .maybeSingle()

    if (existing) {
      throw new Error('You have already checked in today.')
    }

    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()

    // Late after 09:30
    const status: Attendance['status'] =
      hour > 9 || (hour === 9 && minute > 30) ? 'late' : 'present'

    // Audit only — stored, never rendered.
    const network = await getClientNetwork()

    const { data, error } = await supabase
      .from('attendance')
      .insert({
        user_id: user.id,
        work_date: today,
        check_in_at: now.toISOString(),
        status,
        check_in_ip: network.ip,
      })
      .select()
      .single()

    if (error) throw error

    const record = data as Attendance
    await logAttendanceIp({
      attendanceId: record.id,
      userId: user.id,
      event: 'check_in',
    })

    return record
  })
}

// ---------------------------------------------------------------------------
// checkOut — update today's attendance record with checkout time & hours
// ---------------------------------------------------------------------------
export async function checkOut(): Promise<ActionResult<Attendance>> {
  return wrapAction(async () => {
    const { user } = await requireRole(['employee', 'admin', 'super_admin'])
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Find today's record
    const { data: record, error: fetchError } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .eq('work_date', today)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (!record) {
      throw new Error(
        'No check-in record found for today. Please check in first.'
      )
    }

    if (record.check_out_at) {
      throw new Error('You have already checked out today.')
    }

    const now = new Date()
    const checkInTime = new Date(record.check_in_at!)
    const totalHours =
      Math.round(
        ((now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100
      ) / 100

    // Determine if half-day (less than 4 hours)
    const finalStatus: Attendance['status'] =
      totalHours < 4 ? 'half_day' : record.status

    // Audit only — stored, never rendered.
    const network = await getClientNetwork()

    const { data, error } = await supabase
      .from('attendance')
      .update({
        check_out_at: now.toISOString(),
        status: finalStatus,
        check_out_ip: network.ip,
      })
      .eq('id', record.id)
      .select()
      .single()

    if (error) throw error

    await logAttendanceIp({
      attendanceId: record.id,
      userId: user.id,
      event: 'check_out',
    })

    return data as Attendance
  })
}

// ---------------------------------------------------------------------------
// getAttendanceHistory — fetch attendance history with optional filters
// ---------------------------------------------------------------------------
export async function getAttendanceHistory(params?: {
  userId?: string
  month?: string // "YYYY-MM"
}): Promise<ActionResult<Attendance[]>> {
  return wrapAction(async () => {
    const { user } = await requireRole(['employee', 'admin', 'super_admin'])
    const supabase = await createClient()

    // Admins can view any user; employees only see themselves
    const targetUserId =
      params?.userId &&
      (user.role === 'admin' || user.role === 'super_admin')
        ? params.userId
        : user.id

    let query = supabase
      .from('attendance')
      .select('*')
      .eq('user_id', targetUserId)
      .order('date', { ascending: false })

    // Filter by month if provided
    if (params?.month) {
      const [year, month] = params.month.split('-')
      const startDate = `${year}-${month}-01`
      // Last day of month
      const endDate = new Date(Number(year), Number(month), 0)
        .toISOString()
        .split('T')[0]
      query = query.gte('date', startDate).lte('date', endDate)
    }

    const { data, error } = await query.limit(100)

    if (error) throw error
    return (data as Attendance[]) ?? []
  })
}

// ---------------------------------------------------------------------------
// getTeamAttendance — admin/super_admin: get attendance for a department
// ---------------------------------------------------------------------------
export async function getTeamAttendance(params?: {
  date?: string // defaults to today
  departmentId?: string
}): Promise<
  ActionResult<
    Array<{
      user_id: string
      user_name: string
      user_email: string
      attendance: Attendance | null
    }>
  >
> {
  return wrapAction(async () => {
    const { user, department } = await requireRole(['admin', 'super_admin'])
    const supabase = await createClient()

    const date = params?.date ?? new Date().toISOString().split('T')[0]

    // Determine which department to query
    const targetDeptId =
      user.role === 'super_admin'
        ? params?.departmentId ?? department?.id
        : department?.id

    if (!targetDeptId) {
      throw new Error('No department associated with your account.')
    }

    // Get all active users in department
    const { data: users, error: usersError } = await supabase
      .from('app_user')
      .select('id, name, email')
      .eq('department_id', targetDeptId)
      .eq('status', 'active')

    if (usersError) throw usersError

    if (!users || users.length === 0) {
      return []
    }

    // Get attendance for these users on the given date
    const userIds = users.map((u) => u.id)
    const { data: attendanceRecords, error: attError } = await supabase
      .from('attendance')
      .select('*')
      .in('user_id', userIds)
      .eq('work_date', date)

    if (attError) throw attError

    const attendanceMap = new Map(
      (attendanceRecords ?? []).map((a: Attendance) => [a.user_id, a])
    )

    return users.map((u) => ({
      user_id: u.id,
      user_name: u.name,
      user_email: u.email,
      attendance: attendanceMap.get(u.id) ?? null,
    }))
  })
}

// ---------------------------------------------------------------------------
// getUsers — admin/super_admin: get list of users (for team filter dropdowns)
// ---------------------------------------------------------------------------
export async function getUsers(params?: {
  departmentId?: string
}): Promise<ActionResult<AppUser[]>> {
  return wrapAction(async () => {
    const { user, department } = await requireRole(['admin', 'super_admin'])
    const supabase = await createClient()

    let query = supabase
      .from('app_user')
      .select('*')
      .eq('status', 'active')
      .order('name')

    if (user.role === 'admin' && department) {
      query = query.eq('department_id', department.id)
    } else if (params?.departmentId) {
      query = query.eq('department_id', params.departmentId)
    }

    const { data, error } = await query

    if (error) throw error
    return (data as AppUser[]) ?? []
  })
}
