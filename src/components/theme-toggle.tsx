"use client";

import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Light / Dark / System picker. The trigger icon swaps via CSS only
 * (`.dark`-scoped) so server and client markup match — no hydration
 * mismatch, no mounted-flag. The active checkmark lives inside the
 * menu content, which only renders when opened (client-only by nature).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Change theme"
            title="Change theme"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150",
              "hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
              className
            )}
          />
        }
      >
        {/* CSS-only icon swap: Sun while a .light ancestor is active,
            Moon otherwise (dark default — including pre-hydration). */}
        <Sun className="size-4 shrink-0 hidden [.light_&]:inline" />
        <Moon className="size-4 shrink-0 [.light_&]:hidden" />
        <span className="md:hidden lg:inline">Theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-40">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setTheme(o.value)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <o.icon className="size-4" />
              {o.label}
            </span>
            {theme === o.value ? (
              <Check className="size-3.5 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
