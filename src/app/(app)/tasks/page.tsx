'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Trash2,
  Calendar,
  Clock,
  User,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  FileClock,
  FilterX,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/page-header'
import { StatusPill, STATUS_COLORS, statusTone } from '@/components/status'
import { EmptyState, ErrorState, ListCardSkeleton } from '@/components/states'
import { useDraft } from '@/hooks/use-draft'

import { getTasks, createTask, updateTaskStatus, deleteTask, getProfile } from './actions'
import type { TaskWithAssignee, TaskFilters } from './actions'
import { getUsers } from '../admin/users/actions'
import type { UserWithDepartment } from '../admin/users/actions'
import type { TaskPriority, TaskStatus } from '@/types'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS: { value: TaskPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}

/** True when the keydown happened inside a text-entry surface. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

const inputClass =
  'h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40'

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('employee')

  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>(
    'all'
  )
  const [searchQuery, setSearchQuery] = useState('')
  // Debounced mirror of the search box — getTasks fires at most 300ms after
  // the last keystroke instead of once per character.
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium')
  const [newDueDate, setNewDueDate] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [assignableUsers, setAssignableUsers] = useState<UserWithDepartment[]>([])
  const [saving, setSaving] = useState(false)

  // ---- New-task draft (autosave — mirrors the EOD draft on /reports) ----
  const taskDraftState = {
    title: newTitle,
    description: newDescription,
    priority: newPriority,
    dueDate: newDueDate,
    assignee: newAssignee,
  }
  // Pristine snapshot captured once, before any edits, for the mount-time
  // restore decision.
  const [initialTaskDraftState] = useState(taskDraftState)
  const taskDraftIsEmpty = useCallback(
    (s: typeof taskDraftState) =>
      !s.title.trim() &&
      !s.description.trim() &&
      !s.dueDate &&
      !s.assignee &&
      s.priority === 'medium',
    []
  )
  const {
    restoredDraft: restoredTaskDraft,
    clearDraft: clearTaskDraft,
    dismissDraft: dismissTaskDraft,
  } = useDraft(
    'weblaze-ems:task-draft',
    taskDraftState,
    taskDraftIsEmpty,
    initialTaskDraftState
  )

  /** Unsubmitted work exists (a stored draft or live field values). */
  const hasTaskDraft =
    restoredTaskDraft !== null || !taskDraftIsEmpty(taskDraftState)

  /** Any edit supersedes the restore offer — the form holds newer truth. */
  function dismissStaleDraftOffer() {
    if (restoredTaskDraft) dismissTaskDraft()
  }

  /** Apply a restored draft back into the dialog fields. */
  function applyTaskDraft() {
    if (!restoredTaskDraft) return
    setNewTitle(restoredTaskDraft.state.title)
    setNewDescription(restoredTaskDraft.state.description)
    setNewPriority(restoredTaskDraft.state.priority)
    setNewDueDate(restoredTaskDraft.state.dueDate)
    // Coalesce for drafts stored before the assignee field existed.
    setNewAssignee(restoredTaskDraft.state.assignee ?? '')
    dismissTaskDraft()
    toast.success('Draft restored', {
      description: 'Your unsaved task is back in the form.',
    })
  }

  // Detail dialog
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignee | null>(
    null
  )
  const [detailOpen, setDetailOpen] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<TaskWithAssignee | null>(
    null
  )
  const [deleting, setDeleting] = useState(false)

  // Expanded cards
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ---- Fetch tasks ----
  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: TaskFilters = {
        status: statusFilter,
        priority: priorityFilter,
        search: debouncedSearch || undefined,
      }
      const result = await getTasks(filters)
      if (result.success) {
        setTasks(result.data)
      } else {
        setError(result.error)
      }
    } catch (e) {
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter, debouncedSearch])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Also fetch user role from profile — and, for task creators, the
  // assignable users (same admin/super_admin gate as createTask; reuses
  // the frozen getUsers action so no contract changes are needed).
  useEffect(() => {
    let cancelled = false
    async function checkRole() {
      const result = await getProfile()
      if (!result.success || cancelled) return
      setUserRole(result.data.user.role)
      const canCreate =
        result.data.user.role === 'admin' ||
        result.data.user.role === 'super_admin'
      if (!canCreate) return
      const usersResult = await getUsers({})
      if (cancelled || !usersResult.success) return
      setAssignableUsers(
        usersResult.data
          .filter((u) => u.status === 'active')
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    }
    checkRole()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- Status change handler ----
  async function handleStatusChange(
    taskId: string,
    newStatus: TaskStatus
  ) {
    const result = await updateTaskStatus(taskId, newStatus)
    if (result.success) {
      toast.success(`Task status updated to ${newStatus.replace('_', ' ')}`)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        )
      )
    } else {
      toast.error(result.error || 'Failed to update status')
    }
  }

  // ---- Create task ----
  async function handleCreate() {
    if (!newTitle.trim()) {
      toast.error('Title is required')
      return
    }
    // assigned_to is a required UUID in the frozen taskSchema — the form
    // must collect a real assignee. The old all-zeros placeholder UUID
    // violated the app_user FK (23503) and made every create fail.
    if (!newAssignee) {
      toast.error('Select an assignee', {
        description: 'Tasks must be assigned to a team member.',
      })
      return
    }
    setSaving(true)
    try {
      const result = await createTask({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        assigned_to: newAssignee,
        priority: newPriority,
        due_date: newDueDate || undefined,
      })
      if (result.success) {
        toast.success('Task created')
        // Created — the draft has served its purpose; drop it.
        clearTaskDraft()
        setCreateOpen(false)
        setNewTitle('')
        setNewDescription('')
        setNewPriority('medium')
        setNewDueDate('')
        setNewAssignee('')
        fetchTasks()
      } else {
        toast.error(result.error || 'Failed to create task')
      }
    } catch {
      toast.error('Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  // ---- Delete task ----
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteTask({ id: deleteTarget.id })
      if (result.success) {
        toast.success('Task deleted')
        setDeleteTarget(null)
        setDetailOpen(false)
        fetchTasks()
      } else {
        toast.error(result.error || 'Failed to delete task')
      }
    } catch {
      toast.error('Failed to delete task')
    } finally {
      setDeleting(false)
    }
  }

  // ---- Helpers ----
  function openDetail(task: TaskWithAssignee) {
    setSelectedTask(task)
    setDetailOpen(true)
  }

  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  // ---- "N" hotkey opens the New task dialog (admins, not while typing) ----
  useEffect(() => {
    if (!isAdmin) return
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.key === 'n' || e.key === 'N') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(e.target) &&
        !createOpen &&
        !detailOpen &&
        !deleteTarget
      ) {
        e.preventDefault()
        setCreateOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAdmin, createOpen, detailOpen, deleteTarget])

  // ---- Filter helpers ----
  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0)

  function clearFilters() {
    setStatusFilter('all')
    setPriorityFilter('all')
    setSearchQuery('')
  }

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Tasks"
        description={"Manage and track your team's tasks"}
        actions={
          isAdmin ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger
                render={
                  <Button
                    size="sm"
                    className="relative"
                    aria-keyshortcuts="n"
                    title={
                      hasTaskDraft
                        ? 'You have an unsaved task draft'
                        : undefined
                    }
                  />
                }
              >
                <Plus className="size-3.5" />
                New task
                <kbd className="pointer-events-none ml-1 hidden rounded border border-border/70 bg-muted/70 px-1 py-px text-[10px] font-semibold text-muted-foreground sm:inline-block">
                  N
                </kbd>
                {hasTaskDraft && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 size-2.5 rounded-full bg-status-warning ring-2 ring-card"
                  />
                )}
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create new task</DialogTitle>
                  <DialogDescription>
                    Fields autosave as a local draft until you create the
                    task.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Restored-draft banner — offered only when the dialog
                      fields were pristine at mount and a snapshot exists. */}
                  {restoredTaskDraft ? (
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
                            new Date(restoredTaskDraft.meta.savedAt)
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={clearTaskDraft}
                          className="border-status-warning/30 text-status-warning hover:bg-status-warning/10"
                        >
                          Discard
                        </Button>
                        <Button size="sm" onClick={applyTaskDraft}>
                          Restore draft
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="task-title">Title</Label>
                    <Input
                      id="task-title"
                      placeholder="Task title"
                      value={newTitle}
                      onChange={(e) => {
                        setNewTitle(e.target.value)
                        dismissStaleDraftOffer()
                      }}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-description">Description</Label>
                    <Textarea
                      id="task-description"
                      placeholder="Optional description"
                      value={newDescription}
                      onChange={(e) => {
                        setNewDescription(e.target.value)
                        dismissStaleDraftOffer()
                      }}
                      rows={3}
                    />
                  </div>
                  {/* Assignee — required by the frozen taskSchema
                      (assigned_to must be a real app_user UUID). */}
                  <div className="space-y-2">
                    <Label>Assignee</Label>
                    <Select
                      value={newAssignee}
                      onValueChange={(v) => {
                        if (v) setNewAssignee(v)
                        dismissStaleDraftOffer()
                      }}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue
                          placeholder={
                            assignableUsers.length
                              ? 'Select a team member'
                              : 'Loading team…'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableUsers.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No assignable team members found in your scope.
                          </div>
                        ) : (
                          assignableUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              <span className="truncate">{u.name}</span>
                              <span className="ml-1.5 truncate text-xs text-muted-foreground">
                                · {u.department_name || u.email}
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select
                        value={newPriority}
                        onValueChange={(v) => {
                          if (v) setNewPriority(v as TaskPriority)
                          dismissStaleDraftOffer()
                        }}
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.filter(
                            (o) => o.value !== 'all'
                          ).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-due-date">Due Date</Label>
                      <Input
                        id="task-due-date"
                        type="date"
                        value={newDueDate}
                        onChange={(e) => {
                          setNewDueDate(e.target.value)
                          dismissStaleDraftOffer()
                        }}
                        className="numeric h-10"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  {/* Autosave hint — mirrors the draft hook behaviour. */}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:mr-auto">
                    <FileClock className="size-3.5 shrink-0 text-muted-foreground/70" />
                    Draft autosaves locally — nothing is sent until you
                    create it
                  </p>
                  <Button
                    onClick={handleCreate}
                    disabled={saving}
                    className="sm:shrink-0"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" />
                        Create task
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      {/* Filters */}
      <Card size="sm">
        <CardContent className="px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search tasks"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TaskStatus | 'all')
                }
                aria-label="Filter by status"
                className={cn(inputClass, 'flex-1 sm:w-40 sm:flex-none')}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as TaskPriority | 'all')
                }
                aria-label="Filter by priority"
                className={cn(inputClass, 'flex-1 sm:w-40 sm:flex-none')}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  aria-label={`Clear ${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`}
                  className="shrink-0 px-2 text-muted-foreground hover:text-foreground"
                >
                  <FilterX className="size-4" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="icon-sm"
                onClick={fetchTasks}
                aria-label="Refresh tasks"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && <ListCardSkeleton rows={6} />}

      {/* Error State */}
      {!loading && error && (
        <Card className="gap-0 py-0">
          <ErrorState description={error} onRetry={fetchTasks} />
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && tasks.length === 0 && (
        <Card className="gap-0 py-0">
          <EmptyState
            icon={CheckSquare}
            title="No tasks found"
            description={
              activeFilterCount > 0
                ? 'Try adjusting your search or filters'
                : 'Create a new task to get started'
            }
            action={
              isAdmin && activeFilterCount === 0 ? (
                <Button
                  size="sm"
                  className="relative"
                  onClick={() => setCreateOpen(true)}
                  title={
                    hasTaskDraft
                      ? 'You have an unsaved task draft'
                      : undefined
                  }
                >
                  <Plus className="size-3.5" />
                  New task
                  {hasTaskDraft && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 size-2.5 rounded-full bg-status-warning ring-2 ring-card"
                    />
                  )}
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {/* Task List */}
      {!loading && !error && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => {
            const overdue = isOverdue(task.due_date) && task.status !== 'done'
            // Priority accent — only for the escalation tiers (high/urgent)
            // where at-a-glance scannability pays off; skipped for done tasks.
            const showPriorityStrip =
              (task.priority === 'high' || task.priority === 'urgent') &&
              task.status !== 'done'
            return (
              <Card
                key={task.id}
                role="button"
                tabIndex={0}
                aria-label={`Open task: ${task.title}`}
                onClick={() => openDetail(task)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openDetail(task)
                  }
                }}
                className={cn(
                  'relative cursor-pointer py-4 transition-all duration-150 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  overdue &&
                    'border-destructive/40 bg-destructive/[0.04] ring-destructive/30'
                )}
              >
                {showPriorityStrip && (
                  <span
                    aria-hidden="true"
                    className="absolute top-4 bottom-4 left-1 w-1 rounded-full"
                    style={{
                      backgroundColor:
                        STATUS_COLORS[statusTone(task.priority)],
                    }}
                  />
                )}
                <CardContent className="px-5">
                  <div className="flex items-start gap-3">
                    {/* Expand/Collapse arrow */}
                    <button
                      type="button"
                      aria-label={
                        expandedId === task.id
                          ? 'Collapse task details'
                          : 'Expand task details'
                      }
                      aria-expanded={expandedId === task.id}
                      className="mt-0.5 rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedId(
                          expandedId === task.id ? null : task.id
                        )
                      }}
                    >
                      {expandedId === task.id ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'text-sm font-medium text-foreground',
                              task.status === 'done' &&
                                'text-muted-foreground line-through'
                            )}
                          >
                            {task.title}
                          </span>
                          {overdue && <StatusPill status="overdue" />}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusPill status={task.priority} />
                          {/* Quick status change — same one-click flow as the
                              original per-row select, rendered as a pill */}
                          <span
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                aria-label={`Change status of ${task.title}`}
                                render={
                                  <button
                                    type="button"
                                    className="rounded-full outline-none transition-transform duration-150 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-95"
                                  />
                                }
                              >
                                <StatusPill status={task.status} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {STATUS_OPTIONS.filter(
                                  (o) => o.value !== 'all'
                                ).map((o) => (
                                  <DropdownMenuItem
                                    key={o.value}
                                    disabled={o.value === task.status}
                                    onClick={() =>
                                      handleStatusChange(
                                        task.id,
                                        o.value as TaskStatus
                                      )
                                    }
                                  >
                                    <StatusPill status={o.value} />
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </span>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <User className="size-3" />
                          {task.assignee_name}
                        </span>
                        {task.due_date && (
                          <span
                            className={cn(
                              'numeric flex items-center gap-1.5',
                              overdue && 'font-medium text-destructive'
                            )}
                          >
                            <Calendar className="size-3" />
                            {formatDate(task.due_date)}
                          </span>
                        )}
                        <span className="numeric flex items-center gap-1.5">
                          <Clock className="size-3" />
                          {formatDate(task.created_at)}
                        </span>
                      </div>

                      {/* Expanded description */}
                      {expandedId === task.id && task.description && (
                        <div className="mt-2.5 rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                          {task.description}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton
        >
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTask.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {selectedTask.description && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Description
                    </h4>
                    <p className="mt-1.5 rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                      {selectedTask.description}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Priority
                    </h4>
                    <div className="mt-1.5">
                      <StatusPill status={selectedTask.priority} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Status
                    </h4>
                    <div className="mt-1.5">
                      <StatusPill status={selectedTask.status} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Assigned To
                    </h4>
                    <p className="mt-1.5 text-sm text-foreground">
                      {selectedTask.assignee_name}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Assigned By
                    </h4>
                    <p className="mt-1.5 text-sm text-foreground">
                      {selectedTask.assigner_name}
                    </p>
                  </div>
                  {selectedTask.due_date && (
                    <div>
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Due Date
                      </h4>
                      <p className="numeric mt-1.5 text-sm text-foreground">
                        {formatDate(selectedTask.due_date)}
                      </p>
                    </div>
                  )}
                  {selectedTask.completed_at && (
                    <div>
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Completed
                      </h4>
                      <p className="numeric mt-1.5 text-sm text-foreground">
                        {formatDate(selectedTask.completed_at)}
                      </p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Created
                    </h4>
                    <p className="numeric mt-1.5 text-sm text-foreground">
                      {formatDate(selectedTask.created_at)}
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter
                showCloseButton
              >
                {isAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="sm:mr-auto"
                    onClick={() => setDeleteTarget(selectedTask)}
                    disabled={deleting}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                )}
                <Select
                  value={selectedTask.status}
                  onValueChange={(v) => {
                    if (v) {
                      handleStatusChange(
                        selectedTask.id,
                        v as TaskStatus
                      )
                      setSelectedTask((prev) =>
                        prev ? { ...prev, status: v as TaskStatus } : null
                      )
                    }
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.filter(
                      (o) => o.value !== 'all'
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{deleteTarget?.title}&quot;?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
