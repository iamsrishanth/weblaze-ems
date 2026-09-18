import type { SupabaseClient } from "@supabase/supabase-js"

import {
  createRequestId,
  jsonError,
  jsonSuccess,
  MobileApiError,
  normalizeMobileError,
} from "@/lib/mobile/api"
import { getMobileUserContext } from "@/lib/mobile/context"
import type { Database } from "@/lib/supabase/server"
import type { AttendanceStatus, EODStatus, TaskPriority, TaskStatus, UserRole } from "@/types"
import type { MobileUserContext } from "@/lib/mobile/context"

export type MobileClient = SupabaseClient<Database>
export type DbRow = Record<string, unknown>
export { MobileApiError } from "@/lib/mobile/api"

export type PageParams = {
  page: number
  page_size: number
  offset: number
}

export type AttendanceDto = {
  id: string
  user_id: string
  work_date: string
  check_in_at: string | null
  check_out_at: string | null
  status: AttendanceStatus
  total_hours: number | null
  created_at: string
  updated_at: string
}

export type TaskDto = {
  id: string
  title: string
  description: string | null
  assigned_to: string
  assigned_by: string
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  assignee_name: string | null
  assigner_name: string | null
}

export type MetricsDto = {
  id: string
  user_id: string
  entry_date: string
  leads: number
  calls: number
  created_at: string
  updated_at: string
}

export type EodDto = {
  id: string
  user_id: string
  report_date: string
  summary: string | null
  tasks_completed: string[] | null
  hours_worked: number | null
  status: EODStatus
  submitted_at: string
  created_at: string
  updated_at: string
  user_name?: string
  department_name?: string | null
}

export type WeeklyDto = {
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
  user_name?: string
  department_name?: string | null
}

export const ATTENDANCE_COLUMNS =
  "id,user_id,work_date,check_in_at,check_out_at,status,total_hours,created_at,updated_at"
export const TASK_COLUMNS =
  "id,title,description,assigned_to,assigned_by,priority,status,due_date,completed_at,created_at,updated_at"
export const EOD_COLUMNS =
  "id,user_id,report_date,summary,tasks_completed,hours_worked,status,submitted_at,created_at,updated_at"
export const METRICS_COLUMNS =
  "id,user_id,entry_date,leads,calls,created_at,updated_at"
export const WEEKLY_COLUMNS =
  "id,user_id,week_start,week_end,leads_total,calls_total,tasks_completed,eod_submitted,days_present,employee_note,generated_at"

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done"]
export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"]

export function runMobileRoute<T>(
  request: Request,
  handler: (context: MobileUserContext) => Promise<T>,
): Promise<Response> {
  const requestId = createRequestId()

  return getMobileUserContext(request)
    .then(async (context) => {
      if (context.user.must_change_pw) {
        throw new MobileApiError(
          "SETUP_REQUIRED",
          "Complete password setup before using this endpoint.",
          403,
        )
      }
      return jsonSuccess(await handler(context), requestId)
    })
    .catch((error: unknown) =>
      jsonError(toMobileError(error), requestId),
    )
}

export function toMobileError(error: unknown, fallback = "The request could not be completed."): MobileApiError {
  if (error instanceof MobileApiError) return error

  const candidate = error as { code?: unknown; message?: unknown }
  if (candidate.code === "23505") {
    return new MobileApiError("CONFLICT", "The record already exists or was changed.", 409)
  }
  if (candidate.code === "23503") {
    return new MobileApiError("VALIDATION_ERROR", "A referenced record is not available.", 422)
  }
  if (candidate.code === "22P02") {
    return new MobileApiError("VALIDATION_ERROR", "One or more values are invalid.", 422)
  }

  // Do not pass database details to mobile clients.
  if (candidate.message && typeof candidate.message === "string") {
    return new MobileApiError("INTERNAL_ERROR", fallback, 500)
  }
  return normalizeMobileError(error)
}

export async function readJsonBody(request: Request): Promise<DbRow> {
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new MobileApiError("INVALID_JSON", "The request body must be a JSON object.", 400)
    }
    return body as DbRow
  } catch (error) {
    if (error instanceof MobileApiError) throw error
    throw new MobileApiError("INVALID_JSON", "The request body must be valid JSON.", 400)
  }
}

export function parsePage(searchParams: URLSearchParams): PageParams {
  const page = parseInteger(searchParams.get("page") ?? "1")
  const pageSize = parseInteger(searchParams.get("page_size") ?? "20")
  if (page === null || page < 1 || pageSize === null || pageSize < 1 || pageSize > 100) {
    throw new MobileApiError("INVALID_PAGINATION", "page must be positive and page_size must be between 1 and 100.", 400)
  }
  return { page, page_size: pageSize, offset: (page - 1) * pageSize }
}

