'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  CheckCircle,
  AlertCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
} from 'lucide-react'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import { cn, formatDate, formatTime } from '@/lib/utils'

import type { AppUser, Department, Attendance, GeoPoint } from '@/types'
import {
  getProfile,
  getTodayAttendance,
  getAttendanceHistory,
  getTeamAttendance,
  getUsers,
  checkIn,
  checkOut,
} from './actions'


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string) {
  switch (status) {
    case 'present':
      return 'bg-green-100 text-green-800 border-green-300'
    case 'late':
      return 'bg-amber-100 text-amber-800 border-amber-300'
    case 'half_day':
      return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'absent':
      return 'bg-red-100 text-red-800 border-red-300'
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300'
  }
}

function statusLabel(status: string) {
  return status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function monthLabel(month: string) {
  // "2026-05" → "May 2026"
  const [y, m] = month.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function todayYYYYMMDD(): string {
  return new Date().toISOString().split('T')[0]
}

function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function calculateHours(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  const start = new Date(checkIn).getTime()
  const end = new Date(checkOut).getTime()
  return Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AttendancePage() {
  // Auth state
  const [profile, setProfile] = useState<{
    user: AppUser
    department: Department | null
  } | null>(null)

  // Today tab
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null)
  const [todayLoading, setTodayLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<'in' | 'out' | null>(null)

  // History tab
  const [history, setHistory] = useState<Attendance[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMonth, setHistoryMonth] = useState(todayMonth())

  // Admin team view
  const [teamData, setTeamData] = useState<
    Array<{
      user_id: string
      user_name: string
      user_email: string
      attendance: Attendance | null
    }>
  >([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamDate, setTeamDate] = useState(todayYYYYMMDD())
  const [users, setUsers] = useState<AppUser[]>([])
  const [historyUserId, setHistoryUserId] = useState<string | null>(null)

  // Refresh counter to force re-fetches
  const [refreshKey, setRefreshKey] = useState(0)

  // Error state
  const [error, setError] = useState<string | null>(null)

  const isAdmin =
    profile?.user.role === 'admin' || profile?.user.role === 'super_admin'

  // -----------------------------------------------------------------------
  // Load profile on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    ;(async () => {
      const res = await getProfile()
      if (res.success) {
        setProfile(res.data)
      } else {
        setError(res.error)
      }
    })()
  }, [])

  // -----------------------------------------------------------------------
  // Load today's attendance
  // -----------------------------------------------------------------------
  const loadToday = useCallback(async () => {
    setTodayLoading(true)
    setError(null)
    const res = await getTodayAttendance()
    if (res.success) {
      setTodayRecord(res.data)
    } else {
      setError(res.error)
    }
    setTodayLoading(false)
  }, [])

  useEffect(() => {
    if (profile) loadToday()
  }, [profile, loadToday])

  // -----------------------------------------------------------------------
  // Load history
  // -----------------------------------------------------------------------
  const loadHistory = useCallback(
    async (month: string, userId?: string | null) => {
      setHistoryLoading(true)
      setError(null)
      const res = await getAttendanceHistory({
        month,
        userId: userId ?? undefined,
      })
      if (res.success) {
        setHistory(res.data)
      } else {
        setError(res.error)
      }
      setHistoryLoading(false)
    },
    []
  )

  useEffect(() => {
    if (profile) loadHistory(historyMonth, historyUserId)
  }, [profile, historyMonth, historyUserId, loadHistory])

  // -----------------------------------------------------------------------
  // Load team data (admin) — driven by isAdmin + teamDate
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      setTeamLoading(true)
      const res = await getTeamAttendance({ date: teamDate })
      if (!cancelled && res.success) {
        setTeamData(res.data)
      }
      if (!cancelled) setTeamLoading(false)
    })()
    return () => { cancelled = true }
  }, [isAdmin, teamDate, refreshKey])

  // -----------------------------------------------------------------------
  // Load users list (admin) — once on mount when admin
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      const res = await getUsers()
      if (res.success) {
        setUsers(res.data)
      }
    })()
  }, [isAdmin])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  // Best-effort device coordinates for the audit trail. Never blocks the
  // action: denied permission, unsupported browser, or a slow fix all
  // resolve to null and the check-in still goes through.
  const captureLocation = (): Promise<GeoPoint | null> =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null)
        return
      }
      let settled = false
      const done = (value: GeoPoint | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      // Do not hang the action waiting on a GPS fix.
      const timer = setTimeout(() => done(null), 5000)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer)
          done({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
        },
        () => {
          clearTimeout(timer)
          done(null)
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      )
    })

  const handleCheckIn = async () => {
    setActionLoading('in')
    setError(null)
    const location = await captureLocation()
    const res = await checkIn(location)
    if (res.success) {
      setTodayRecord(res.data)
    } else {
      setError(res.error)
    }
    setActionLoading(null)
  }

  const handleCheckOut = async () => {
    setActionLoading('out')
    setError(null)
    const location = await captureLocation()
    const res = await checkOut(location)
    if (res.success) {
      setTodayRecord(res.data)
    } else {
      setError(res.error)
    }
    setActionLoading(null)
  }

  const handleRefresh = () => {
    loadToday()
    if (isAdmin) setRefreshKey((k) => k + 1)
  }

  // -----------------------------------------------------------------------
  // Summary stats for history
  // -----------------------------------------------------------------------
  const historyStats = {
    present: history.filter((a) => a.status === 'present').length,
    late: history.filter((a) => a.status === 'late').length,
    halfDay: history.filter((a) => a.status === 'half_day').length,
    absent: history.filter((a) => a.status === 'absent').length,
    totalHours: history.reduce(
      (sum, a) => sum + calculateHours(a.check_in_at, a.check_out_at),
      0
    ),
  }

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Attendance
          </h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? 'Track your team attendance'
              : 'Track your daily attendance'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/export/attendance" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Download CSV
          </a>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">
            <Clock className="size-4" />
            Today
          </TabsTrigger>
          <TabsTrigger value="history">
            <Calendar className="size-4" />
            History
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="team">
              <Users className="size-4" />
              Team
            </TabsTrigger>
          )}
        </TabsList>

        {/* ================================================================ */}
        {/* Today Tab */}
        {/* ================================================================ */}
        <TabsContent value="today" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Check-in Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <LogIn className="size-4" />
                  Check In
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todayLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="size-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-400">Loading...</span>
                  </div>
                ) : todayRecord?.check_in_at ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-green-700">
                      {formatTime(todayRecord.check_in_at)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Checked in at {formatTime(todayRecord.check_in_at)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      You haven&apos;t checked in yet today.
                    </p>
                    <Button
                      onClick={handleCheckIn}
                      disabled={actionLoading === 'in'}
                      className="w-full"
                    >
                      {actionLoading === 'in' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LogIn className="size-4" />
                      )}
                      Check In Now
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Check-out Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <LogOut className="size-4" />
                  Check Out
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todayLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="size-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-400">Loading...</span>
                  </div>
                ) : todayRecord?.check_out_at ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-blue-700">
                      {formatTime(todayRecord.check_out_at)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Checked out at {formatTime(todayRecord.check_out_at)}
                    </p>
                  </div>
                ) : todayRecord?.check_in_at ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      Still working. Ready to leave?
                    </p>
                    <Button
                      onClick={handleCheckOut}
                      disabled={actionLoading === 'out'}
                      variant="outline"
                      className="w-full"
                    >
                      {actionLoading === 'out' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LogOut className="size-4" />
                      )}
                      Check Out
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Check in first to enable check-out.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <CheckCircle className="size-4" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todayLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="size-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-400">Loading...</span>
                  </div>
                ) : todayRecord ? (
                  <div className="space-y-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-sm font-medium',
                        statusBadgeClass(todayRecord.status)
                      )}
                    >
                      {statusLabel(todayRecord.status)}
                    </Badge>
                    {todayRecord.check_in_at && todayRecord.check_out_at && (
                      <p className="text-sm text-slate-500">
                        Hours worked:{' '}
                        <span className="font-semibold text-slate-900">
                          {calculateHours(
                            todayRecord.check_in_at,
                            todayRecord.check_out_at
                          )}{' '}
                          hrs
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-amber-600">
                    Not checked in today.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* History Tab */}
        {/* ================================================================ */}
        <TabsContent value="history" className="mt-4">
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Month selector */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() =>
                    setHistoryMonth(prevMonth(historyMonth))
                  }
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-[120px] text-center text-sm font-medium text-slate-700">
                  {monthLabel(historyMonth)}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() =>
                    setHistoryMonth(nextMonth(historyMonth))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* User filter (admin only) */}
              {isAdmin && users.length > 1 && (
                <select
                  value={historyUserId ?? ''}
                  onChange={(e) =>
                    setHistoryUserId(e.target.value || null)
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">My History</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card size="sm">
                <CardContent className="py-2">
                  <p className="text-xs text-slate-500">Present</p>
                  <p className="text-lg font-bold text-green-600">
                    {historyStats.present}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="py-2">
                  <p className="text-xs text-slate-500">Late</p>
                  <p className="text-lg font-bold text-amber-600">
                    {historyStats.late}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="py-2">
                  <p className="text-xs text-slate-500">Half Day</p>
                  <p className="text-lg font-bold text-orange-600">
                    {historyStats.halfDay}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="py-2">
                  <p className="text-xs text-slate-500">Avg Hours</p>
                  <p className="text-lg font-bold text-blue-600">
                    {history.length > 0
                      ? (historyStats.totalHours / history.length).toFixed(1)
                      : '--'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* History list */}
            <Card>
              <CardContent className="p-0">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-5 animate-spin text-slate-400" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <Calendar className="size-8 mb-2" />
                    <p className="text-sm">No attendance records found</p>
                    <p className="text-xs mt-1">
                      {historyUserId
                        ? 'This user has no records for this month.'
                        : 'You have no records for this month.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {history.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-sm">
                            <p className="font-medium text-slate-900">
                              {formatDate(record.work_date)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {record.check_in_at
                                ? formatTime(record.check_in_at)
                                : '--'}
                              {' — '}
                              {record.check_out_at
                                ? formatTime(record.check_out_at)
                                : '--'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {record.check_in_at && record.check_out_at && (
                            <span className="text-xs text-slate-500">
                              {calculateHours(
                                record.check_in_at,
                                record.check_out_at
                              )}{' '}
                              hrs
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              statusBadgeClass(record.status)
                            )}
                          >
                            {statusLabel(record.status)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* Team Tab (Admin only) */}
        {/* ================================================================ */}
        {isAdmin && (
          <TabsContent value="team" className="mt-4">
            <div className="space-y-4">
              {/* Date selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">Date:</label>
                <input
                  type="date"
                  value={teamDate}
                  onChange={(e) => {
                    setTeamDate(e.target.value)
                    // team data will reload via the effect on isAdmin + teamDate
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTeamDate(todayYYYYMMDD())}
                >
                  Today
                </Button>
              </div>

              {/* Team list */}
              <Card>
                <CardContent className="p-0">
                  {teamLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="size-5 animate-spin text-slate-400" />
                    </div>
                  ) : teamData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <Users className="size-8 mb-2" />
                      <p className="text-sm">
                        No team members found for this date.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {teamData.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {member.user_name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {member.user_email}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {member.attendance ? (
                              <>
                                <span className="text-xs text-slate-500">
                                  {member.attendance.check_in_at
                                    ? formatTime(
                                        member.attendance.check_in_at
                                      )
                                    : '--'}
                                  {' — '}
                                  {member.attendance.check_out_at
                                    ? formatTime(
                                        member.attendance.check_out_at
                                      )
                                    : '--'}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-xs',
                                    statusBadgeClass(
                                      member.attendance.status
                                    )
                                  )}
                                >
                                  {statusLabel(
                                    member.attendance.status
                                  )}
                                </Badge>
                              </>
                            ) : (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  statusBadgeClass('absent')
                                )}
                              >
                                Absent
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
