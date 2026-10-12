export const ORGANIZATION_TIMEZONE = 'Asia/Kolkata'

export const OFFICE_START_MINUTE = 10 * 60
export const OFFICE_END_MINUTE = 18 * 60
export const EARLY_CUTOFF_MINUTE = 9 * 60 + 50
export const ON_TIME_CUTOFF_MINUTE = 10 * 60 + 15
export const EOD_DEADLINE_MINUTE = 23 * 60

export type AttendanceTimingStatus = 'early' | 'on_time' | 'late'

export function minuteOfDay(hour: number, minute: number): number {
  return hour * 60 + minute
}

export function organizationTimeParts(date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ORGANIZATION_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { hour: value('hour') % 24, minute: value('minute') }
}

export function attendanceTimingStatus(hour: number, minute: number): AttendanceTimingStatus {
  const value = minuteOfDay(hour, minute)
  if (value < EARLY_CUTOFF_MINUTE) return 'early'
  if (value <= ON_TIME_CUTOFF_MINUTE) return 'on_time'
  return 'late'
}

export function isEodLate(hour: number, minute: number): boolean {
  return minuteOfDay(hour, minute) > EOD_DEADLINE_MINUTE
}

export function isAtOrAfterEodDeadline(hour: number, minute: number): boolean {
  return minuteOfDay(hour, minute) >= EOD_DEADLINE_MINUTE
}

export function attendanceTimingStatusAt(date: Date): AttendanceTimingStatus {
  const current = organizationTimeParts(date)
  return attendanceTimingStatus(current.hour, current.minute)
}