export function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseUuid(value: string | null, field = "id"): string | null {
  if (value === null || value === "") return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MobileApiError("INVALID_FIELD", `${field} must be a valid UUID.`, 400, {
      [field]: "Must be a valid UUID.",
    })
  }
  return value
}

export function parseDate(value: string | null, field = "date"): string | null {
  if (value === null || value === "") return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MobileApiError("INVALID_FIELD", `${field} must use YYYY-MM-DD.`, 400, {
      [field]: "Use YYYY-MM-DD.",
    })
  }
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new MobileApiError("INVALID_FIELD", `${field} is not a real calendar date.`, 400, {
      [field]: "Must be a real calendar date.",
    })
  }
  return value
}

export function parseMonth(value: string | null): string | null {
  if (value === null || value === "") return null
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new MobileApiError("INVALID_FIELD", "month must use YYYY-MM.", 400, {
      month: "Use YYYY-MM.",
    })
  }
  return value
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function organizationClock(date = new Date()): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  )
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
  }
}

export function isLateInOrganization(date = new Date()): boolean {
  return isAtOrAfterCutoff(date)
}

export function isAtOrAfterCutoff(date = new Date()): boolean {
  const clock = organizationClock(date)
  return clock.hour >= 18
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function numberValue(value: unknown): number {
  return numberOrNull(value) ?? 0
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export function rowValue(row: DbRow, key: string): unknown {
  return row[key]
}

export function attendanceDto(row: DbRow): AttendanceDto {
  return {
    id: stringValue(row.id),
    user_id: stringValue(row.user_id),
    work_date: stringValue(row.work_date),
    check_in_at: stringOrNull(row.check_in_at),
    check_out_at: stringOrNull(row.check_out_at),
    status: row.status as AttendanceStatus,
    total_hours: numberOrNull(row.total_hours),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
  }
}

export function taskDto(row: DbRow, names: { assignee?: string | null; assigner?: string | null } = {}): TaskDto {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    description: stringOrNull(row.description),
    assigned_to: stringValue(row.assigned_to),
    assigned_by: stringValue(row.assigned_by),
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    due_date: stringOrNull(row.due_date),
    completed_at: stringOrNull(row.completed_at),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    assignee_name: names.assignee ?? null,
    assigner_name: names.assigner ?? null,
  }
}

export function metricsDto(row: DbRow): MetricsDto {
  return {
    id: stringValue(row.id),
    user_id: stringValue(row.user_id),
    entry_date: stringValue(row.entry_date),
    leads: numberValue(row.leads),
    calls: numberValue(row.calls),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
  }
}

export function eodDto(row: DbRow, names?: { user_name?: string; department_name?: string | null }): EodDto {
  const tasks = Array.isArray(row.tasks_completed)
    ? row.tasks_completed.filter((value): value is string => typeof value === "string")
    : null
  return {
    id: stringValue(row.id),
    user_id: stringValue(row.user_id),
    report_date: stringValue(row.report_date),
    summary: stringOrNull(row.summary),
    tasks_completed: tasks,
    hours_worked: numberOrNull(row.hours_worked),
    status: row.status as EODStatus,
    submitted_at: stringValue(row.submitted_at),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    ...(names?.user_name !== undefined ? { user_name: names.user_name } : {}),
    ...(names?.department_name !== undefined ? { department_name: names.department_name } : {}),
  }
}

export function weeklyDto(row: DbRow, names?: { user_name?: string; department_name?: string | null }): WeeklyDto {
  return {
    id: stringValue(row.id),
    user_id: stringValue(row.user_id),
    week_start: stringValue(row.week_start),
    week_end: stringValue(row.week_end),
    leads_total: numberValue(row.leads_total),
    calls_total: numberValue(row.calls_total),
    tasks_completed: numberValue(row.tasks_completed),
    eod_submitted: numberValue(row.eod_submitted),
    days_present: numberValue(row.days_present),
    employee_note: stringOrNull(row.employee_note),
    generated_at: stringValue(row.generated_at),
    ...(names?.user_name !== undefined ? { user_name: names.user_name } : {}),
    ...(names?.department_name !== undefined ? { department_name: names.department_name } : {}),
  }
}

export async function scopedUserIds(
  context: MobileUserContext,
  requestedUserId: string | null,
): Promise<string[] | null> {
  if (context.user.role === "employee") {
    if (requestedUserId && requestedUserId !== context.user.id) {
      throw new MobileApiError("FORBIDDEN", "You may only access your own records.", 403)
    }
    return [context.user.id]
  }

  if (context.user.role === "admin") {
    if (!context.user.department_id) {
      throw new MobileApiError("SCOPE_REQUIRED", "An administrator must be assigned to a department.", 403)
    }
    if (requestedUserId) {
      const { data, error } = await context.client
        .from("app_user")
        .select("id")
        .eq("id", requestedUserId)
        .eq("department_id", context.user.department_id)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new MobileApiError("FORBIDDEN", "The requested record is outside your department.", 403)
      return [requestedUserId]
    }
    const { data, error } = await context.client
      .from("app_user")
      .select("id")
      .eq("department_id", context.user.department_id)
    if (error) throw error
    return ((data ?? []) as DbRow[]).map((row) => stringValue(row.id)).filter(Boolean)
  }

  return requestedUserId ? [requestedUserId] : null
}

export async function assertTargetScope(context: MobileUserContext, targetUserId: string): Promise<void> {
  const ids = await scopedUserIds(context, targetUserId)
  if (ids !== null && !ids.includes(targetUserId)) {
    throw new MobileApiError("FORBIDDEN", "The record is outside your permitted scope.", 403)
  }
}

export async function fetchUserNames(
  client: MobileClient,
  userIds: string[],
): Promise<Map<string, { name: string; department_id: string | null }>> {
  if (userIds.length === 0) return new Map()
  const { data, error } = await client
    .from("app_user")
    .select("id,name,department_id")
    .in("id", userIds)
  if (error) throw error
  const names = new Map<string, { name: string; department_id: string | null }>()
  for (const row of (data ?? []) as DbRow[]) {
    names.set(stringValue(row.id), {
      name: stringValue(row.name),
      department_id: stringOrNull(row.department_id),
    })
  }
  return names
}

export async function fetchDepartmentNames(
  client: MobileClient,
  departmentIds: string[],
): Promise<Map<string, string>> {
  if (departmentIds.length === 0) return new Map()
  const { data, error } = await client.from("department").select("id,name").in("id", departmentIds)
  if (error) throw error
  const names = new Map<string, string>()
  for (const row of (data ?? []) as DbRow[]) names.set(stringValue(row.id), stringValue(row.name))
  return names
}

export async function taskNames(
  context: MobileUserContext,
  rows: DbRow[],
): Promise<Map<string, { assignee: string | null; assigner: string | null }>> {
  const ids = Array.from(
    new Set(
      rows
        .flatMap((row) => [stringValue(row.assigned_to), stringValue(row.assigned_by)])
        .filter(Boolean),
    ),
  )
  const names = await fetchUserNames(context.client, ids)
  return new Map(
    rows.map((row) => [
      stringValue(row.id),
      {
        assignee: names.get(stringValue(row.assigned_to))?.name ?? null,
        assigner: names.get(stringValue(row.assigned_by))?.name ?? null,
      },
    ]),
  )
}

export function validateLocation(value: unknown): { lat: number; lng: number } | null {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MobileApiError("INVALID_FIELD", "location must contain numeric lat and lng.", 422, {
      location: "Must be an object with lat and lng.",
    })
  }
  const location = value as { lat?: unknown; lng?: unknown }
  const lat = typeof location.lat === "number" ? location.lat : Number(location.lat)
  const lng = typeof location.lng === "number" ? location.lng : Number(location.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new MobileApiError("INVALID_FIELD", "location coordinates are invalid.", 422, {
      location: "lat must be -90..90 and lng must be -180..180.",
    })
  }
  return { lat, lng }
}

