import { getClientNetwork } from "@/lib/request-ip"
import {
  ATTENDANCE_COLUMNS,
  MobileApiError,
  attendanceDto,
  organizationClock,
  readJsonBody,
  runMobileRoute,
  validateLocation,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  return runMobileRoute(request, async ({ client, user }) => {
    const body = await readJsonBody(request)
    const location = validateLocation(body.location)
    const { date, hour, minute } = organizationClock()
    const now = new Date().toISOString()

    const { data: existing, error: existingError } = await client
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .eq("user_id", user.id)
      .eq("work_date", date)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      throw new MobileApiError("ALREADY_CHECKED_IN", "You have already checked in today.", 409)
    }

    const network = await getClientNetwork()
    const insert = {
      user_id: user.id,
      work_date: date,
      check_in_at: now,
      status: hour > 9 || (hour === 9 && minute > 30) ? "late" : "present",
      check_in_lat: location?.lat ?? null,
      check_in_lng: location?.lng ?? null,
      check_in_ip: network.ip,
    }
    const { data, error } = await client
      .from("attendance")
      .insert(insert)
      .select(ATTENDANCE_COLUMNS)
      .single()
    if (error) {
      if (error.code === "23505") {
        throw new MobileApiError("ALREADY_CHECKED_IN", "You have already checked in today.", 409)
      }
      throw error
    }
    return attendanceDto(data as Record<string, unknown>)
  })
}
