// ============================================================
// Weblaze EMS v3 — Type Definitions (matched to actual DB schema)
// ============================================================

// ---- Enums ----

export type UserRole = 'super_admin' | 'admin' | 'employee'
export type UserStatus = 'active' | 'inactive'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent'
export type EODStatus = 'submitted' | 'missed' | 'late'

// ---- Database Row Types (matching actual Supabase columns) ----

export interface Department {
  id: string
  name: string
  head_id: string | null
  leads_target: number
  calls_target: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  department_id: string | null
  manager_id: string | null
  status: UserStatus
  must_change_pw: boolean
  join_date: string
  created_at?: string
  updated_at?: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  assigned_to: string
  assigned_by: string
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  completed_at: string | null
  created_at?: string
  updated_at?: string
}

export interface Attendance {
  id: string
  user_id: string
  work_date: string
  check_in_at: string | null
  check_out_at: string | null
  status: AttendanceStatus
  total_hours: number
  created_at?: string
  updated_at?: string
}

export interface EODReport {
  id: string
  user_id: string
  report_date: string
  summary: string
  tasks_completed: string[] | null
  hours_worked: number
  status: EODStatus
  submitted_at: string
  created_at?: string
}

export interface WeeklyReport {
  id: string
  user_id: string
  week_start: string
  week_end: string
  leads_total: number
  calls_total: number
  tasks_completed: number
  eod_submitted: number
  days_present: number
  employee_note: string | null
  generated_at: string
}

export interface DailyMetrics {
  id: string
  user_id: string
  entry_date: string
  leads: number
  calls: number
  created_at?: string
  updated_at?: string
}

export interface AuditLog {
  id: string
  actor_id: string
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown> | null
  created_at?: string
}

// ---- Dashboard Aggregates ----

export interface DashboardStats {
  total_employees: number
  present_today: number
  tasks_due_today: number
  eod_pending: number
}

export interface MissedEOD {
  user_id: string
  name: string
  department_id: string | null
  department_name: string | null
  report_date: string
}

// ---- Auth / Session Types ----

export interface AuthProfile {
  user: AppUser
  department: Department | null
}

// ---- Server Action Response Wrapper ----

export type ActionSuccess<T = void> = {
  success: true
  data: T
}

export type ActionError = {
  success: false
  error: string
  code?: string
  issues?: Array<{
    path: (string | number)[]
    message: string
  }>
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionError

// ---- Pagination ----

export interface PaginationParams {
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}
