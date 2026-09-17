import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { AdminNav } from './admin-nav'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/admin/users')
  }

  const { data: profile } = await supabase
    .from('app_user')
    .select('role, department_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Panel"
        description="Manage users and departments for your organization."
      />

      <AdminNav role={profile.role} />

      {children}
    </div>
  )
}
