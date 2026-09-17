'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  TableBody,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, Th, Td } from '@/components/data-table'
import { StatusPill } from '@/components/status'
import { EmptyState, TableSkeleton } from '@/components/states'
import {
  PlusIcon,
  Building2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PowerIcon,
  Trash2Icon,
  Loader2Icon,
  AlertTriangleIcon,
} from 'lucide-react'
import type { DepartmentWithStats } from './actions'
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  getEligibleHeads,
  canDeleteDepartment,
} from './actions'

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

interface DeptFormData {
  name: string
  description: string
  head_id: string | null
  leads_target: string
  calls_target: string
}

const emptyDeptForm: DeptFormData = {
  name: '',
  description: '',
  head_id: null,
  leads_target: '',
  calls_target: '',
}

// Control heights per the design system: h-10 form fields. The data-size
// variant overrides the SelectTrigger's own scale.
const fieldControlClass = 'h-10 w-full data-[size=default]:h-10'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DepartmentsClientProps {
  initialDepartments: DepartmentWithStats[]
  initialHeads: { id: string; name: string; email: string; role: string }[]
}

export default function DepartmentsClient({
  initialDepartments,
  initialHeads,
}: DepartmentsClientProps) {
  // Data
  const [departments, setDepartments] = useState<DepartmentWithStats[]>(
    initialDepartments
  )
  const [heads, setHeads] = useState(initialHeads)
  const [loading, setLoading] = useState(false)

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDept, setEditDept] = useState<DepartmentWithStats | null>(null)
  const [deleteWarnOpen, setDeleteWarnOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DepartmentWithStats | null>(null)
  const [deleteInfo, setDeleteInfo] = useState<{
    has_active_users: boolean
    user_count: number
  } | null>(null)

  // Form
  const [form, setForm] = useState<DeptFormData>(emptyDeptForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchDepartments = useCallback(async () => {
    setLoading(true)
    const result = await getDepartments({})
    if (result.success) {
      setDepartments(result.data)
    } else {
      toast.error(result.error)
    }
    setLoading(false)
  }, [])

  const fetchHeads = useCallback(async () => {
    const result = await getEligibleHeads({})
    if (result.success) {
      setHeads(result.data)
    }
  }, [])

  useEffect(() => {
    fetchHeads()
  }, [fetchHeads])

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validateDeptForm(): boolean {
    const errors: Record<string, string> = {}
    if (!form.name.trim()) errors.name = 'Department name is required'
    if (form.leads_target && isNaN(Number(form.leads_target)))
      errors.leads_target = 'Must be a number'
    if (form.calls_target && isNaN(Number(form.calls_target)))
      errors.calls_target = 'Must be a number'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!validateDeptForm()) return

    setFormLoading(true)
    const result = await createDepartment({
      name: form.name,
      description: form.description || undefined,
      head_id: form.head_id || null,
      leads_target: form.leads_target
        ? parseInt(form.leads_target, 10)
        : null,
      calls_target: form.calls_target
        ? parseInt(form.calls_target, 10)
        : null,
    })

    if (result.success) {
      toast.success(`Department "${form.name}" created.`)
      setAddDialogOpen(false)
      setForm(emptyDeptForm)
      fetchDepartments()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function handleUpdate() {
    if (!editDept) return
    if (!validateDeptForm()) return

    const updates: Record<string, unknown> = {}
    if (form.name !== editDept.name) updates.name = form.name
    if (form.description !== (editDept.description ?? ''))
      updates.description = form.description || null
    if (form.head_id !== editDept.head_id)
      updates.head_id = form.head_id || null
    if (parseInt(form.leads_target || '0') !== (editDept.leads_target ?? 0))
      updates.leads_target = form.leads_target
        ? parseInt(form.leads_target, 10)
        : null
    if (parseInt(form.calls_target || '0') !== (editDept.calls_target ?? 0))
      updates.calls_target = form.calls_target
        ? parseInt(form.calls_target, 10)
        : null

    if (Object.keys(updates).length === 0) {
      toast.info('No changes detected.')
      setEditDialogOpen(false)
      return
    }

    setFormLoading(true)
    const result = await updateDepartment({
      id: editDept.id,
      ...updates,
    })

    if (result.success) {
      toast.success('Department updated.')
      setEditDialogOpen(false)
      setEditDept(null)
      fetchDepartments()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function handleToggleStatus(dept: DepartmentWithStats) {
    const newStatus = dept.status === 'active' ? 'inactive' : 'active'
    setFormLoading(true)

    // If deactivating, check for active users
    if (newStatus === 'inactive' && dept.employee_count > 0) {
      toast.error(
        `Cannot deactivate department with ${dept.employee_count} active users. Reassign them first.`
      )
      setFormLoading(false)
      return
    }

    const result = await updateDepartment({
      id: dept.id,
      status: newStatus as 'active' | 'inactive',
    })

    if (result.success) {
      toast.success(
        `Department "${dept.name}" ${newStatus === 'active' ? 'activated' : 'deactivated'}.`
      )
      fetchDepartments()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function checkCanDelete(dept: DepartmentWithStats) {
    setDeleteTarget(dept)
    setDeleteWarnOpen(true)

    const result = await canDeleteDepartment({ id: dept.id })
    if (result.success) {
      setDeleteInfo(result.data)
    }
  }

  // ---------------------------------------------------------------------------
  // Dialog openers
  // ---------------------------------------------------------------------------

  function openAddDialog() {
    setForm(emptyDeptForm)
    setFormErrors({})
    setAddDialogOpen(true)
  }

  function openEditDialog(dept: DepartmentWithStats) {
    setEditDept(dept)
    setForm({
      name: dept.name,
      description: dept.description ?? '',
      head_id: dept.head_id,
      leads_target: dept.leads_target?.toString() ?? '',
      calls_target: dept.calls_target?.toString() ?? '',
    })
    setFormErrors({})
    setEditDialogOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {departments.length} department{departments.length !== 1 ? 's' : ''}
        </p>
        <Button onClick={openAddDialog} className="h-9 shrink-0 px-4">
          <PlusIcon className="size-4" />
          Add department
        </Button>
      </div>

      {/* Departments table */}
      {loading && departments.length === 0 ? (
        <Card className="gap-0 py-0">
          <TableSkeleton rows={6} />
        </Card>
      ) : departments.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyState
            icon={Building2Icon}
            title="No departments yet"
            description="Create your first department to organize users and targets."
            action={
              <Button onClick={openAddDialog} size="sm">
                <PlusIcon className="size-3.5" />
                Add department
              </Button>
            }
          />
        </Card>
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th>Department</Th>
              <Th align="right">Members</Th>
              <Th align="right">Leads target</Th>
              <Th align="right">Calls target</Th>
              <Th align="right">Active</Th>
              <Th className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((dept) => (
              <TableRow key={dept.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
                      <Building2Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {dept.name}
                      </p>
                      {dept.head_name && (
                        <p className="truncate text-xs text-muted-foreground">
                          Head · {dept.head_name}
                        </p>
                      )}
                    </div>
                  </div>
                </Td>
                <Td numeric align="right" className="text-foreground">
                  {dept.employee_count}
                </Td>
                <Td numeric align="right" className="text-muted-foreground">
                  {dept.leads_target ?? '—'}
                </Td>
                <Td numeric align="right" className="text-muted-foreground">
                  {dept.calls_target ?? '—'}
                </Td>
                <Td align="right">
                  <StatusPill status={dept.status} />
                </Td>
                <Td align="right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${dept.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(dept)}>
                        <PencilIcon className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(dept)}>
                        <PowerIcon className="size-4" />
                        {dept.status === 'active'
                          ? 'Deactivate'
                          : 'Activate'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => checkCanDelete(dept)}
                      >
                        <Trash2Icon className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}

      {/* ───── Add Department Dialog ───── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>
              Create a new department in the organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-dept-name">Name</Label>
              <Input
                id="add-dept-name"
                placeholder="e.g., Sales"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="h-10"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-dept-desc">Description</Label>
              <Input
                id="add-dept-desc"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-dept-head">Department Head</Label>
              <Select
                value={form.head_id ?? 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, head_id: v === 'none' || v === null ? null : v })
                }
              >
                <SelectTrigger id="add-dept-head" className={fieldControlClass}>
                  <SelectValue placeholder="Select head" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No head assigned</SelectItem>
                  {heads.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name} ({h.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-leads-target">Leads Target</Label>
                <Input
                  id="add-leads-target"
                  type="number"
                  placeholder="0"
                  value={form.leads_target}
                  onChange={(e) =>
                    setForm({ ...form, leads_target: e.target.value })
                  }
                  className="h-10 numeric"
                />
                {formErrors.leads_target && (
                  <p className="text-xs text-destructive">
                    {formErrors.leads_target}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-calls-target">Calls Target</Label>
                <Input
                  id="add-calls-target"
                  type="number"
                  placeholder="0"
                  value={form.calls_target}
                  onChange={(e) =>
                    setForm({ ...form, calls_target: e.target.value })
                  }
                  className="h-10 numeric"
                />
                {formErrors.calls_target && (
                  <p className="text-xs text-destructive">
                    {formErrors.calls_target}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleCreate} disabled={formLoading}>
              {formLoading && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Create department
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Edit Department Dialog ───── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit department</DialogTitle>
            <DialogDescription>
              Update details for {editDept?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-dept-name">Name</Label>
              <Input
                id="edit-dept-name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="h-10"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-dept-desc">Description</Label>
              <Input
                id="edit-dept-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-dept-head">Department Head</Label>
              <Select
                value={form.head_id ?? 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, head_id: v === 'none' || v === null ? null : v })
                }
              >
                <SelectTrigger id="edit-dept-head" className={fieldControlClass}>
                  <SelectValue placeholder="Select head" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No head assigned</SelectItem>
                  {heads.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name} ({h.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-leads-target">Leads Target</Label>
                <Input
                  id="edit-leads-target"
                  type="number"
                  placeholder="0"
                  value={form.leads_target}
                  onChange={(e) =>
                    setForm({ ...form, leads_target: e.target.value })
                  }
                  className="h-10 numeric"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-calls-target">Calls Target</Label>
                <Input
                  id="edit-calls-target"
                  type="number"
                  placeholder="0"
                  value={form.calls_target}
                  onChange={(e) =>
                    setForm({ ...form, calls_target: e.target.value })
                  }
                  className="h-10 numeric"
                />
              </div>
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleUpdate} disabled={formLoading}>
              {formLoading && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Delete Warning Dialog ───── */}
      <Dialog open={deleteWarnOpen} onOpenChange={setDeleteWarnOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cannot Delete Department</DialogTitle>
            <DialogDescription>
              {deleteInfo?.has_active_users ? (
                <div className="mt-1 flex items-start gap-2">
                  <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-status-warning" />
                  <span>
                    <strong>{deleteTarget?.name}</strong> has{' '}
                    <strong>{deleteInfo.user_count}</strong> active user
                    {deleteInfo.user_count !== 1 ? 's' : ''}. Please reassign or
                    deactivate all users before deleting this department.
                  </span>
                </div>
              ) : (
                <span>
                  Use the Supabase dashboard or a database tool to delete empty
                  departments. This operation is not supported from the UI to
                  prevent accidental data loss.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button
              variant="secondary"
              onClick={() => setDeleteWarnOpen(false)}
            >
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
