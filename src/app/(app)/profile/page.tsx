'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarCheck,
  Clock,
  Flame,
  FileText,
  CheckSquare,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Mail,
  Building2,
  CalendarDays,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { cn, formatDate, orgToday } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { RoleBadge } from '@/components/status'
import { ErrorState } from '@/components/states'
import type {
  AppUser,
  Attendance,
  Department,
} from '@/types'
import type { EODReportWithUser } from '../reports/actions'
import type { TaskWithAssignee } from '../tasks/actions'
import { getProfile } from '../attendance/actions'
import { getAttendanceHistory } from '../attendance/actions'
import { getEODHistory } from '../reports/actions'
import { getTasks } from '../tasks/actions'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' → UTC epoch ms (no timezone drift while stepping days). */
function dayMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Longest run of consecutive calendar days ending today (or yesterday — a
 * not-yet-done today must not break an ongoing streak).
 */
function computeStreak(days: Set<string>): number {
  let cursor = dayMs(orgToday())
  if (!days.has(msToDay(cursor))) cursor -= 86_400_000
  if (!days.has(msToDay(cursor))) return 0
  let streak = 0
  while (days.has(msToDay(cursor))) {
    streak += 1
    cursor -= 86_400_000
  }
  return streak
}

/** Attendance statuses that count as "showed up". */
const SHOWED_UP: ReadonlySet<string> = new Set(['present', 'late', 'half_day'])

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function currentMonth(): string {
  return orgToday().slice(0, 7)
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Clock
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'warning'
}) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-md border',
              tone === 'positive'
                ? 'border-status-positive/25 bg-status-positive/10 text-status-positive'
                : tone === 'warning'
                  ? 'border-status-warning/25 bg-status-warning/10 text-status-warning'
                  : 'border-border/60 bg-muted/40 text-muted-foreground'
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase">
            {label}
          </p>
        </div>
        <p className="numeric mt-2.5 text-xl font-semibold text-foreground">
          {value}
        </p>
        {sub ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} size="sm" className="gap-0 py-0">
          <CardContent className="px-4 py-4">
            <div className="h-3 w-20 animate-pulse rounded bg-foreground/[0.07]" />
            <div className="mt-3 h-6 w-14 animate-pulse rounded bg-foreground/[0.07]" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-foreground/[0.07]" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [profile, setProfile] = useState<{
    user: AppUser
    department: Department | null
  } | null>(null)
  const [attendance, setAttendance] = useState<Attendance[] | null>(null)
  const [eods, setEods] = useState<EODReportWithUser[] | null>(null)
  const [tasks, setTasks] = useState<TaskWithAssignee[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ---- Password change ----
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const loading =
    profile === null || attendance === null || eods === null || tasks === null

  // Load everything: profile first (need the user id to self-scope the admin
  // data sources), then the three datasets in parallel.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const profileResult = await getProfile()
      if (cancelled) return
      if (!profileResult.success) {
        setLoadError(profileResult.error || 'Failed to load profile')
        return
      }
      const me = profileResult.data.user
      setProfile(profileResult.data)

      const month = currentMonth()
      const [attResult, eodResult, taskResult] = await Promise.all([
        getAttendanceHistory({ userId: me.id, month }),
        getEODHistory({
          userId: me.id,
          dateFrom: `${month}-01`,
          dateTo: orgToday(),
          limit: 100,
        }),
        getTasks({ assigned_to: me.id }),
      ])
      if (cancelled) return
      // Individual failures degrade to empty data, not a broken page.
      setAttendance(attResult.success ? attResult.data : [])
      setEods(eodResult.success ? eodResult.data : [])
      setTasks(taskResult.success ? taskResult.data : [])
      if (!attResult.success || !eodResult.success || !taskResult.success) {
        setLoadError('Some stats failed to load — showing partial data.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- Derived stats ----
  const stats = useMemo(() => {
    if (loading) return null

    const presentDays = attendance!.filter((a) => SHOWED_UP.has(a.status))
    const recordedDays = attendance!.length
    const rate =
      recordedDays > 0
        ? Math.round((presentDays.length / recordedDays) * 100)
        : null

    const withHours = attendance!.filter((a) => a.total_hours > 0)
    const avgHours =
      withHours.length > 0
        ? withHours.reduce((sum, a) => sum + a.total_hours, 0) /
          withHours.length
        : null

    // Only rows the user actually submitted count toward the streak —
    // cron-generated "missed" rows must not.
    const eodStreak = computeStreak(
      new Set(
        eods!
          .filter((e) => e.status !== 'missed')
          .map((e) => e.report_date)
      )
    )
    const attStreak = computeStreak(
      new Set(
        attendance!
          .filter((a) => SHOWED_UP.has(a.status))
          .map((a) => a.work_date)
      )
    )

    const done = tasks!.filter((t) => t.status === 'done').length

    return {
      presentDays: presentDays.length,
      rate,
      avgHours,
      // Submitted reports only — cron "missed" rows don't count.
      eodCount: eods!.filter((e) => e.status !== 'missed').length,
      eodStreak,
      attStreak,
      tasksDone: done,
      tasksTotal: tasks!.length,
    }
  }, [loading, attendance, eods, tasks])

  // ---- Password submit ----
  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setSavingPassword(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) {
        const reauth =
          /recent login|re-authenticat|reauthenticat/i.test(error.message)
        toast.error(
          reauth
            ? 'Please sign out and sign in again, then retry'
            : error.message
        )
      } else {
        toast.success('Password updated')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      toast.error('Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  const me = profile?.user

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Your activity, stats and account settings"
      />

      {loadError && !loading ? (
        <Card className="gap-0 py-0">
          <CardContent className="px-5">
            <ErrorState
              description={loadError}
              onRetry={() => window.location.reload()}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Identity */}
      <Card className="gap-0 py-5">
        <CardContent className="px-5">
          {loading || !me ? (
            <div className="flex items-center gap-4">
              <div className="size-14 animate-pulse rounded-full bg-foreground/[0.07]" />
              <div className="space-y-2">
                <div className="h-5 w-40 animate-pulse rounded bg-foreground/[0.07]" />
                <div className="h-4 w-56 animate-pulse rounded bg-foreground/[0.07]" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-lg font-semibold text-primary">
                {getInitials(me.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-foreground">
                    {me.name}
                  </h2>
                  <RoleBadge role={me.role} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5" />
                    {me.email}
                  </span>
                  {profile?.department ? (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="size-3.5" />
                      {profile.department.name}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    Joined {formatDate(me.join_date || me.created_at || '')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {loading || !stats ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            icon={CalendarCheck}
            label="Present"
            value={String(stats.presentDays)}
            sub={
              stats.rate !== null
                ? `${stats.rate}% of recorded days`
                : 'No records this month'
            }
            tone="positive"
          />
          <StatCard
            icon={Clock}
            label="Avg hours"
            value={
              stats.avgHours !== null
                ? `${stats.avgHours.toFixed(1)}h`
                : '—'
            }
            sub="Per recorded day"
          />
          <StatCard
            icon={FileText}
            label="EOD reports"
            value={String(stats.eodCount)}
            sub="This month"
          />
          <StatCard
            icon={Flame}
            label="EOD streak"
            value={
              stats.eodStreak > 0 ? `${stats.eodStreak}d` : '—'
            }
            sub={
              stats.eodStreak >= 3
                ? 'On fire — keep it up'
                : stats.eodStreak > 0
                  ? 'Consecutive days'
                  : 'Submit today to start'
            }
            tone={stats.eodStreak >= 3 ? 'warning' : stats.eodStreak > 0 ? 'positive' : undefined}
          />
          <StatCard
            icon={Flame}
            label="Check-in streak"
            value={
              stats.attStreak > 0 ? `${stats.attStreak}d` : '—'
            }
            sub={
              stats.attStreak > 0 ? 'Consecutive days' : 'Check in to start'
            }
            tone={stats.attStreak >= 3 ? 'warning' : stats.attStreak > 0 ? 'positive' : undefined}
          />
          <StatCard
            icon={CheckSquare}
            label="Tasks done"
            value={`${stats.tasksDone}/${stats.tasksTotal}`}
            sub={
              stats.tasksTotal > 0
                ? `${Math.round((stats.tasksDone / stats.tasksTotal) * 100)}% completion`
                : 'No tasks assigned'
            }
            tone="positive"
          />
        </div>
      )}

      {/* Security */}
      <Card className="gap-0 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-md border border-status-partial/25 bg-status-partial/10 text-status-partial">
              <Shield className="size-3.5" />
            </span>
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Repeat the new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="h-10"
                aria-invalid={
                  confirmPassword.length > 0 && confirmPassword !== newPassword
                }
              />
              {confirmPassword.length > 0 &&
              confirmPassword !== newPassword ? (
                <p className="text-xs text-status-negative">
                  Passwords do not match
                </p>
              ) : null}
            </div>
            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground/70" />
                Changing your password keeps you signed in on this device.
              </p>
              <Button
                onClick={handleChangePassword}
                disabled={
                  savingPassword ||
                  newPassword.length < 8 ||
                  confirmPassword !== newPassword
                }
                className="sm:shrink-0"
              >
                {savingPassword ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Shield className="size-4" />
                    Update password
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
