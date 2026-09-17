"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PALETTE_OPEN_EVENT } from "@/components/palette-trigger";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboardIcon,
  ClockIcon,
  CheckSquareIcon,
  FileTextIcon,
  CalendarRangeIcon,
  UsersIcon,
  Building2Icon,
  DownloadIcon,
  LogOutIcon,
  SearchIcon,
  CornerDownLeftIcon,
  ArrowUpDownIcon,
  KeyboardIcon,
} from "lucide-react";

/**
 * Command palette (Ctrl/Cmd+K) — quick navigation + actions for the
 * authenticated app shell. Client-only; renders nothing until opened.
 *
 * Triggers:
 *  - Ctrl+K / ⌘K from anywhere inside the app
 *  - the `openCommandPalette()` helper in palette-trigger.ts (sidebar buttons)
 */

type CommandItem = {
  id: string;
  label: string;
  group: "Navigate" | "Admin" | "Export" | "Actions";
  icon: typeof ClockIcon;
  /** Extra search terms (lowercased match against label + keywords). */
  keywords?: string;
  /** Internal route to push. */
  href?: string;
  /** URL whose response is a download (CSV exports). */
  download?: string;
  /** Named side effect. */
  action?: "sign-out" | "show-shortcuts";
};

const NAV_ITEMS: CommandItem[] = [
  {
    id: "nav-dashboard",
    label: "Dashboard",
    group: "Navigate",
    icon: LayoutDashboardIcon,
    keywords: "home overview kpi today",
    href: "/dashboard",
  },
  {
    id: "nav-attendance",
    label: "Attendance",
    group: "Navigate",
    icon: ClockIcon,
    keywords: "check in out history team timesheet",
    href: "/attendance",
  },
  {
    id: "nav-tasks",
    label: "Tasks",
    group: "Navigate",
    icon: CheckSquareIcon,
    keywords: "todo assigned priority status",
    href: "/tasks",
  },
  {
    id: "nav-reports",
    label: "Reports",
    group: "Navigate",
    icon: FileTextIcon,
    keywords: "eod end of day submit compliance history",
    href: "/reports",
  },
  {
    id: "nav-weekly",
    label: "Weekly Reports",
    group: "Navigate",
    icon: CalendarRangeIcon,
    keywords: "rollup summary week",
    href: "/reports/weekly",
  },
];

const ADMIN_ITEMS: CommandItem[] = [
  {
    id: "admin-users",
    label: "Users",
    group: "Admin",
    icon: UsersIcon,
    keywords: "employees people accounts roles",
    href: "/admin/users",
  },
  {
    id: "admin-departments",
    label: "Departments",
    group: "Admin",
    icon: Building2Icon,
    keywords: "teams targets leads calls",
    href: "/admin/departments",
  },
];

const EXPORT_ITEMS: CommandItem[] = [
  {
    id: "export-attendance",
    label: "Export attendance CSV",
    group: "Export",
    icon: DownloadIcon,
    keywords: "download spreadsheet",
    download: "/api/export/attendance",
  },
  {
    id: "export-eod",
    label: "Export EOD reports CSV",
    group: "Export",
    icon: DownloadIcon,
    keywords: "download spreadsheet end of day",
    download: "/api/export/eod",
  },
  {
    id: "export-weekly",
    label: "Export weekly reports CSV",
    group: "Export",
    icon: DownloadIcon,
    keywords: "download spreadsheet rollup",
    download: "/api/export/weekly",
  },
];

const ACTION_ITEMS: CommandItem[] = [
  {
    id: "action-shortcuts",
    label: "Keyboard shortcuts",
    group: "Actions",
    icon: KeyboardIcon,
    keywords: "help keys hotkeys cheatsheet",
    action: "show-shortcuts",
  },
  {
    id: "action-signout",
    label: "Sign out",
    group: "Actions",
    icon: LogOutIcon,
    keywords: "logout exit end session",
    action: "sign-out",
  },
];

/** Order in which groups render when they have matches. */
const GROUP_ORDER: CommandItem["group"][] = [
  "Navigate",
  "Admin",
  "Export",
  "Actions",
];

/** Highlight the matched query fragment inside a label. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-foreground">{text.slice(i, i + query.length)}</span>
      {text.slice(i + query.length)}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/70 bg-muted/60 px-1 font-sans text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

/** One row of the shortcuts cheat-sheet. */
function ShortcutRow({
  keys,
  label,
}: {
  keys: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
    </div>
  );
}

/** The shortcuts cheat-sheet body — shared by the help dialog. */
function ShortcutsContent() {
  return (
    <div className="divide-y divide-border/50">
      <div className="pb-1">
        <p className="px-0.5 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Global
        </p>
        <ShortcutRow
          keys={
            <>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </>
          }
          label="Open command palette"
        />
        <ShortcutRow keys={<Kbd>?</Kbd>} label="Show this shortcut list" />
        <ShortcutRow keys={<Kbd>Esc</Kbd>} label="Close dialogs and menus" />
      </div>
      <div className="pt-1">
        <p className="px-0.5 pb-1 pt-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Command palette
        </p>
        <ShortcutRow
          keys={
            <>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </>
          }
          label="Move the selection"
        />
        <ShortcutRow
          keys={
            <>
              <Kbd>Home</Kbd>
              <Kbd>End</Kbd>
            </>
          }
          label="Jump to first / last item"
        />
        <ShortcutRow keys={<Kbd>↵</Kbd>} label="Run the selected command" />
        <ShortcutRow
          keys={<Kbd>A–Z 0–9</Kbd>}
          label="Filter as you type"
        />
      </div>
    </div>
  );
}

