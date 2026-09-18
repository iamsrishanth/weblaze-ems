import { getClientNetwork } from "@/lib/request-ip"
import {
  ATTENDANCE_COLUMNS,
  MobileApiError,
  attendanceDto,
  organizationClock,
  readJsonBody,
  roundHours,
  runMobileRoute,
  validateLocation,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  return runMobileRoute(request, async ({ client, user }) => {
    const body = await readJsonBody(request)
    const location = validateLocation(body.location)
    const { date } = organizationClock()
    const { data: existing, error: existingError } = await client
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .eq("user_id", user.id)
      .eq("work_date", date)
      .maybeSingle()
    if (existingError) throw existingError
    if (!existing) {
      throw new MobileApiError("CHECK_IN_REQUIRED", "Check in before checking out.", 409)
    }
    const record = existing as Record<string, unknown>
    if (!record.check_in_at) {
      throw new MobileApiError("CHECK_IN_REQUIRED", "Check in before checking out.", 409)
    }
    if (record.check_out_at) {
      throw new MobileApiError("ALREADY_CHECKED_OUT", "You have already checked out today.", 409)
    }

    const now = new Date()
    const hours = roundHours((now.getTime() - new Date(String(record.check_in_at)).getTime()) / 3_600_000)
    const network = await getClientNetwork()
    const { data, error } = await client
      .from("attendance")
      .update({
        check_out_at: now.toISOString(),
        total_hours: hours,
        status: hours < 4 ? "half_day" : record.status,
        check_out_lat: location?.lat ?? null,
        check_out_lng: location?.lng ?? null,
        check_out_ip: network.ip,
      })
      .eq("id", String(record.id))
      .eq("updated_at", String(record.updated_at))
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      throw new MobileApiError("CONFLICT", "Attendance was updated by another request. Reload and try again.", 409)
    }
    return attendanceDto(data as Record<string, unknown>)
  })
}
