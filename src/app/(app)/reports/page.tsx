'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Send,
  History,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Users,
  BarChart3,
  Download,
  Printer,
  FileClock,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { StatusPill } from '@/components/status'
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/states'

import {
  submitEOD,
  getTodayEOD,
  getEODHistory,
  getEODCompliance,
  getProfile,
} from './actions'
import type { EODReportWithUser, EODComplianceRow } from './actions'
import type { EODReport } from '@/types'
import { cn, formatDate, formatDateTime, orgToday } from '@/lib/utils'
import { useDraft } from '@/hooks/use-draft'

export const dynamic = 'force-dynamic'

const inputClass =
  'h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40'

/**
 * Date (YYYY-MM-DD) N days before today in the org timezone. Uses the
 * orgToday() string as the anchor so quick-range chips never drift from
 * the day the draft keys and EOD reporting key off.
 */
function orgDateOffset(days: number): string {
  const [y, m, d] = orgToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** Quick-range presets for the history tab (labels + range factories so
 *  the active chip can be re-derived from the current inputs). */
const HISTORY_PRESETS = [
  {
    id: 'last-7',
    label: 'Last 7 days',
    range: () => ({ from: orgDateOffset(6), to: orgToday() }),
  },
  {
    id: 'last-30',
    label: 'Last 30 days',
    range: () => ({ from: orgDateOffset(29), to: orgToday() }),
  },
  {
    id: 'this-month',
    label: 'This month',
    range: () => ({ from: `${orgToday().slice(0, 7)}-01`, to: orgToday() }),
  },
] as const

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('submit')
  const [userRole, setUserRole] = useState<string>('employee')
  const [userDept, setUserDept] = useState<string | null>(null)

  // ---- Submit EOD state ----
  const [todayEOD, setTodayEOD] = useState<EODReport | null>(null)
  const [eodLoading, setEodLoading] = useState(true)
  const [summary, setSummary] = useState('')
  const [hoursWorked, setHoursWorked] = useState('')
  const [leads, setLeads] = useState('')
  const [calls, setCalls] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  // True after "Edit submission" — keeps the button/title in "Update" mode
  // even while alreadySubmitted is false (it also gates the submitted-card).
  const [editingSubmission, setEditingSubmission] = useState(false)
  // True once the user edits a field (or restores a draft). Gates the
  // autosave writer: server-loaded values (fresh mount, or the reload
  // after a successful submit) must never be persisted as a phantom
  // "draft" — only genuine unsaved edits are worth offering back.
  const [formTouched, setFormTouched] = useState(false)

  // ---- History state ----
  const [history, setHistory] = useState<EODReportWithUser[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ---- Compliance state ----
  const [compliance, setCompliance] = useState<EODComplianceRow[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceDate, setComplianceDate] = useState('')

  // ---- Draft autosave (presentation-only; keyed per day so drafts never
  //      leak across EOD days — mirrors the same fields submitEOD sends) ----
  const eodDraftKey = `weblaze-ems:eod-draft:${orgToday()}`
  const eodDraftState = { summary, hoursWorked, leads, calls }
  // Pristine initial state snapshot (lazy useState — captured once) so the
  // mount-time restore check compares against the ORIGINAL form, before
  // getTodayEOD() may have loaded a submitted report into it.
  const [eodInitialDraftState] = useState(eodDraftState)
  const eodDraftIsEmpty = useCallback(
    (s: typeof eodDraftState) =>
      !s.summary.trim() && !s.hoursWorked && !s.leads && !s.calls,
    []
  )
  const {
    restoredDraft: restoredEodDraft,
    clearDraft: clearEodDraft,
    dismissDraft: dismissEodDraft,
  } = useDraft(
    eodDraftKey,
    eodDraftState,
    eodDraftIsEmpty,
    eodInitialDraftState,
    { enabled: formTouched }
  )

  /** Apply a restored draft back into the form state. */
  const applyEodDraft = () => {
    if (!restoredEodDraft) return
    setFormTouched(true)
    setSummary(restoredEodDraft.state.summary)
    setHoursWorked(restoredEodDraft.state.hoursWorked)
    setLeads(restoredEodDraft.state.leads)
    setCalls(restoredEodDraft.state.calls)
    dismissEodDraft()
    toast.success('Draft restored', {
      description: 'Your unsaved changes from this session are back.',
    })
  }

  // ---- Load today's EOD ----
  const loadTodayEOD = useCallback(async () => {
    setEodLoading(true)
    try {
      const result = await getTodayEOD()
      if (result.success) {
        setTodayEOD(result.data)
        setAlreadySubmitted(!!result.data)
        if (result.data) {
          setSummary(result.data.summary)
          setHoursWorked(String(result.data.hours_worked))
        }
      }
    } catch {
      // ignore
    } finally {
      setEodLoading(false)
    }
  }, [])

  // ---- Load history ----
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await getEODHistory({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      if (result.success) {
        setHistory(result.data)
      } else {
        setHistoryError(result.error)
      }
    } catch {
      setHistoryError('Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }, [dateFrom, dateTo])

  // ---- Load compliance ----
  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true)
    try {
      const result = await getEODCompliance(complianceDate || undefined)
      if (result.success) {
        setCompliance(result.data)
        // Infer role from having multiple users
        if (result.data.length > 1) {
          setUserRole('admin')
        }
      }
    } catch {
      // ignore
    } finally {
      setComplianceLoading(false)
    }
  }, [complianceDate])

  useEffect(() => {
    // Load profile for role/department detection
    async function loadProfile() {
      const res = await getProfile()
      if (res.success) {
        setUserRole(res.data.user.role)
        setUserDept(res.data.department?.name ?? null)
      }
    }
    loadProfile()
    loadTodayEOD()
    loadHistory()
    loadCompliance()
  }, [loadTodayEOD, loadHistory, loadCompliance])

  // ---- Submit handler ----
  async function handleSubmit() {
    if (summary.length < 10) {
      toast.error('Summary must be at least 10 characters')
      return
    }
    if (!hoursWorked || Number(hoursWorked) <= 0) {
      toast.error('Hours worked must be a positive number')
      return
    }

    setSubmitting(true)
    try {
      const payload: any = {
        summary: summary.trim(),
        hours_worked: Number(hoursWorked),
      }

      // If sales department, include metrics
      if (userDept?.toLowerCase().includes('sales')) {
        if (leads) payload.leads = Number(leads)
        if (calls) payload.calls = Number(calls)
      }

      const result = await submitEOD(payload)
      if (result.success) {
        // Submitted — the draft has served its purpose; drop it so the
        // next day's form starts clean. Also re-suspend the writer until
        // the next real edit: loadTodayEOD() below refills the form from
        // the server, and those loaded values must NOT be re-saved as a
        // phantom draft (the bug this flag closes).
        clearEodDraft()
        setFormTouched(false)
        setEditingSubmission(false)
        toast.success(
          alreadySubmitted || editingSubmission
            ? 'EOD report updated'
            : 'EOD report submitted'
        )
        setAlreadySubmitted(true)
        loadTodayEOD()
        loadHistory()
      } else {
        toast.error(result.error || 'Failed to submit EOD report')
      }
    } catch {
      toast.error('Failed to submit EOD report')
    } finally {
      setSubmitting(false)
    }
  }

  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="EOD Reports"
        description="End-of-day reports and compliance tracking"
        actions={
          <>
            {/* Print the current tab — the global print stylesheet flips the
                dark tokens to paper and hides the sidebar. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              aria-label="Print reports"
              title="Print (Ctrl+P)"
            >
              <Printer className="size-3.5" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<a href="/api/export/eod" />} nativeButton={false}
            >
              <Download className="size-3.5" />
              Download CSV
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="submit">
            <Send className="size-4" />
            Submit EOD
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" />
            History
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="compliance">
              <Users className="size-4" />
              Compliance
            </TabsTrigger>
          )}
        </TabsList>

        {/* ================================================================ */}
        {/* Tab 1: Submit EOD                                                */}
        {/* ================================================================ */}
        <TabsContent value="submit">
          <div className="mt-4 space-y-4">
            {eodLoading ? (
              <Card className="gap-0 py-5">
                <CardContent className="px-5">
                  <div className="space-y-3">
                    <div className="h-4 w-36 animate-pulse rounded bg-foreground/[0.07]" />
                    <div className="h-24 w-full animate-pulse rounded-lg bg-foreground/[0.07]" />
                    <div className="h-4 w-24 animate-pulse rounded bg-foreground/[0.07]" />
                    <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/[0.07]" />
                    <div className="h-8 w-32 animate-pulse rounded-lg bg-foreground/[0.07]" />
                  </div>
                </CardContent>
              </Card>
            ) : alreadySubmitted ? (
              <Card className="gap-0 py-5">
                <CardContent className="px-5">
                  <div className="flex flex-col items-center py-4 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full border border-status-positive/25 bg-status-positive/10 text-status-positive">
                      <CheckCircle className="size-5" />
                    </span>
                    <p className="mt-4 text-sm font-medium text-foreground">
                      EOD report already submitted for today
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                      Status:
                      <StatusPill
                        status={todayEOD?.status ?? 'submitted'}
                      />
                    </div>
                    {todayEOD?.submitted_at && (
                      <p className="numeric mt-1.5 text-xs text-muted-foreground">
                        Submitted at {formatDateTime(todayEOD.submitted_at)}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-5"
                      onClick={() => {
                        setEditingSubmission(true)
                        setAlreadySubmitted(false)
                      }}
                    >
                      Edit submission
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="gap-0 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="flex items-center justify-between gap-3 text-[13px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-md border border-status-positive/25 bg-status-positive/10 text-status-positive">
                        <Send className="size-3.5" />
                      </span>
                      {alreadySubmitted || editingSubmission
                        ? "Update Today's Report"
                        : "Submit Today's Report"}
                    </span>
                    {/* Live character counter — the submit gate is 10 chars,
                        so chip turns positive once the summary clears it. */}
                    <span
                      className={cn(
                        'numeric shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums',
                        summary.trim().length >= 10
                          ? 'border-status-positive/25 bg-status-positive/10 text-status-positive'
                          : 'border-border/60 bg-muted/40 text-muted-foreground'
                      )}
                      aria-live="off"
                    >
                      {summary.trim().length} chars
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="space-y-4">
                    {/* Restored-draft banner — offered only when the form was
                        pristine at mount and a snapshot exists for today. */}
                    {restoredEodDraft ? (
                      <div
                        role="status"
                        className="flex flex-col gap-3 rounded-lg border border-status-warning/25 bg-status-warning/10 p-3.5 sm:flex-row sm:items-center"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-status-warning/15 text-status-warning">
                          <FileClock className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            Unsaved draft found
                          </p>
                          <p className="numeric mt-0.5 text-xs text-muted-foreground">
                            Saved{' '}
                            {formatDateTime(
                              new Date(restoredEodDraft.meta.savedAt)
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={clearEodDraft}
                            className="border-status-warning/30 text-status-warning hover:bg-status-warning/10"
                          >
                            Discard
                          </Button>
                          <Button size="sm" onClick={applyEodDraft}>
                            Restore draft
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="eod-summary">
                        Summary (min 10 characters)
                      </Label>
                      <Textarea
                        id="eod-summary"
                        placeholder="What did you work on today?"
                        value={summary}
                        onChange={(e) => {
                          setFormTouched(true)
                          setSummary(e.target.value)
                        }}
                        rows={4}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="eod-hours">Hours Worked</Label>
                        <Input
                          id="eod-hours"
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="8"
                          value={hoursWorked}
                          onChange={(e) => {
                            setFormTouched(true)
                            setHoursWorked(e.target.value)
                          }}
                          className="numeric h-10"
                        />
                      </div>
                    </div>

                    {/* Sales department extra fields */}
                    {userDept?.toLowerCase().includes('sales') && (
                      <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Sales Metrics
                        </h4>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="eod-leads">Leads</Label>
                            <Input
                              id="eod-leads"
                              type="number"
                              min="0"
                              placeholder="0"
                              value={leads}
                              onChange={(e) => {
                                setFormTouched(true)
                                setLeads(e.target.value)
                              }}
                              className="numeric h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="eod-calls">Calls</Label>
                            <Input
                              id="eod-calls"
                              type="number"
                              min="0"
                              placeholder="0"
                              value={calls}
                              onChange={(e) => {
                                setFormTouched(true)
                                setCalls(e.target.value)
                              }}
                              className="numeric h-10"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Autosave hint — mirrors the draft hook behaviour:
                          writes a local draft 0.5s after typing, cleared on
                          successful submit. */}
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileClock className="size-3.5 shrink-0 text-muted-foreground/70" />
                        Draft autosaves locally — nothing is sent until you
                        submit
                      </p>
                      <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="sm:shrink-0"
                      >
                        {submitting ? (
                          <>
                            <RefreshCw className="size-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="size-4" />
                            {alreadySubmitted || editingSubmission
                              ? 'Update Report'
                              : 'Submit Report'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab 2: History                                                   */}
        {/* ================================================================ */}
        <TabsContent value="history">
          <div className="mt-4 space-y-4">
            {/* Date filters */}
            <Card size="sm">
              <CardContent className="px-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="history-from"
                      className="text-xs text-muted-foreground"
                    >
                      From
                    </Label>
                    <input
                      id="history-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className={cn(inputClass, 'numeric w-36')}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="history-to"
                      className="text-xs text-muted-foreground"
                    >
                      To
                    </Label>
                    <input
                      id="history-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className={cn(inputClass, 'numeric w-36')}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={loadHistory}
                    aria-label="Refresh history"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>

                {/* Quick-range chips — setting both inputs re-runs
                    loadHistory via its date deps. Active state derives
                    from the current inputs, so manual edits and presets
                    stay in sync. */}
                <div
                  role="group"
                  aria-label="Quick date ranges"
                  className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3"
                >
                  <span className="mr-1 hidden text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase sm:inline">
                    Quick
                  </span>
                  {HISTORY_PRESETS.map((preset) => {
                    const isActive =
                      preset.range().from === dateFrom &&
                      preset.range().to === dateTo
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          const { from, to } = preset.range()
                          setDateFrom(from)
                          setDateTo(to)
                        }}
                        className={cn(
                          'h-7 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          isActive
                            ? 'border-blue-500/40 bg-blue-500/15 text-blue-200'
                            : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                  {dateFrom || dateTo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom('')
                        setDateTo('')
                      }}
                      className={cn(
                        'ml-1 inline-flex h-7 items-center gap-1 rounded-full border border-transparent px-2 text-xs font-medium text-muted-foreground',
                        'transition-colors duration-150 hover:border-border/60 hover:bg-muted/40 hover:text-foreground',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
                      )}
                    >
                      <X className="size-3" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Loading */}
            {historyLoading && (
              <Card className="gap-0 py-0">
                <TableSkeleton rows={6} />
              </Card>
            )}

            {/* Error */}
            {!historyLoading && historyError && (
              <Card className="gap-0 py-0">
                <ErrorState
                  description={historyError}
                  onRetry={loadHistory}
                />
              </Card>
            )}

            {/* Empty */}
            {!historyLoading &&
              !historyError &&
              history.length === 0 && (
                <Card className="gap-0 py-0">
                  <EmptyState
                    icon={History}
                    title="No EOD reports found"
                    description='Submit your first report in the "Submit EOD" tab'
                  />
                </Card>
              )}

            {/* History list */}
            {!historyLoading &&
              !historyError &&
              history.length > 0 && (
                <div className="space-y-3">
                  {history.map((report) => (
                    <Card key={report.id} className="gap-0 py-4">
                      <CardContent className="px-5">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            aria-label={
                              expandedId === report.id
                                ? 'Collapse report summary'
                                : 'Expand report summary'
                            }
                            aria-expanded={expandedId === report.id}
                            className="mt-0.5 rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            onClick={() =>
                              setExpandedId(
                                expandedId === report.id
                                  ? null
                                  : report.id
                              )
                            }
                          >
                            {expandedId === report.id ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-sm font-medium text-foreground">
                                  {formatDate(report.report_date)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {report.user_name}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-2.5">
                                <StatusPill status={report.status} />
                                <span className="numeric text-xs text-muted-foreground">
                                  {report.hours_worked}h
                                </span>
                              </div>
                            </div>

                            {expandedId === report.id && (
                              <div className="mt-2.5 rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                                <p>{report.summary}</p>
                                <p className="numeric mt-1.5 text-xs text-muted-foreground">
                                  Submitted:{' '}
                                  {formatDateTime(
                                    report.submitted_at
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab 3: Compliance (Admin only)                                    */}
        {/* ================================================================ */}
        {isAdmin && (
          <TabsContent value="compliance">
            <div className="mt-4 space-y-4">
              {/* Date picker */}
              <Card size="sm">
                <CardContent className="px-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Label
                      htmlFor="compliance-date"
                      className="text-xs text-muted-foreground"
                    >
                      Date
                    </Label>
                    <input
                      id="compliance-date"
                      type="date"
                      value={complianceDate}
                      onChange={(e) =>
                        setComplianceDate(e.target.value)
                      }
                      className={cn(inputClass, 'numeric w-40')}
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={loadCompliance}
                      aria-label="Refresh compliance"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Loading */}
              {complianceLoading && (
                <Card className="gap-0 py-0">
                  <TableSkeleton rows={6} />
                </Card>
              )}

              {/* Compliance Table */}
              {!complianceLoading && compliance.length > 0 && (
                <DataTable>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <Th>Employee</Th>
                      <Th>Department</Th>
                      <Th align="right">Status</Th>
                      <Th align="right">Submitted</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compliance.map((row) => (
                      <TableRow key={row.user_id}>
                        <Td>
                          <p className="font-medium text-foreground">
                            {row.user_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.user_email}
                          </p>
                        </Td>
                        <Td className="text-muted-foreground">
                          {row.department_name || '—'}
                        </Td>
                        <Td align="right">
                          <StatusPill status={row.status} />
                        </Td>
                        <Td
                          numeric
                          align="right"
                          className="text-muted-foreground"
                        >
                          {row.submitted_at
                            ? formatDateTime(row.submitted_at)
                            : '—'}
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}

              {/* Empty compliance */}
              {!complianceLoading && compliance.length === 0 && (
                <Card className="gap-0 py-0">
                  <EmptyState
                    icon={BarChart3}
                    title="No data available"
                    description="Select a date to view team compliance"
                  />
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
