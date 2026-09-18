import {
  ATTENDANCE_COLUMNS,
  attendanceDto,
  organizationClock,
  runMobileRoute,
} from "@/lib/mobile/daily"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return runMobileRoute(request, async ({ client, user }) => {
    const { date } = organizationClock()
    const { data, error } = await client
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .eq("user_id", user.id)
      .eq("work_date", date)
      .maybeSingle()

    if (error) throw error
    return data ? attendanceDto(data as Record<string, unknown>) : null
  })
}