export function validateEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new MobileApiError("INVALID_FIELD", `${field} is invalid.`, 422, {
      [field]: `Must be one of: ${allowed.join(", ")}.`,
    })
  }
  return value as T
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MobileApiError("INVALID_FIELD", `${field} is required.`, 422, {
      [field]: "This field is required.",
    })
  }
  return value.trim()
}

export function requirePositiveHours(value: unknown): number {
  const hours = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 99.99 || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new MobileApiError("INVALID_FIELD", "hours_worked must be positive and have at most two decimals.", 422, {
      hours_worked: "Use a positive value no greater than 99.99 with at most two decimals.",
    })
  }
  return hours
}

export function parseOptionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new MobileApiError("INVALID_FIELD", `${field} must be a non-negative integer.`, 422, {
      [field]: "Must be a non-negative integer.",
    })
  }
  return value
}

export function sameVersion(row: DbRow, expected: string): boolean {
  return stringValue(row.updated_at) === expected
}

export function parseStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 100) {
    throw new MobileApiError("INVALID_FIELD", `${field} must be an array of UUIDs.`, 422, {
      [field]: "Must contain at most 100 UUIDs.",
    })
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new MobileApiError("INVALID_FIELD", `${field} contains an invalid UUID.`, 422, {
        [field]: `Item ${index + 1} must be a UUID.`,
      })
    }
    return parseUuid(item, field) as string
  })
}

export function isRole(value: unknown): value is UserRole {
  return value === "employee" || value === "admin" || value === "super_admin"
}

export function roundHours(value: number): number {
  return Math.round(value * 100) / 100
}

export function taskMapKey(userId: string, date: string): string {
  return `${userId}:${date}`
}
