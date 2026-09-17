import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Clock,
  CheckSquare,
  FileText,
  Users,
  Building2,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  LogIn,
  LogOut,
  Target,
  BarChart3,
  UserCheck,
  UserX,
  Timer,
  ClipboardList,
  ChevronRight,
  Download,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react'
import { formatDate, formatTime, isSunday, orgToday } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { BulletChart } from '@/components/bullet-chart'
import { ListCard, ListRow, ListRows } from '@/components/list-card'
import { EmptyState } from '@/components/states'
import {
  StatusPill,
  StatusCount,
  toneText,
  LINK_CLASSES,
} from '@/components/status'
import type {
  AppUser,
  Department,
  Task,
  Attendance,
  EODReport,
  DailyMetrics,
} from '@/types'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isSalesDept = (dept: Department | null) =>
  dept?.name?.toLowerCase().includes('sales') ?? false

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="mb-2 size-8 text-status-warning" />
        <p className="text-sm text-muted-foreground">
          Please log in to view the dashboard.
        </p>
        <Link href="/login" className={`${LINK_CLASSES} mt-2 text-sm`}>
          Go to Login
        </Link>
      </div>
    )
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('app_user')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<AppUser>()

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="mb-2 size-8 text-status-warning" />
        <p className="text-sm text-muted-foreground">
          User profile not found. Please contact an administrator.
        </p>
      </div>
    )
  }

  // Fetch department
  let department: Department | null = null
  if (profile.department_id) {
    const { data: dept } = await supabase
      .from('department')
      .select('*')
      .eq('id', profile.department_id)
      .maybeSingle<Department>()
    department = dept ?? null
  }

  const today = orgToday()

  // Compute current week boundaries (Mon–Sat)
  const todayDate = new Date()
  const dayOfWeek = todayDate.getDay() // 0=Sun, …, 6=Sat
  const monday = new Date(todayDate)
  monday.setDate(todayDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const weekStart = monday.toISOString().split('T')[0]
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  const weekEnd = saturday.toISOString().split('T')[0]

  // =========================================================================
  // ROLE: Employee
  // =========================================================================
  if (profile.role === 'employee') {
    // --- Queries (independent — issued in parallel) ---
    const salesDept = isSalesDept(department)
    const [attendanceRes, tasksRes, eodRes, metricsRes] = await Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .eq('user_id', profile.id)
        .eq('work_date', today)
        .maybeSingle<Attendance>(),
      supabase.from('task').select('status').eq('assigned_to', profile.id),
      supabase
        .from('eod_report')
        .select('*')
        .eq('user_id', profile.id)
        .eq('report_date', today)
        .maybeSingle<EODReport>(),
      // Sales metrics — only queried for sales departments
      salesDept
        ? supabase
            .from('daily_metrics')
            .select('*')
            .eq('user_id', profile.id)
            .eq('entry_date', today)
            .maybeSingle<DailyMetrics>()
        : Promise.resolve({ data: null }),
    ])
    const todayAttendance = attendanceRes.data
    const tasks = tasksRes.data as Pick<Task, 'status'>[] | null
    const todayEOD = eodRes.data
    const todayMetrics = salesDept ? metricsRes.data ?? null : null
    const taskCounts = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      total: 0,
    }
    if (tasks) {
      for (const t of tasks) {
        taskCounts.total++
        if (t.status === 'todo') taskCounts.todo++
        else if (t.status === 'in_progress') taskCounts.in_progress++
        else if (t.status === 'blocked') taskCounts.blocked++
        else if (t.status === 'done') taskCounts.done++
      }
    }

    const isSundayToday = isSunday(today)

    // Presentational: leads target for the sales card — department target,
    // falling back to the classic default of 5 when it is 0/missing.
    const deptLeadsTarget = department?.leads_target ?? 0
    const salesLeadsTarget = deptLeadsTarget > 0 ? deptLeadsTarget : 5

    return (
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title={`Welcome back${profile.name ? `, ${profile.name.split(' ')[0]}` : ''}`}
          description={
            isSundayToday
              ? `Today is Sunday — enjoy your day off · ${formatDate(today)}`
              : `Here's your daily overview · ${formatDate(today)}`
          }
          actions={
            !isSundayToday && (
              <>
                {!todayAttendance && (
                  <Link href="/attendance">
                    <Button size="sm">
                      <LogIn className="size-3.5" />
                      Check In
                    </Button>
                  </Link>
                )}
                {todayAttendance &&
                  todayAttendance.check_in_at &&
                  !todayAttendance.check_out_at && (
                    <Link href="/attendance">
                      <Button variant="outline" size="sm">
                        <LogOut className="size-3.5" />
                        Check Out
                      </Button>
                    </Link>
                  )}
                {!todayEOD && todayAttendance && (
                  <Link href="/reports">
                    <Button size="sm">
                      <FileText className="size-3.5" />
                      Submit EOD
                    </Button>
                  </Link>
                )}
              </>
            )
          }
        />

        {/* Stats grid */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Today's Status */}
          <StatCard
            label="Today's Status"
            icon={Clock}
            value={
              todayAttendance ? (
                <StatusPill status={todayAttendance.status} size="md" />
              ) : (
                <StatusPill
                  status="not_checked_in"
                  label={isSundayToday ? 'Day off' : 'Not checked in'}
                  size="md"
                />
              )
            }
            hint={
              todayAttendance?.check_in_at ? (
                <span>
                  In{' '}
                  <span className="numeric text-foreground">
                    {formatTime(todayAttendance.check_in_at)}
                  </span>
                  {todayAttendance.check_out_at && (
                    <>
                      {' · Out '}
                      <span className="numeric text-foreground">
                        {formatTime(todayAttendance.check_out_at)}
                      </span>
                    </>
                  )}
                </span>
              ) : undefined
            }
          />

          {/* Tasks */}
          <StatCard
            label="Today's Tasks"
            icon={CheckSquare}
            value={taskCounts.total}
            hint={
              taskCounts.total > 0
                ? `${taskCounts.done} of ${taskCounts.total} done`
                : 'No tasks assigned'
            }
          >
            {taskCounts.total > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {taskCounts.todo > 0 && (
                  <StatusCount status="todo" count={taskCounts.todo} />
                )}
                {taskCounts.in_progress > 0 && (
                  <StatusCount
                    status="in_progress"
                    count={taskCounts.in_progress}
                  />
                )}
                {taskCounts.blocked > 0 && (
                  <StatusCount status="blocked" count={taskCounts.blocked} />
                )}
                {taskCounts.done > 0 && (
                  <StatusCount status="done" count={taskCounts.done} />
                )}
              </div>
            )}
          </StatCard>

          {/* EOD Status */}
          <StatCard
            label="EOD Report"
            icon={FileText}
            value={
              isSundayToday ? (
                <StatusPill status="not_required" label="Not required" size="md" />
              ) : todayEOD ? (
                <StatusPill status={todayEOD.status} size="md" />
              ) : (
                <StatusPill status="not_submitted" size="md" />
              )
            }
            hint={
              isSundayToday
                ? 'Today is Sunday'
                : todayEOD
                  ? (
                      <span>
                        Submitted at{' '}
                        <span className="numeric text-foreground">
                          {formatTime(todayEOD.submitted_at)}
                        </span>
                      </span>
                    )
                  : (
                      <Link
                        href="/reports"
                        className={`${LINK_CLASSES} inline-flex items-center gap-1`}
                      >
                        Submit EOD
                        <ArrowRight className="size-3" />
                      </Link>
                    )
            }
          />

          {/* Sales metrics (if sales dept) */}
          {isSalesDept(department) ? (
            <StatCard
              label="Leads & Calls"
              icon={Target}
              iconClassName="border-status-partial/25 bg-status-partial/10 text-status-partial"
              value={todayMetrics?.leads ?? 0}
              valueClassName={toneText('partial')}
              hint={
                <span>
                  <span className="numeric font-medium text-foreground">
                    {todayMetrics?.calls ?? 0}
                  </span>{' '}
                  calls today
                </span>
              }
            >
              <BulletChart
                value={todayMetrics?.leads ?? 0}
                target={salesLeadsTarget}
                label="Leads"
                tone="partial"
              />
            </StatCard>
          ) : (
            <StatCard
              label="Department"
              icon={Building2}
              value={department?.name ?? 'Unassigned'}
            />
          )}
        </section>

        {/* Today's tasks detail */}
        {taskCounts.total > 0 && (
          <ListCard
            icon={ClipboardList}
            title="Task Breakdown"
            action={
              <Link href="/tasks" className={LINK_CLASSES}>
                View all
              </Link>
            }
          >
            <ListRows>
              {(['todo', 'in_progress', 'blocked', 'done'] as const).map(
                (s) => {
                  const count = taskCounts[s]
                  if (count === 0 && s !== 'todo') return null
                  return (
                    <ListRow key={s}>
                      <StatusPill status={s} />
                      <span className="numeric text-sm font-semibold text-foreground">
                        {count}
                      </span>
                    </ListRow>
                  )
                },
              )}
            </ListRows>
          </ListCard>
        )}
      </div>
    )
  }

  // =========================================================================
  // ROLE: Admin
  // =========================================================================
  if (profile.role === 'admin') {
    const deptId = department?.id

    // --- Queries (all scoped to department) ---

    // Active users in department
    const deptUsers = (deptId
      ? (await supabase
          .from('app_user')
          .select('id, name, email, role, department_id, status')
          .eq('department_id', deptId)
          .eq('status', 'active')
          .order('name')).data
      : []) as AppUser[]
    const deptUserIds = (deptUsers ?? []).map((u: AppUser) => u.id)

    // --- Queries (independent of each other — issued in parallel; all
    //     scoped to the department's user ids) ---
    const salesDept = isSalesDept(department)
    const [attRes, eodRes, overdueRes, metricsRes] = await Promise.all([
      deptId
        ? supabase
            .from('attendance')
            .select(
              'id, user_id, work_date, check_in_at, check_out_at, status, total_hours'
            )
            .in('user_id', deptUserIds)
            .eq('work_date', today)
        : Promise.resolve({ data: [] }),
      deptId
        ? supabase
            .from('eod_report')
            .select(
              'id, user_id, report_date, status, submitted_at, hours_worked'
            )
            .in('user_id', deptUserIds)
            .eq('report_date', today)
        : Promise.resolve({ data: [] }),
      deptId
        ? supabase
            .from('task')
            .select(
              'id, title, status, priority, due_date, assigned_to, completed_at'
            )
            .in('assigned_to', deptUserIds)
            .lt('due_date', today)
            .neq('status', 'done')
            .order('due_date', { ascending: true })
            .limit(10)
        : Promise.resolve({ data: [] }),
      // Sales metrics — only queried for sales departments
      deptId && salesDept
        ? supabase
            .from('daily_metrics')
            .select('id, user_id, entry_date, leads, calls')
            .in('user_id', deptUserIds)
            .eq('entry_date', today)
        : Promise.resolve({ data: null }),
    ])
    const deptAttendance = (attRes.data ?? []) as Attendance[]
    const attendanceMap = new Map(
      (deptAttendance ?? []).map((a: Attendance) => [a.user_id, a]),
    )

    // EOD compliance today
    const deptEODs = (eodRes.data ?? []) as EODReport[]
    const eodSubmitters = new Set(
      (deptEODs ?? []).map((e: EODReport) => e.user_id),
    )
    const nonSubmitters = (deptUsers ?? []).filter(
      (u: AppUser) => !eodSubmitters.has(u.id),
    )

    // Overdue tasks
    const overdueTasks = overdueRes.data

    // Build a user name lookup map for the overdue tasks
    const userNameMap = new Map(
      (deptUsers ?? []).map((u: AppUser) => [u.id, u.name]),
    )

    // Sales metrics (if sales dept)
    const deptMetrics = (metricsRes.data ?? null) as DailyMetrics[] | null

    // Department targets for sales
    const deptLeadsTarget = department?.leads_target ?? 0
    const deptCallsTarget = department?.calls_target ?? 0

    const totalUsers = (deptUsers ?? []).length
    const presentCount = (deptAttendance ?? []).filter(
      (a: Attendance) =>
        a.status === 'present' || a.status === 'late' || a.status === 'half_day',
    ).length
    const absentCount = totalUsers - presentCount
    const eodSubmitted = (deptEODs ?? []).length

    // Presentational: sales aggregates + targets (default of 5 when unset)
    const deptLeadsTotal =
      deptMetrics?.reduce((sum, m) => sum + m.leads, 0) ?? 0
    const deptCallsTotal =
      deptMetrics?.reduce((sum, m) => sum + m.calls, 0) ?? 0
    const salesLeadsTarget = deptLeadsTarget > 0 ? deptLeadsTarget : 5
    const salesCallsTarget = deptCallsTarget > 0 ? deptCallsTarget : 5

    return (
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title={`${department?.name ?? 'Team'} Dashboard`}
          description={`${totalUsers} team member${totalUsers !== 1 ? 's' : ''} · Today's overview · ${formatDate(today)}`}
          actions={
            <Button
              variant="outline"
              size="sm"
              render={<a href="/api/export/attendance" />} nativeButton={false}
            >
              <Download className="size-3.5" />
              Export Attendance CSV
            </Button>
          }
        />

        {/* Stats grid */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Present Today"
            icon={UserCheck}
            iconClassName="border-status-positive/25 bg-status-positive/10 text-status-positive"
            value={presentCount}
            valueClassName={toneText('positive')}
            hint={`out of ${totalUsers} team member${totalUsers !== 1 ? 's' : ''}`}
          >
            <BulletChart value={presentCount} target={totalUsers} label="Present" />
          </StatCard>

          <StatCard
            label="Absent Today"
            icon={UserX}
            iconClassName="border-status-negative/25 bg-status-negative/10 text-status-negative"
            value={absentCount}
            valueClassName={toneText('negative')}
            hint="not checked in yet"
          />

          <StatCard
            label="EOD Submitted"
            icon={FileText}
            iconClassName="border-status-partial/25 bg-status-partial/10 text-status-partial"
            value={eodSubmitted}
            valueClassName={toneText('partial')}
            hint={`out of ${totalUsers} team member${totalUsers !== 1 ? 's' : ''}`}
          >
            <BulletChart
              value={eodSubmitted}
              target={totalUsers}
              label="EOD"
              tone="partial"
            />
          </StatCard>

          {isSalesDept(department) ? (
            <StatCard
              label="Sales Today"
              icon={BarChart3}
              iconClassName="border-status-partial/25 bg-status-partial/10 text-status-partial"
              value={deptLeadsTotal}
              valueClassName={toneText('partial')}
              hint={
                <span>
                  <span className="numeric font-medium text-foreground">
                    {deptCallsTotal}
                  </span>{' '}
                  calls today
                </span>
              }
            >
              <div className="space-y-3">
                <BulletChart
                  value={deptLeadsTotal}
                  target={salesLeadsTarget}
                  label="Leads"
                  tone="partial"
                />
                <BulletChart
                  value={deptCallsTotal}
                  target={salesCallsTarget}
                  label="Calls"
                />
              </div>
            </StatCard>
          ) : (
            <StatCard
              label="Attendance Rate"
              icon={TrendingUp}
              value={`${totalUsers > 0 ? Math.round((presentCount / totalUsers) * 100) : 0}%`}
              hint="attendance rate today"
            />
          )}
        </section>

        {/* Team + compliance */}
        <section className="grid gap-4 lg:grid-cols-2">
          {/* Team Attendance Today */}
          <ListCard
            icon={Users}
            title="Team Attendance Today"
            action={
              <Link href="/attendance" className={LINK_CLASSES}>
                View all
              </Link>
            }
          >
            {!deptUsers || deptUsers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No team members"
                description="There is no one in your department to show."
              />
            ) : (
              <ListRows>
                {deptUsers.map((u: AppUser) => {
                  const att = attendanceMap.get(u.id)
                  return (
                    <ListRow key={u.id}>
                      <span className="truncate text-sm font-medium text-foreground">
                        {u.name}
                      </span>
                      <StatusPill
                        status={att ? att.status : 'absent'}
                        className="shrink-0"
                      />
                    </ListRow>
                  )
                })}
              </ListRows>
            )}
          </ListCard>

          {/* EOD Compliance + Overdue Tasks */}
          <div className="space-y-4">
            {/* EOD non-submitters */}
            <ListCard
              icon={AlertCircle}
              title={`EOD Pending (${nonSubmitters.length})`}
              action={
                <Link href="/reports" className={LINK_CLASSES}>
                  Reports
                </Link>
              }
            >
              {nonSubmitters.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="All EODs submitted"
                  description="Every team member has submitted their EOD today."
                />
              ) : (
                <ListRows>
                  {nonSubmitters.slice(0, 8).map((u: AppUser) => (
                    <ListRow key={u.id}>
                      <span className="truncate text-sm text-foreground">
                        {u.name}
                      </span>
                      <StatusPill
                        status="not_submitted"
                        label="Missing"
                        className="shrink-0"
                      />
                    </ListRow>
                  ))}
                  {nonSubmitters.length > 8 && (
                    <div className="px-5 py-2 text-xs text-muted-foreground">
                      <span className="numeric font-medium">
                        +{nonSubmitters.length - 8}
                      </span>{' '}
                      more
                    </div>
                  )}
                </ListRows>
              )}
            </ListCard>

            {/* Overdue Tasks */}
            <ListCard
              icon={Timer}
              title="Overdue Tasks"
              action={
                <Link href="/tasks" className={LINK_CLASSES}>
                  View all
                </Link>
              }
            >
              {!overdueTasks || overdueTasks.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No overdue tasks"
                  description="Great job — nothing is past due in your team."
                />
              ) : (
                <ListRows>
                  {overdueTasks.slice(0, 8).map((t: any) => (
                    <ListRow key={t.id}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {t.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {userNameMap.get(t.assigned_to) ?? 'Unknown'} · Due{' '}
                          <span className="numeric">
                            {formatDate(t.due_date!)}
                          </span>
                        </p>
                      </div>
                      <StatusPill status={t.priority} className="shrink-0" />
                    </ListRow>
                  ))}
                  {overdueTasks.length > 8 && (
                    <div className="px-5 py-2 text-xs text-muted-foreground">
                      <span className="numeric font-medium">
                        +{overdueTasks.length - 8}
                      </span>{' '}
                      more
                    </div>
                  )}
                </ListRows>
              )}
            </ListCard>
          </div>
        </section>
      </div>
    )
  }

  // =========================================================================
  // ROLE: Super Admin
  // =========================================================================

  // --- Core queries ---
  // These eight reads are independent. Issued in parallel instead of paying
  // eight sequential round-trips on every dashboard load. Count-only queries
  // ask for `id`; row queries fetch only the columns the UI renders.
  const [
    { count: totalDepartments },
    { data: allDepartmentsRaw },
    { count: presentToday },
    { count: eodSubmittedToday },
    { data: allActiveUsers },
    { data: allEODs },
  ] = await Promise.all([
    supabase
      .from('department')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('department')
      .select('id, name, is_active, leads_target, calls_target')
      .order('name'),
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('work_date', today)
      .in('status', ['present', 'late', 'half_day']),
    supabase
      .from('eod_report')
      .select('id', { count: 'exact', head: true })
      .eq('report_date', today),
    // all active users, for the EOD compliance widget
    supabase
      .from('app_user')
      .select('id, name, email, department_id')
      .eq('status', 'active')
      .order('name'),
    // EOD reports for today (all users)
    supabase
      .from('eod_report')
      .select('user_id, status')
      .eq('report_date', today),
  ])

  // Narrowed selects come back with a structural row type; cast once here so
  // the rest of the component keeps using the full Department type.
  const allDepartments = (allDepartmentsRaw ?? []) as Department[]

  // allActiveUsers is already every active user — derive the headcount and the
  // per-department counts from it instead of re-querying app_user twice more.
  const totalEmployees = (allActiveUsers ?? []).length

  const eodSubmitterMap = new Map<string, string>(
    (allEODs ?? []).map((e: { user_id: string; status: string }) => [
      e.user_id,
      e.status,
    ]),
  )

  const orgNonSubmitters = (allActiveUsers ?? []).filter(
    (u: { id: string }) => !eodSubmitterMap.has(u.id),
  )

  // Get department member counts (derived from allActiveUsers)
  const deptMemberCounts: Record<string, number> = {}

  for (const row of allActiveUsers ?? []) {
    const did = (row as any).department_id as string | null
    if (!did) continue
    deptMemberCounts[did] = (deptMemberCounts[did] ?? 0) + 1
  }

  // Build dept name map
  const deptNameMap = new Map<string, string>(
    (allDepartments ?? []).map((d: Department) => [d.id, d.name]),
  )

  const attendanceRate =
    (totalEmployees ?? 0) > 0
      ? Math.round(((presentToday ?? 0) / (totalEmployees ?? 1)) * 100)
      : 0

  // =========================================================================
  // Phase 6: This Week Stats
  // =========================================================================

  // Weekly stats — three independent reads, issued in parallel
  const [
    { count: weeklyReportsThisWeek },
    { data: weekMetrics },
    { data: weekAttendance },
  ] = await Promise.all([
    supabase
      .from('weekly_report')
      .select('id', { count: 'exact', head: true })
      .eq('week_start', weekStart),
    // total leads & calls this week
    supabase
      .from('daily_metrics')
      .select('leads, calls')
      .gte('entry_date', weekStart)
      .lte('entry_date', weekEnd),
    // attendance rows for the week
    supabase
      .from('attendance')
      .select('status')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd),
  ])

  const totalLeadsWeek =
    weekMetrics?.reduce((sum: number, m: any) => sum + (m.leads ?? 0), 0) ?? 0
  const totalCallsWeek =
    weekMetrics?.reduce((sum: number, m: any) => sum + (m.calls ?? 0), 0) ?? 0

  const totalWorkDays = 6 // Mon–Sat
  const totalPossibleCheckins =
    (totalEmployees ?? 0) * totalWorkDays
  const presentThisWeek =
    weekAttendance?.filter(
      (a: any) =>
        a.status === 'present' ||
        a.status === 'late' ||
        a.status === 'half_day',
    ).length ?? 0
  const avgAttendanceRate =
    totalPossibleCheckins > 0
      ? Math.round((presentThisWeek / totalPossibleCheckins) * 100)
      : 0

  // =========================================================================
  // Phase 6: Sales Department Metrics Comparison
  // =========================================================================

  // Find sales departments
  const salesDepts = (allDepartments ?? []).filter(
    (d: Department) => isSalesDept(d),
  )

  // Get today's metrics for all users in sales departments
  const salesDeptIds = salesDepts.map((d) => d.id)
  const salesDeptUserIds: string[] =
    salesDeptIds.length > 0
      ? (allActiveUsers ?? [])
          .filter((u: any) => salesDeptIds.includes(u.department_id))
          .map((u: any) => u.id)
      : []

  let todaySalesMetrics: any[] = []
  if (salesDeptUserIds.length > 0) {
    const { data: sm } = await supabase
      .from('daily_metrics')
          .select('user_id, entry_date, leads, calls')
      .in('user_id', salesDeptUserIds)
      .eq('entry_date', today)
    todaySalesMetrics = sm ?? []
  }

  // Per-department sales aggregates
  const salesDeptAggregates = salesDepts.map((dept) => {
    const memberIds =
      salesDeptUserIds.length > 0
        ? salesDeptUserIds // simplified: all sales users
        : []
    const deptMetrics = todaySalesMetrics.filter((m: any) =>
      memberIds.includes(m.user_id),
    )
    const leads = deptMetrics.reduce(
      (sum: number, m: any) => sum + (m.leads ?? 0),
      0,
    )
    const calls = deptMetrics.reduce(
      (sum: number, m: any) => sum + (m.calls ?? 0),
      0,
    )
    return {
      dept,
      leads,
      calls,
      leadsTarget: (dept as any).leads_target ?? 0,
      callsTarget: (dept as any).calls_target ?? 0,
    }
  })

  // =========================================================================
  // Phase 6: Recent Weekly Reports
  // =========================================================================

  const { data: recentWeeklyReports } = await supabase
    .from('weekly_report')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(4)

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Organisation Dashboard"
        description={`Company-wide overview for ${formatDate(today)}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              render={<a href="/api/export/attendance" />} nativeButton={false}
            >
              <Download className="size-3.5" />
              Attendance CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<a href="/api/export/eod" />} nativeButton={false}
            >
              <Download className="size-3.5" />
              EOD CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<a href="/api/export/weekly" />} nativeButton={false}
            >
              <Download className="size-3.5" />
              Weekly CSV
            </Button>
          </>
        }
      />

      {/* Key metrics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Employees"
          icon={Users}
          value={totalEmployees ?? 0}
          hint="active accounts"
        />

        <StatCard
          label="Departments"
          icon={Building2}
          value={totalDepartments ?? 0}
          hint="across the organisation"
        />

        <StatCard
          label="Present Today"
          icon={UserCheck}
          iconClassName="border-status-positive/25 bg-status-positive/10 text-status-positive"
          value={presentToday ?? 0}
          valueClassName={toneText('positive')}
          hint={`${attendanceRate}% attendance rate`}
        >
          <BulletChart
            value={presentToday ?? 0}
            target={totalEmployees ?? 0}
            label="Present"
          />
        </StatCard>

        <StatCard
          label="EOD Submitted"
          icon={FileText}
          iconClassName="border-status-partial/25 bg-status-partial/10 text-status-partial"
          value={eodSubmittedToday ?? 0}
          valueClassName={toneText('partial')}
          hint={`of ${totalEmployees ?? 0} employees`}
        >
          <BulletChart
            value={eodSubmittedToday ?? 0}
            target={totalEmployees ?? 0}
            label="EOD"
            tone="partial"
          />
        </StatCard>
      </section>

      {/* --- Phase 6: This Week Stats --- */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          This week
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Weekly Reports"
            icon={FileText}
            value={weeklyReportsThisWeek ?? 0}
            hint="generated this week"
          />

          <StatCard
            label="Leads This Week"
            icon={Target}
            iconClassName="border-status-partial/25 bg-status-partial/10 text-status-partial"
            value={totalLeadsWeek}
            valueClassName={toneText('partial')}
            hint="Mon–Sat aggregate"
          />

          <StatCard
            label="Calls This Week"
            icon={BarChart3}
            iconClassName="border-status-positive/25 bg-status-positive/10 text-status-positive"
            value={totalCallsWeek}
            valueClassName={toneText('positive')}
            hint="Mon–Sat aggregate"
          />

          <StatCard
            label="Avg Attendance"
            icon={TrendingUp}
            value={`${avgAttendanceRate}%`}
            hint="this week"
          />
        </div>
      </section>

      {/* Department overview + EOD Compliance */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Department overview */}
        <ListCard
          icon={Building2}
          title="Departments Overview"
          action={
            <Link href="/admin/departments" className={LINK_CLASSES}>
              Manage
            </Link>
          }
        >
          {!allDepartments || allDepartments.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No departments yet"
              description="No departments have been created."
            />
          ) : (
            <ListRows>
              {allDepartments.map((d: Department) => (
                <ListRow key={d.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {d.name}
                    </span>
                    {!d.is_active && (
                      <StatusPill status="inactive" className="shrink-0" />
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="numeric font-medium text-foreground">
                      {deptMemberCounts[d.id] ?? 0}
                    </span>{' '}
                    members
                  </span>
                </ListRow>
              ))}
            </ListRows>
          )}
        </ListCard>

        {/* --- Phase 6: EOD Compliance Widget --- */}
        <ListCard
          icon={CheckSquare}
          title="EOD Compliance Today"
          action={
            <Link href="/reports" className={LINK_CLASSES}>
              View all
            </Link>
          }
        >
          {!allActiveUsers || allActiveUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees found"
              description="No active employee accounts to show."
            />
          ) : (
            <ListRows className="max-h-[400px] overflow-y-auto">
              {allActiveUsers.map(
                (u: {
                  id: string
                  name: string
                  email: string
                  department_id: string | null
                }) => {
                  const eodStatus = eodSubmitterMap.get(u.id)
                  const isSubmitted = eodStatus === 'submitted'
                  const isLate = eodStatus === 'late'
                  const isMissed = eodStatus === 'missed' || !eodStatus

                  return (
                    <ListRow key={u.id}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {u.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {deptNameMap.get(u.department_id ?? '') ?? 'No dept'}
                        </p>
                      </div>
                      {isSubmitted ? (
                        <StatusPill status="submitted" className="shrink-0" />
                      ) : isLate ? (
                        <StatusPill status="late" className="shrink-0" />
                      ) : (
                        <StatusPill
                          status={isMissed ? 'missed' : 'not_submitted'}
                          label={isMissed ? 'Missed' : 'Missing'}
                          className="shrink-0"
                        />
                      )}
                    </ListRow>
                  )
                },
              )}
            </ListRows>
          )}
        </ListCard>
      </section>

      {/* --- Phase 6: Sales Department Metrics Comparison --- */}
      {salesDeptAggregates.length > 0 && (
        <ListCard icon={Target} title="Sales Department Metrics — Today">
          <ListRows>
            {salesDeptAggregates.map((agg) => {
              // Presentational target fallback — default of 5 when unset
              const leadsTarget = agg.leadsTarget > 0 ? agg.leadsTarget : 5
              const callsTarget = agg.callsTarget > 0 ? agg.callsTarget : 5
              return (
                <div key={agg.dept.id} className="space-y-3 px-5 py-4">
                  <p className="text-sm font-medium text-foreground">
                    {agg.dept.name}
                  </p>
                  <BulletChart
                    value={agg.leads}
                    target={leadsTarget}
                    label="Leads"
                    tone="partial"
                  />
                  <BulletChart
                    value={agg.calls}
                    target={callsTarget}
                    label="Calls"
                  />
                </div>
              )
            })}
          </ListRows>
        </ListCard>
      )}

      {/* --- Phase 6: Recent Weekly Reports --- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ListCard
          icon={CalendarDays}
          title="Recent Weekly Reports"
          action={
            <Link href="/reports" className={LINK_CLASSES}>
              All reports
            </Link>
          }
        >
          {!recentWeeklyReports || recentWeeklyReports.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No weekly reports"
              description="Weekly reports will appear here once generated."
            />
          ) : (
            <ListRows>
              {recentWeeklyReports.map((wr: any) => (
                <ListRow key={wr.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      Week of {formatDate(wr.week_start)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="numeric">{wr.days_present ?? 0}</span>{' '}
                      days ·{' '}
                      <span className="numeric">{wr.leads_total ?? 0}</span>{' '}
                      leads ·{' '}
                      <span className="numeric">{wr.calls_total ?? 0}</span>{' '}
                      calls ·{' '}
                      <span className="numeric">
                        {wr.tasks_completed ?? 0}
                      </span>{' '}
                      tasks
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="numeric font-medium text-foreground">
                      {wr.eod_submitted ?? 0}
                    </span>{' '}
                    EODs
                  </span>
                </ListRow>
              ))}
            </ListRows>
          )}
        </ListCard>

        {/* EOD Pending + Quick Links */}
        <div className="space-y-4">
          {/* Non-submitters today */}
          <ListCard
            icon={AlertCircle}
            title={`EOD Pending (${orgNonSubmitters.length})`}
            action={
              <Link href="/reports" className={LINK_CLASSES}>
                Reports
              </Link>
            }
          >
            {orgNonSubmitters.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All EODs submitted"
                description="Every employee has submitted their EOD today."
              />
            ) : (
              <ListRows className="max-h-[300px] overflow-y-auto">
                {orgNonSubmitters
                  .slice(0, 10)
                  .map(
                    (u: {
                      id: string
                      name: string
                      email: string
                    }) => (
                      <ListRow key={u.id}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {u.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {u.email}
                          </p>
                        </div>
                        <StatusPill
                          status="not_submitted"
                          label="Missing"
                          className="shrink-0"
                        />
                      </ListRow>
                    ),
                  )}
                {orgNonSubmitters.length > 10 && (
                  <div className="px-5 py-2 text-xs text-muted-foreground">
                    <span className="numeric font-medium">
                      +{orgNonSubmitters.length - 10}
                    </span>{' '}
                    more
                  </div>
                )}
              </ListRows>
            )}
          </ListCard>

          {/* Quick Links */}
          <ListCard icon={ChevronRight} title="Quick Links">
            <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2">
              <Link href="/admin/users">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="size-4" />
                  Manage Users
                </Button>
              </Link>
              <Link href="/admin/departments">
                <Button variant="outline" className="w-full justify-start">
                  <Building2 className="size-4" />
                  Manage Departments
                </Button>
              </Link>
              <Link href="/attendance">
                <Button variant="outline" className="w-full justify-start">
                  <Clock className="size-4" />
                  Attendance
                </Button>
              </Link>
              <Link href="/reports">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="size-4" />
                  Reports
                </Button>
              </Link>
            </div>
          </ListCard>
        </div>
      </section>
    </div>
  )
}
