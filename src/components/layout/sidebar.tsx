"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { cn, orgToday } from "@/lib/utils";
import { DRAFT_CHANGE_EVENT } from "@/hooks/use-draft";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/status";
import { openCommandPalette } from "@/components/palette-trigger";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  SearchIcon,
  ChevronRightIcon,
} from "lucide-react";

export interface SidebarProps {
  user: {
    id: string;
    email?: string;
    name: string;
    role: string;
    department?: string | null;
  };
}

const WORK_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/attendance", label: "Attendance", icon: ClockIcon },
  { href: "/tasks", label: "Tasks", icon: CheckSquareIcon },
  { href: "/reports", label: "Reports", icon: FileTextIcon },
] as const;

const ADMIN_ITEMS = [
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/departments", label: "Departments", icon: Building2Icon },
] as const;

/** LocalStorage draft keys mirrored onto the nav (must match the pages'
 *  useDraft keys). The EOD draft is day-scoped, the task draft is not. */
const EOD_DRAFT_KEY_PREFIX = "weblaze-ems:eod-draft:";
const TASK_DRAFT_KEY = "weblaze-ems:task-draft";

function readDraftExists(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
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

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  draftHint,
}: {
  href: string;
  label: string;
  icon: typeof ClockIcon;
  active: boolean;
  onNavigate?: () => void;
  /** An unsaved local draft exists for this section — badge dot. */
  draftHint?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={draftHint ? `${label} — unsaved draft` : label}
      className={cn(
        "relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium outline-none transition-colors duration-150",
        "md:w-12 md:justify-center md:px-0 lg:w-full lg:justify-start lg:px-3",
        "focus-visible:ring-2 focus-visible:ring-ring/70",
        active
          ? "bg-sidebar-active text-sidebar-active-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-sidebar-indicator md:left-1 lg:left-0"
        />
      ) : null}
      <Icon className="size-4 shrink-0" />
      <span className="truncate md:hidden lg:inline">{label}</span>
      {/* Unsaved-draft badge — amber dot pinned to the item's top-right
          corner; reads as a notification badge on the md icon rail and as
          a row indicator at full width. */}
      {draftHint ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-status-warning ring-2 ring-sidebar"
        />
      ) : null}
      {draftHint ? (
        <span className="sr-only">(unsaved draft)</span>
      ) : null}
    </Link>
  );
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: SidebarProps["user"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isAdmin =
    user.role === "admin" || user.role === "super_admin";

  // Unsaved-draft indicators: checked post-mount (SSR renders no dot, so
  // hydration stays consistent) and re-checked whenever a page saves or
  // clears a draft (DRAFT_CHANGE_EVENT) or the org day rolls over.
  const [draftHints, setDraftHints] = useState<{
    eod: boolean;
    task: boolean;
  }>({ eod: false, task: false });

  useEffect(() => {
    const read = () => ({
      eod: readDraftExists(`${EOD_DRAFT_KEY_PREFIX}${orgToday()}`),
      task: readDraftExists(TASK_DRAFT_KEY),
    });
    const refresh = () => {
      // Change-guarded so the minute tick never causes a pointless
      // re-render while nothing changed.
      setDraftHints((prev) => {
        const next = read();
        return prev.eod === next.eod && prev.task === next.task
          ? prev
          : next;
      });
    };
    // Initial read is deferred (rAF) so the first paint matches the
    // server-rendered dot-free markup — hydration stays consistent.
    const raf = window.requestAnimationFrame(refresh);
    // DRAFT_CHANGE_EVENT fires on every save/clear from any page's
    // useDraft; the minute tick covers the org-day rolling over (the
    // EOD key is day-scoped) while the tab sits idle.
    window.addEventListener(DRAFT_CHANGE_EVENT, refresh);
    const tick = window.setInterval(refresh, 60_000);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener(DRAFT_CHANGE_EVENT, refresh);
      window.clearInterval(tick);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4",
          "md:justify-center lg:justify-start lg:px-5"
        )}
      >
        <Image
          src="/logo_dark.png"
          alt="Weblaze"
          width={560}
          height={136}
          className="hidden h-7 w-auto lg:block"
          priority
        />
        <Image
          src="/icon-192.png"
          alt="Weblaze"
          width={192}
          height={192}
          className="size-9 rounded-lg md:block lg:hidden"
          priority
        />
        <span className="hidden text-sm font-semibold tracking-wide text-sidebar-foreground lg:inline">
          EMS
        </span>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto px-2 py-4"
      >
        {/* Command palette trigger — icon at md rail, full row at lg */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search (Ctrl K)"
          aria-keyshortcuts="Control+K Meta+K"
          title="Search (Ctrl K)"
          className={cn(
            "mb-3 flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-foreground/[0.03] py-2 text-sm font-medium text-muted-foreground outline-none",
            "transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
            "md:w-12 md:justify-center md:px-0 lg:w-full lg:justify-start lg:px-3"
          )}
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="hidden truncate lg:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground lg:inline">
            ⌘K
          </kbd>
        </button>

        <p className="hidden px-3 pb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase lg:block">
          Work
        </p>
        <ul className="space-y-0.5">
          {WORK_ITEMS.map((item) => (
            <li key={item.href} className="md:flex md:justify-center lg:block">
              <NavItem
                {...item}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
                draftHint={
                  item.href === "/reports"
                    ? draftHints.eod
                    : item.href === "/tasks"
                      ? draftHints.task
                      : false
                }
              />
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <>
            <p className="hidden px-3 pt-5 pb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase lg:block">
              Admin
            </p>
            <ul className="space-y-0.5 pt-1 md:pt-4 lg:pt-0">
              {ADMIN_ITEMS.map((item) => (
                <li
                  key={item.href}
                  className="md:flex md:justify-center lg:block"
                >
                  <NavItem
                    {...item}
                    active={isActivePath(pathname, item.href)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      {/* User block (opens the profile page) + theme + sign out */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Link
          href="/profile"
          onClick={onNavigate}
          title="View profile"
          aria-label={`View profile — ${user.name}`}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-2 py-1.5 outline-none transition-colors duration-150",
            "hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/70",
            "md:justify-center lg:justify-start"
          )}
        >
          <Avatar>
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.department || user.email || ""}
            </p>
          </div>
          <ChevronRightIcon
            aria-hidden="true"
            className="hidden size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 lg:block"
          />
        </Link>
        <div className="mt-2 hidden lg:block">
          <RoleBadge role={user.role} />
        </div>
        <ThemeToggle className="mt-2 md:justify-center lg:justify-start" />
        <SignOutButton className="mt-1 md:justify-center lg:justify-start" />
      </div>
    </div>
  );
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = "/login";
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150",
        "hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/70",
        className
      )}
    >
      <LogOutIcon className="size-4 shrink-0" />
      <span className="md:hidden lg:inline">Sign out</span>
    </button>
  );
}

export default function Sidebar({ user }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar (sheet trigger) — full width, sticky. Respects the
          iOS notch / standalone-PWA safe area at the top. */}
      <div className="sticky top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] pl-4 pr-4 md:hidden print:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <MenuIcon className="size-5" />
        </Button>
        <Image
          src="/logo_dark.png"
          alt="Weblaze"
          width={560}
          height={136}
          className="h-6 w-auto"
          priority
        />
        <span className="ml-auto text-xs font-medium text-muted-foreground">EMS</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          onClick={openCommandPalette}
          aria-label="Search (Ctrl K)"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <SearchIcon className="size-4.5" />
        </Button>
      </div>

      {/* Desktop sidebar: icon rail at md, full at lg */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col bg-sidebar md:flex lg:w-64 print:hidden">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile navigation sheet */}
      <div className="md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 border-sidebar-border bg-sidebar p-0"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation menu</SheetTitle>
            </SheetHeader>
            <SidebarContent user={user} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