/** True when the keydown expresses "?" (Shift+/ sends key "/" on some
 *  layouts/IMEs — accept both so the cheat-sheet is always reachable).
 *  Accepts both DOM and React synthetic keyboard events. */
function isQuestionMarkKey(e: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return e.key === "?" || (e.key === "/" && e.shiftKey);
}

/** True when the keydown happened inside a text-entry surface. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export default function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === "admin" || role === "super_admin";

  const items = useMemo(
    () => [
      ...NAV_ITEMS,
      ...(isAdmin ? ADMIN_ITEMS : []),
      ...EXPORT_ITEMS,
      ...ACTION_ITEMS,
    ],
    [isAdmin]
  );

  /** Case-insensitive match on label + keywords + group. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.keywords?.toLowerCase().includes(q) ?? false)
    );
  }, [items, query]);

  /** Flatten per-group so group headers only render for non-empty groups. */
  const groups = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: filtered.filter((item) => item.group === group),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  /** Open with a fresh query (all open paths go through here). */
  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  const openHelp = useCallback(() => {
    setOpen(false);
    setHelpOpen(true);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openPalette();
      else setOpen(false);
    },
    [openPalette]
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    // New result set — restart selection from the top (kept in the event
    // handler rather than an effect per the React docs' guidance).
    setActiveIndex(0);
  };

  // Global hotkeys: Ctrl/Cmd+K toggles the palette; "?" opens the shortcuts
  // cheat-sheet (ignored while typing in inputs so keystrokes are never
  // hijacked). Custom-event open requests come from the sidebar buttons.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setQuery("");
            setActiveIndex(0);
          }
          return !v;
        });
      } else if (
        isQuestionMarkKey(e) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        openHelp();
      }
    };
    const onOpenRequest = () => openPalette();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(PALETTE_OPEN_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpenRequest);
    };
  }, [openPalette, openHelp]);

  // Keep the active item in view while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const perform = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      if (item.href) {
        router.push(item.href);
      } else if (item.download) {
        // Direct link — the route streams a CSV (auth cookies ride along).
        window.location.href = item.download;
      } else if (item.action === "sign-out") {
        void (async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.href = "/login";
        })();
      } else if (item.action === "show-shortcuts") {
        setHelpOpen(true);
      }
    },
    [router]
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        filtered.length ? (i - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) perform(item);
    } else if (isQuestionMarkKey(e)) {
      // The global handler skips inputs — offer the cheat-sheet here too.
      e.preventDefault();
      openHelp();
    }
  };

  // Flatten with a running index across groups for keyboard navigation.
  let runningIndex = -1;

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] max-h-[min(24rem,70vh)] w-full translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages and actions. Arrow keys move, Enter selects, Escape
          closes.
        </DialogDescription>

        {/* Search input row */}
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            // Combobox pattern: the input drives the listbox below.
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={
              filtered.length > 0
                ? `command-palette-option-${activeIndex}`
                : undefined
            }
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, exports, actions…"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            <Kbd>esc</Kbd>
          </span>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-72 overflow-y-auto overscroll-contain p-1.5"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
              <SearchIcon className="size-5 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">
                No results for &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground">
                Try &ldquo;attendance&rdquo;, &ldquo;export&rdquo; or
                &ldquo;users&rdquo;
              </p>
            </div>
          ) : (
            groups.map(({ group, items: groupItems }, groupIdx) => (
              <div
                key={group}
                className={cn(
                  "mb-1 last:mb-0",
                  // Divider between groups for clearer visual parsing
                  groupIdx > 0 &&
                    "mt-1.5 border-t border-border/40 pt-2.5"
                )}
              >
                <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {group}
                </p>
                <ul>
                  {groupItems.map((item) => {
                    runningIndex++;
                    const index = runningIndex;
                    const active = index === activeIndex;
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <div
                          id={`command-palette-option-${index}`}
                          role="option"
                          aria-selected={active}
                          data-index={index}
                          tabIndex={-1}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => perform(item)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-75",
                            active
                              ? "bg-blue-500/15 text-blue-100"
                              : "text-slate-300 hover:text-foreground"
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              active
                                ? "text-blue-300"
                                : "text-slate-400"
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <Highlight text={item.label} query={query.trim()} />
                          </span>
                          {item.download ? (
                            <span className="shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              CSV
                            </span>
                          ) : null}
                          {active ? (
                            <CornerDownLeftIcon className="size-3.5 shrink-0 text-blue-300/80" />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1.5">
            <ArrowUpDownIcon className="size-3" />
            navigate
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <CornerDownLeftIcon className="size-3" />
            select
          </span>
          {/* "?" opens the shortcuts cheat-sheet */}
          <button
            type="button"
            onClick={openHelp}
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="?"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 -outline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring/60"
          >
            <Kbd>?</Kbd>
            shortcuts
          </button>
          <span className="ml-auto hidden shrink-0 sm:inline">
            Weblaze EMS
          </span>
        </div>
      </DialogContent>
    </Dialog>

    {/* Shortcuts cheat-sheet — same component so it can share state with
        the palette (opening it from the palette closes the palette) without
        cross-component event plumbing. Opened via "?" anywhere, the palette
        footer button, or the "Keyboard shortcuts" command. */}
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyboardIcon className="size-4 text-blue-300" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Navigate faster — every shortcut works anywhere inside the app.
          </DialogDescription>
        </DialogHeader>
        <ShortcutsContent />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Got it
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
