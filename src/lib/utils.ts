import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ---------------------------------------------------------------------------
// className merging (shadcn-ui standard)
// ---------------------------------------------------------------------------
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Date formatting — wraps date-fns for convenience
// ---------------------------------------------------------------------------
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSunday as _isSunday,
} from 'date-fns'

/**
 * Format a date (or date string) for display: "26 May 2026"
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'd MMM yyyy')
}

/**
 * Format a time (or date) for display: "2:30 PM"
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'h:mm a')
}

/**
 * Format a full date-time: "26 May 2026, 2:30 PM"
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, "d MMM yyyy, h:mm a")
}

// ---------------------------------------------------------------------------
// Day / week helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given date is a Sunday.
 */
export function isSunday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  return _isSunday(d)
}

/**
 * Returns true if the date is a working day (Monday–Saturday).
 * Weblaze follows a 6-day work week.
 */
export function isWorkingDay(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  return !_isSunday(d)
}

/**
 * Count working days (Mon–Sat) in a given ISO week.
 * `weekStart` should be a Monday.
 */
export function getWorkingDaysInWeek(weekStart: Date | string): number {
  const start = typeof weekStart === 'string' ? new Date(weekStart) : weekStart
  const end = endOfWeek(start, { weekStartsOn: 1 }) // Sunday

  const days = eachDayOfInterval({ start, end })
  return days.filter((d) => !_isSunday(d)).length
}

/**
 * Return the Monday of the week containing `date`.
 */
export function getWeekStart(date?: Date | string): Date {
  const d = date
    ? typeof date === 'string'
      ? new Date(date)
      : date
    : new Date()
  return startOfWeek(d, { weekStartsOn: 1 })
}

/**
 * Return the Sunday of the week containing `date`.
 */
export function getWeekEnd(date?: Date | string): Date {
  const d = date
    ? typeof date === 'string'
      ? new Date(date)
      : date
    : new Date()
  return endOfWeek(d, { weekStartsOn: 1 })
}

// ---------------------------------------------------------------------------
// Other helpers
// ---------------------------------------------------------------------------

/**
 * Simple assertion that never returns — narrows types in exhaustive checks.
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}

/**
 * Wait for `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Organisation calendar day
// ---------------------------------------------------------------------------

/** The timezone the business actually operates in. */
export const ORG_TIMEZONE = 'Asia/Kolkata'

/**
 * Today's date (YYYY-MM-DD) in the organisation timezone.
 *
 * Attendance, EOD and reporting all key off the calendar day. Deriving it
 * from UTC filed a 04:47 IST check-in onto the previous day, so every
 * "today" calculation must go through this helper instead of
 * `new Date().toISOString().split('T')[0]`.
 */
export function orgToday(timeZone: string = ORG_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}
