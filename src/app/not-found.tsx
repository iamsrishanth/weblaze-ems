import Link from "next/link";
import { Compass, LayoutDashboard, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Root not-found — renders inside the root layout (dark app tokens) for any
 * unknown path. Middleware refreshes the session but does not redirect
 * unknown URLs, so this page is reachable both logged in and logged out.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4">
      {/* Faint blueprint grid behind the content — grounds the empty dark
          surface (aria-hidden decoration, static CSS). */}
      <div aria-hidden="true" className="dark-grid-pattern absolute inset-0" />

      <div className="animate-fade-in-up relative mx-auto max-w-md text-center">
        {/* Ghost numeral — large, low-contrast backdrop that gives the page
            its visual anchor without competing with the heading. Nudged up
            and right so the icon doesn't sit dead-centre on the "0". */}
        <p
          aria-hidden="true"
          className="numeric pointer-events-none absolute -top-[4.5rem] left-[54%] -translate-x-1/2 bg-gradient-to-b from-slate-500/35 to-slate-800/60 bg-clip-text text-[120px] leading-none font-bold text-transparent select-none sm:text-[150px]"
        >
          404
        </p>

        <div className="relative">
          <div className="group mb-5 flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-400/10 text-blue-300 shadow-[0_0_48px_-12px] shadow-blue-400/30 backdrop-blur-sm transition-transform duration-300 group-hover:rotate-12">
              <Compass className="size-8 transition-transform duration-500 group-hover:rotate-[25deg]" />
            </div>
          </div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Error · Page not found
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            This page went off the clock
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The page you are looking for doesn&apos;t exist or may have been
            moved. Check the URL, or head back to a known place.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button nativeButton={false} render={<Link href="/dashboard" />}>
              <LayoutDashboard className="size-4" />
              Go to dashboard
            </Button>
            <Button
              variant="outline"
              className="border-border bg-white/5 hover:bg-white/10"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              <LogIn className="size-4" />
              Sign in
            </Button>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Weblaze EMS · Employee Management System
          </p>
        </div>
      </div>
    </div>
  );
}
