'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Calendar,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, ListCardSkeleton } from '@/components/states'

import { getWeeklyReports } from '../actions'
import type { WeeklyReport } from '@/types'
import { cn, formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function WeeklyReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getWeeklyReports({ limit: 12 })
      if (result.success) {
        setReports(result.data)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Failed to load weekly reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Weekly Reports"
        description="Auto-generated weekly performance summaries"
        actions={
          <Button
            variant="outline"
            size="icon-sm"
            onClick={loadReports}
            aria-label="Refresh weekly reports"
          >
            <RefreshCw
              className={cn('size-4', loading && 'animate-spin')}
            />
          </Button>
        }
      />

      {/* Loading */}
      {loading && <ListCardSkeleton rows={5} />}

      {/* Error */}
      {!loading && error && (
        <Card className="gap-0 py-0">
          <ErrorState description={error} onRetry={loadReports} />
        </Card>
      )}

      {/* Empty */}
      {!loading && !error && reports.length === 0 && (
        <Card className="gap-0 py-0">
          <EmptyState
            icon={FileText}
            title="No weekly reports yet"
            description="Weekly reports are auto-generated at the end of each week based on your EOD submissions."
          />
        </Card>
      )}

      {/* Reports List */}
      {!loading && !error && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id} className="gap-0 py-4">
              <CardContent className="px-5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={
                      expandedId === report.id
                        ? 'Collapse week details'
                        : 'Expand week details'
                    }
                    aria-expanded={expandedId === report.id}
                    className="mt-0.5 rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() =>
                      setExpandedId(
                        expandedId === report.id ? null : report.id
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
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Calendar className="size-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">
                          Week of {formatDate(report.week_start)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          to {formatDate(report.week_end)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle className="size-3.5" />
                          <span className="numeric font-semibold text-foreground">
                            {report.tasks_completed}
                          </span>{' '}
                          tasks
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          <span className="numeric font-semibold text-foreground">
                            {report.days_present}
                          </span>
                          d present
                        </span>
                      </div>
                    </div>

                    {expandedId === report.id && (
                      <div className="mt-3 space-y-3">
                        {report.employee_note && (
                          <div className="rounded-lg bg-muted/40 p-3">
                            <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Employee Note
                            </h4>
                            <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                              {report.employee_note}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                            <p className="text-xs text-muted-foreground">
                              Tasks
                            </p>
                            <p className="numeric mt-0.5 text-lg font-semibold text-foreground">
                              {report.tasks_completed}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                            <p className="text-xs text-muted-foreground">
                              EODs Submitted
                            </p>
                            <p className="numeric mt-0.5 text-lg font-semibold text-foreground">
                              {report.eod_submitted}/6
                            </p>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                            <p className="text-xs text-muted-foreground">
                              Days Present
                            </p>
                            <p className="numeric mt-0.5 text-lg font-semibold text-foreground">
                              {report.days_present}
                            </p>
                          </div>
                        </div>

                        <p className="numeric text-xs text-muted-foreground">
                          Generated on{' '}
                          {formatDate(report.generated_at)}
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
  )
}
