"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  LayoutDashboardIcon,
  ClockIcon,
  CheckSquareIcon,
  FileTextIcon,
  UsersIcon,
  Building2Icon,
  LogOutIcon,
  MenuIcon,
  XIcon,
} from "lucide-react";

interface SidebarProps {
  user: {
    id: string;
    email?: string;
    name: string;
    role: string;
    department?: string | null;
  };
}

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboardIcon,
    roles: ["employee", "admin", "super_admin"],
  },
  {
    href: "/attendance",
    label: "Attendance",
    icon: ClockIcon,
    roles: ["employee", "admin", "super_admin"],
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CheckSquareIcon,
    roles: ["employee", "admin", "super_admin"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileTextIcon,
    roles: ["employee", "admin", "super_admin"],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: UsersIcon,
    roles: ["admin", "super_admin"],
  },
  {
    href: "/admin/departments",
    label: "Departments",
    icon: Building2Icon,
    roles: ["admin", "super_admin"],
  },
];

function roleBadgeVariant(role: string) {
  switch (role) {
    case "super_admin":
      return "default" as const;
    case "admin":
      return "secondary" as const;
    default:
      return "ghost" as const;
  }
}

function roleLabel(role: string) {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "admin":
      return "Admin";
    default:
      return "Employee";
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(user.role),
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 items-center gap-3 border-b border-slate-700/50 px-4">
        <Image
          src="/logo_dark.png"
          alt="Weblaze"
          width={560}
          height={136}
          className="h-7 w-auto"
          priority
        />
        <span className="font-semibold text-base text-white">EMS</span>
      </div>

      {/* User info */}
      <div className="border-b border-slate-700/50 px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback className="bg-blue-600 text-white text-xs">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-400">
              {user.department || user.email || ""}
            </p>
          </div>
        </div>
        <div className="mt-2">
          <Badge variant={roleBadgeVariant(user.role)} className="text-[10px]">
            {roleLabel(user.role)}
          </Badge>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {filteredNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-600/20 text-blue-300"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/50 p-2">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-red-600/10 hover:text-red-400"
        >
          <LogOutIcon className="size-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-800">
        <div className="flex h-full flex-col bg-slate-900">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile sidebar (Sheet) */}
      <div className="lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="fixed left-3 top-3 z-40 text-slate-400 hover:text-white"
                aria-label="Open menu"
              />
            }
          >
            <MenuIcon className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 p-0 bg-slate-900 border-r border-slate-700/50"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 z-50 rounded-md p-1 text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Close menu"
            >
              <XIcon className="size-5" />
            </button>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
