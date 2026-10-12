import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'

/**
 * POST /api/cron/eod-cutoff
 *
 * Triggered by pg_cron (primary) or Vercel Cron (backup).
 * Calls process_eod_cutoff() which marks missing EOD reports as 'missed'
 * for all active employees on working days after the 11 PM IST deadline.
 *
 * Protected by CRON_SECRET via middleware.
 */
export async function POST() {
  try {
    const supabase = createServiceClient()

    // Call the idempotent Postgres function
    const { error } = await supabase.rpc('process_eod_cutoff')

    if (error) {
      console.error('[eod-cutoff] Failed:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Count how many were marked missed today
    const { data: missed, error: countError } = await supabase
      .from('eod_report')
      .select('id', { count: 'exact', head: true })
      .eq('report_date', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()))
      .eq('status', 'missed')

    const count = missed ?? 0

    return NextResponse.json({
      success: true,
      message: `EOD cutoff processed. ${count} reports marked as missed.`,
      missedCount: count,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[eod-cutoff] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/** GET returns current missed EOD status (read-only, no mutation) */
export async function GET() {
  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('v_missed_eod')
      .select('*')

    if (error) throw error

    return NextResponse.json({
      success: true,
      missedCount: data?.length ?? 0,
      missed: data,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[eod-cutoff GET] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
