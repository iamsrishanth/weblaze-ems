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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { RoleBadge, StatusPill } from '@/components/status'
import { EmptyState, TableSkeleton } from '@/components/states'
import {
  PlusIcon,
  SearchIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UserXIcon,
  UserCheckIcon,
  ArrowUpIcon,
  AlertTriangleIcon,
  Loader2Icon,
  UsersIcon,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import type { UserWithDepartment } from './actions'
import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
} from './actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleLabel(role: string) {
  switch (role) {
    case 'super_admin':
      return 'Super Admin'
    case 'admin':
      return 'Admin'
    default:
      return 'Employee'
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Control heights per the design system: h-9 toolbar filters, h-10 form
// fields. The data-size variant overrides the SelectTrigger's own scale.
const filterControlClass = 'h-9 data-[size=default]:h-9'
const fieldControlClass = 'h-10 w-full data-[size=default]:h-10'

// ---------------------------------------------------------------------------
// Types for forms
// ---------------------------------------------------------------------------

interface UserFormData {
  email: string
  name: string
  role: string
  department_id: string | null
}

const emptyForm: UserFormData = {
  email: '',
  name: '',
  role: 'employee',
  department_id: null,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface UsersClientProps {
  initialUsers: UserWithDepartment[]
  departments: { id: string; name: string }[]
  currentUserRole: string
  currentUserDepartmentId: string | null
}

export default function UsersClient({
  initialUsers,
  departments,
  currentUserRole,
  currentUserDepartmentId,
}: UsersClientProps) {
  const isSuperAdmin = currentUserRole === 'super_admin'

  // Data
  const [users, setUsers] = useState<UserWithDepartment[]>(initialUsers)
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  // Debounced mirror — getUsers fires 300ms after the last keystroke
  // instead of once per character.
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserWithDepartment | null>(null)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<UserWithDepartment | null>(null)
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [promoteTarget, setPromoteTarget] = useState<UserWithDepartment | null>(null)
  const [promoteToRole, setPromoteToRole] = useState('')

  // Form state
  const [form, setForm] = useState<UserFormData>(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Fetch users with current filters
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const result = await getUsers({
      search: debouncedSearch || undefined,
      role: roleFilter && roleFilter !== 'all' ? roleFilter : undefined,
      status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
      department_id: deptFilter && deptFilter !== 'all' ? deptFilter : undefined,
    })
    if (result.success) {
      setUsers(result.data)
    } else {
      toast.error(result.error)
    }
    setLoading(false)
  }, [debouncedSearch, roleFilter, statusFilter, deptFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    if (!form.email) errors.email = 'Email is required'
    if (!form.name) errors.name = 'Name is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleCreateUser() {
    if (!validateForm()) return

    setFormLoading(true)
    const result = await createUser({
      email: form.email,
      name: form.name,
      role: form.role as 'employee' | 'admin' | 'super_admin',
      department_id: form.department_id || null,
    })

    if (result.success) {
      toast.success(`User "${form.name}" created successfully.`)
      setAddDialogOpen(false)
      setForm(emptyForm)
      fetchUsers()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function handleUpdateUser() {
    if (!editUser) return

    const updates: Record<string, unknown> = {}
    if (form.role !== editUser.role) updates.role = form.role
    if (form.department_id !== editUser.department_id)
      updates.department_id = form.department_id
    if (form.name !== editUser.name) updates.name = form.name

    if (Object.keys(updates).length === 0) {
      toast.info('No changes detected.')
      setEditDialogOpen(false)
      return
    }

    setFormLoading(true)
    const result = await updateUser({
      id: editUser.id,
      ...updates,
    })

    if (result.success) {
      toast.success('User updated successfully.')
      setEditDialogOpen(false)
      setEditUser(null)
      fetchUsers()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return

    setFormLoading(true)
    const result = await deactivateUser({ id: deactivateTarget.id })

    if (result.success) {
      toast.success(`User "${deactivateTarget.name}" deactivated.`)
      setDeactivateDialogOpen(false)
      setDeactivateTarget(null)
      fetchUsers()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function handleReactivate(user: UserWithDepartment) {
    setFormLoading(true)
    const result = await reactivateUser({ id: user.id })

    if (result.success) {
      toast.success(`User "${user.name}" reactivated.`)
      fetchUsers()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  async function handlePromote() {
    if (!promoteTarget) return

    setFormLoading(true)
    const result = await updateUser({
      id: promoteTarget.id,
      role: promoteToRole as 'admin',
    })

    if (result.success) {
      toast.success(
        `User "${promoteTarget.name}" promoted to ${roleLabel(promoteToRole)}.`
      )
      setPromoteDialogOpen(false)
      setPromoteTarget(null)
      fetchUsers()
    } else {
      toast.error(result.error)
    }
    setFormLoading(false)
  }

  // ---------------------------------------------------------------------------
  // Dialog openers
  // ---------------------------------------------------------------------------

  function openAddDialog() {
    setForm({
      email: '',
      name: '',
      role: 'employee',
      department_id: currentUserDepartmentId,
    })
    setFormErrors({})
    setAddDialogOpen(true)
  }

  function openEditDialog(user: UserWithDepartment) {
    setEditUser(user)
    setForm({
      email: user.email,
      name: user.name,
      role: user.role,
      department_id: user.department_id,
    })
    setFormErrors({})
    setEditDialogOpen(true)
  }

  // ---------------------------------------------------------------------------
  // The visible department list for selects
  // ---------------------------------------------------------------------------

  const visibleDepartments = isSuperAdmin
    ? departments
    : departments.filter((d) => d.id === currentUserDepartmentId)

  const hasActiveFilters = Boolean(
    search || roleFilter || statusFilter || deptFilter
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
              className="h-9 pl-9"
            />
          </div>

          {/* Filters */}
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? '')}>
            <SelectTrigger
              aria-label="Filter by role"
              className={cn('w-[130px]', filterControlClass)}
            >
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? '')}>
            <SelectTrigger
              aria-label="Filter by status"
              className={cn('w-[130px]', filterControlClass)}
            >
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {isSuperAdmin && departments.length > 1 && (
            <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v ?? '')}>
              <SelectTrigger
                aria-label="Filter by department"
                className={cn('w-[170px]', filterControlClass)}
              >
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Button onClick={openAddDialog} className="h-9 shrink-0 px-4">
          <PlusIcon className="size-4" />
          Add user
        </Button>
      </div>

      {/* Users table */}
      {loading && users.length === 0 ? (
        <Card className="gap-0 py-0">
          <TableSkeleton rows={8} />
        </Card>
      ) : users.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyState
            icon={UsersIcon}
            title="No users found"
            description={
              hasActiveFilters
                ? 'Try adjusting your search or filters.'
                : 'Get started by adding your first user.'
            }
            action={
              !hasActiveFilters ? (
                <Button onClick={openAddDialog} size="sm">
                  <PlusIcon className="size-3.5" />
                  Add user
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th align="right">Status</Th>
              <Th align="right">Joined</Th>
              <Th className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-blue-500/15 text-xs font-semibold text-blue-200">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <RoleBadge role={user.role} />
                </Td>
                <Td className="text-muted-foreground">
                  {user.department_name || '—'}
                </Td>
                <Td align="right">
                  <StatusPill status={user.status} />
                </Td>
                <Td numeric align="right" className="text-muted-foreground">
                  {formatDate(user.created_at)}
                </Td>
                <Td align="right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${user.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(user)}>
                        <PencilIcon className="size-4" />
                        Edit
                      </DropdownMenuItem>

                      {user.status === 'active' ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeactivateTarget(user)
                            setDeactivateDialogOpen(true)
                          }}
                        >
                          <UserXIcon className="size-4" />
                          Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleReactivate(user)}>
                          <UserCheckIcon className="size-4" />
                          Reactivate
                        </DropdownMenuItem>
                      )}

                      {/* Promote: only for super_admin, and only to admin */}
                      {isSuperAdmin &&
                        user.role === 'employee' &&
                        user.status === 'active' && (
                          <DropdownMenuItem
                            onClick={() => {
                              setPromoteTarget(user)
                              setPromoteToRole('admin')
                              setPromoteDialogOpen(true)
                            }}
                          >
                            <ArrowUpIcon className="size-4" />
                            Promote to Admin
                          </DropdownMenuItem>
                        )}

                      {isSuperAdmin &&
                        user.role === 'admin' &&
                        user.status === 'active' && (
                          <DropdownMenuItem
                            onClick={() => {
                              setPromoteTarget(user)
                              setPromoteToRole('super_admin')
                              setPromoteDialogOpen(true)
                            }}
                          >
                            <ArrowUpIcon className="size-4" />
                            Promote to Super Admin
                          </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}

      {/* ───── Add User Dialog ───── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create a new user. They will receive a password reset email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                className="h-10"
              />
              {formErrors.email && (
                <p className="text-xs text-destructive">{formErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                placeholder="John Doe"
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
              <Label htmlFor="add-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v ?? 'employee' })}
              >
                <SelectTrigger id="add-role" className={fieldControlClass}>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && (
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-dept">Department</Label>
              <Select
                value={form.department_id ?? 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, department_id: v === 'none' || v === null ? null : v })
                }
              >
                <SelectTrigger id="add-dept" className={fieldControlClass}>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {visibleDepartments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleCreateUser} disabled={formLoading}>
              {formLoading && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Edit User Dialog ───── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update role, department, or name for {editUser?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v ?? 'employee' })}
              >
                <SelectTrigger id="edit-role" className={fieldControlClass}>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && (
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-dept">Department</Label>
              <Select
                value={form.department_id ?? 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, department_id: v === 'none' || v === null ? null : v })
                }
              >
                <SelectTrigger id="edit-dept" className={fieldControlClass}>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {visibleDepartments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleUpdateUser} disabled={formLoading}>
              {formLoading && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Deactivate Confirmation ───── */}
      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate user</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{' '}
              <strong>{deactivateTarget?.name}</strong>? They will no longer be
              able to sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={formLoading}
            >
              {formLoading && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Promote Confirmation ───── */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Promote to {roleLabel(promoteToRole)}</DialogTitle>
            <DialogDescription>
              <div className="mt-1 flex items-start gap-2">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-status-warning" />
                <span>
                  You are about to promote{' '}
                  <strong>{promoteTarget?.name}</strong> to{' '}
                  <strong>{roleLabel(promoteToRole)}</strong>. This grants them
                  additional permissions. Continue?
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button onClick={handlePromote} disabled={formLoading}>
              {formLoading && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Confirm promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
