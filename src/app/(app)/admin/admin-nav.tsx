'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { UsersIcon, Building2Icon } from 'lucide-react'

interface AdminNavProps {
  role: string
}

const tabs = [
  {
    href: '/admin/users',
    label: 'Users',
    icon: UsersIcon,
    roles: ['admin', 'super_admin'],
  },
  {
    href: '/admin/departments',
    label: 'Departments',
    icon: Building2Icon,
    roles: ['super_admin'],
  },
]

export function AdminNav({ role }: AdminNavProps) {
  const pathname = usePathname()

  const visibleTabs = tabs.filter((t) => t.roles.includes(role))

  return (
    <nav
      aria-label="Admin sections"
      className="flex gap-1 border-b border-border"
    >
      {visibleTabs.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150',
              'rounded-t-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
              isActive
                ? 'border-blue-400 bg-blue-500/10 text-blue-200'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
