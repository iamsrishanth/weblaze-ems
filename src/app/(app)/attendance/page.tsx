'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  CheckCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  Hourglass,
  Timer,
  X,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  TableHeader,
  TableBody,
  TableRow,
} from '@/components/ui/table'
import { DataTable, Th, Td } from '@/components/data-table'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import {
  StatusPill,
  toneText,
  statusTone,
} from '@/components/status'
import {
  EmptyState,
  TableSkeleton,
  StatGridSkeleton,
} from '@/components/states'
import { cn, formatDate, formatTime, orgToday } from '@/lib/utils'

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

function monthLabel(month: string) {
  // "2026-05" → "May 2026"
  const [y, m] = month.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function todayYYYYMMDD(): string {
  return orgToday()
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

const inputClass =
  'h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40'

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
    return () => {
      cancelled = true
    }
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
      <div className="space-y-6">
        <div className="mb-6">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-foreground/[0.07]" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-foreground/[0.07]" />
        </div>
        <StatGridSkeleton count={3} />
        <Card className="gap-0 py-0">
          <TableSkeleton rows={6} />
        </Card>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description={`${isAdmin ? 'Track your team attendance' : 'Track your daily attendance'} · ${formatDate(orgToday())}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              render={<a href="/api/export/attendance" />} nativeButton={false}
            >
              <Download className="size-3.5" />
              Download CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </>
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <Clock className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="rounded-md p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
          >
            <X className="size-4" />
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
            <Card className="gap-0 py-5">
              <CardHeader className="px-5">
                <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <span className="flex size-7 items-center justify-center rounded-md border border-status-positive/25 bg-status-positive/10 text-status-positive">
                    <LogIn className="size-3.5" />
                  </span>
                  Check in
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                {todayLoading ? (
                  <div className="space-y-2 py-1">
                    <div className="h-9 w-28 animate-pulse rounded-md bg-foreground/[0.07]" />
                    <div className="h-3 w-36 animate-pulse rounded bg-foreground/[0.07]" />
                  </div>
                ) : todayRecord?.check_in_at ? (
                  <div>
                    <p className="numeric text-3xl font-semibold tracking-tight text-foreground">
                      {formatTime(todayRecord.check_in_at)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(todayRecord.work_date)} · recorded
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      You haven&apos;t checked in yet today.
                    </p>
                    <Button
                      onClick={handleCheckIn}
                      disabled={actionLoading === 'in'}
                      size="lg"
                      className="h-10 w-full"
                    >
                      {actionLoading === 'in' ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <LogIn className="size-4" />
                      )}
                      Check in now
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Check-out Card */}
            <Card className="gap-0 py-5">
              <CardHeader className="px-5">
                <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <span className="flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground">
                    <LogOut className="size-3.5" />
                  </span>
                  Check out
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                {todayLoading ? (
                  <div className="space-y-2 py-1">
                    <div className="h-9 w-28 animate-pulse rounded-md bg-foreground/[0.07]" />
                    <div className="h-3 w-36 animate-pulse rounded bg-foreground/[0.07]" />
                  </div>
                ) : todayRecord?.check_out_at ? (
                  <div>
                    <p className="numeric text-3xl font-semibold tracking-tight text-foreground">
                      {formatTime(todayRecord.check_out_at)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {todayRecord.check_in_at &&
                        `Total ${calculateHours(todayRecord.check_in_at, todayRecord.check_out_at)}h`}{' '}
                      · recorded
                    </p>
                  </div>
                ) : todayRecord?.check_in_at ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Still working. Ready to leave?
                    </p>
                    <Button
                      onClick={handleCheckOut}
                      disabled={actionLoading === 'out'}
                      variant="outline"
                      size="lg"
                      className="h-10 w-full"
                    >
                      {actionLoading === 'out' ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <LogOut className="size-4" />
                      )}
                      Check out
                    </Button>
                  </div>
                ) : (
                  <p className="py-2 text-sm text-muted-foreground/70">
                    Check in first to enable check-out.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card className="gap-0 py-5 md:col-span-2 lg:col-span-1">
              <CardHeader className="px-5">
                <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <span className="flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground">
                    <CheckCircle className="size-3.5" />
                  </span>
                  Today&apos;s status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                {todayLoading ? (
                  <div className="space-y-2 py-1">
                    <div className="h-6 w-24 animate-pulse rounded-full bg-foreground/[0.07]" />
                    <div className="h-3 w-40 animate-pulse rounded bg-foreground/[0.07]" />
                  </div>
                ) : todayRecord ? (
                  <div className="space-y-2.5">
                    <StatusPill
                      status={todayRecord.status}
                      size="md"
                      className="text-xs"
                    />
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        In{' '}
                        <span className="numeric text-foreground">
                          {todayRecord.check_in_at
                            ? formatTime(todayRecord.check_in_at)
                            : '—'}
                        </span>{' '}
                        · Out{' '}
                        <span className="numeric text-foreground">
                          {todayRecord.check_out_at
                            ? formatTime(todayRecord.check_out_at)
                            : '—'}
                        </span>
                      </p>
                      {todayRecord.check_in_at && todayRecord.check_out_at && (
                        <p>
                          Hours worked:{' '}
                          <span className="numeric font-semibold text-foreground">
                            {calculateHours(
                              todayRecord.check_in_at,
                              todayRecord.check_out_at
                            )}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="py-2 text-sm text-status-warning">
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
                  aria-label="Previous month"
                  onClick={() => setHistoryMonth(prevMonth(historyMonth))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="numeric min-w-[128px] text-center text-sm font-medium text-foreground">
                  {monthLabel(historyMonth)}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => setHistoryMonth(nextMonth(historyMonth))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* User filter (admin only) */}
              {isAdmin && users.length > 1 && (
                <select
                  value={historyUserId ?? ''}
                  onChange={(e) => setHistoryUserId(e.target.value || null)}
                  aria-label="Filter history by user"
                  className={inputClass}
                >
                  <option value="">My history</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
              <StatCard
                label="Present"
                value={historyStats.present}
                icon={CheckCircle}
                iconClassName="border-status-positive/25 bg-status-positive/10 text-status-positive"
                valueClassName={toneText(statusTone('present'))}
              />
              <StatCard
                label="Late"
                value={historyStats.late}
                icon={Clock}
                iconClassName="border-status-warning/25 bg-status-warning/10 text-status-warning"
                valueClassName={toneText(statusTone('late'))}
              />
              <StatCard
                label="Half day"
                value={historyStats.halfDay}
                icon={Hourglass}
                iconClassName="border-status-partial/25 bg-status-partial/10 text-status-partial"
                valueClassName={toneText(statusTone('half_day'))}
              />
              <StatCard
                label="Avg hours"
                value={
                  history.length > 0
                    ? (historyStats.totalHours / history.length).toFixed(1)
                    : '—'
                }
                icon={Timer}
                hint={`${historyStats.totalHours.toFixed(1)}h total`}
              />
            </div>

            {/* History table */}
            {historyLoading ? (
              <Card className="gap-0 py-0">
                <TableSkeleton rows={8} />
              </Card>
            ) : history.length === 0 ? (
              <Card className="gap-0 py-0">
                <EmptyState
                  icon={Calendar}
                  title="No attendance records found"
                  description={
                    historyUserId
                      ? 'This user has no records for this month.'
                      : 'You have no records for this month.'
                  }
                />
              </Card>
            ) : (
              <DataTable>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <Th>Date</Th>
                      <Th>Check in</Th>
                      <Th>Check out</Th>
                      <Th align="right">Hours</Th>
                      <Th align="right">Status</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((record) => (
                      <TableRow key={record.id}>
                        <Td className="font-medium text-foreground">
                          {formatDate(record.work_date)}
                        </Td>
                        <Td numeric className="text-muted-foreground">
                          {record.check_in_at
                            ? formatTime(record.check_in_at)
                            : '—'}
                        </Td>
                        <Td numeric className="text-muted-foreground">
                          {record.check_out_at
                            ? formatTime(record.check_out_at)
                            : '—'}
                        </Td>
                        <Td numeric align="right" className="text-foreground">
                          {record.check_in_at && record.check_out_at
                            ? calculateHours(
                                record.check_in_at,
                                record.check_out_at
                              )
                            : '—'}
                        </Td>
                        <Td align="right">
                          <StatusPill status={record.status} />
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
            )}
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* Team Tab (Admin only) */}
        {/* ================================================================ */}
        {isAdmin && (
          <TabsContent value="team" className="mt-4">
            <div className="space-y-4">
              {/* Date selector */}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="team-date"
                  className="text-sm text-muted-foreground"
                >
                  Date
                </label>
                <input
                  id="team-date"
                  type="date"
                  value={teamDate}
                  onChange={(e) => {
                    setTeamDate(e.target.value)
                    // team data will reload via the effect on isAdmin + teamDate
                  }}
                  className={cn(inputClass, 'numeric')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTeamDate(todayYYYYMMDD())}
                >
                  Today
                </Button>
              </div>

              {/* Team table */}
              {teamLoading ? (
                <Card className="gap-0 py-0">
                  <TableSkeleton rows={6} />
                </Card>
              ) : teamData.length === 0 ? (
                <Card className="gap-0 py-0">
                  <EmptyState
                    icon={Users}
                    title="No team members found"
                    description="There is no one in your team to show for this date."
                  />
                </Card>
              ) : (
                <DataTable>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <Th>Member</Th>
                        <Th>Check in</Th>
                        <Th>Check out</Th>
                        <Th align="right">Hours</Th>
                        <Th align="right">Status</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamData.map((member) => {
                        const hours =
                          member.attendance?.check_in_at &&
                          member.attendance?.check_out_at
                            ? calculateHours(
                                member.attendance.check_in_at,
                                member.attendance.check_out_at
                              )
                            : null
                        return (
                          <TableRow key={member.user_id}>
                            <Td>
                              <p className="font-medium text-foreground">
                                {member.user_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {member.user_email}
                              </p>
                            </Td>
                            <Td numeric className="text-muted-foreground">
                              {member.attendance?.check_in_at
                                ? formatTime(member.attendance.check_in_at)
                                : '—'}
                            </Td>
                            <Td numeric className="text-muted-foreground">
                              {member.attendance?.check_out_at
                                ? formatTime(member.attendance.check_out_at)
                                : '—'}
                            </Td>
                            <Td numeric align="right" className="text-foreground">
                              {hours ?? '—'}
                            </Td>
                            <Td align="right">
                              <StatusPill
                                status={
                                  member.attendance
                                    ? member.attendance.status
                                    : 'absent'
                                }
                              />
                            </Td>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </DataTable>
                )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
