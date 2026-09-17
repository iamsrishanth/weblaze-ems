import type { Metadata } from "next";
import Image from "next/image";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Weblaze EMS — Authentication",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `.light` re-declares every design token with light values for the
    // auth surface (DESIGN.md: auth screens stay light, logo_light.png).
    <div className="light relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-emerald-50/70">
      {/* Skip-to-content — hidden until focused (a11y keyboard shortcut). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-xl focus:ring-2 focus:ring-ring/60 focus:outline-none"
      >
        Skip to main content
      </a>
      {/* Backdrop decoration (aria-hidden): dot grid + two soft brand glows.
          Static CSS only — no animation, reduced-motion safe. */}
      <div aria-hidden="true" className="auth-pattern absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-[-10%] size-[480px] rounded-full bg-emerald-200/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] size-[420px] rounded-full bg-sky-200/30 blur-3xl"
      />

      <div
        id="main-content"
        tabIndex={-1}
        className="relative flex flex-1 items-center justify-center px-4 py-12 outline-none"
      >
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Image
              src="/logo_light.png"
              alt="Weblaze"
              width={560}
              height={136}
              className="mx-auto mb-4 h-10 w-auto"
              priority
            />
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Weblaze EMS
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Employee Management System
            </p>
          </div>

          {children}

          <p className="mt-10 text-center text-xs text-slate-600">
            Internal tool · authorised Weblaze staff only
          </p>
        </div>
      </div>
      {/* Toasts portal to <body> (dark root tokens) — force light chrome here */}
      <Toaster
        theme="light"
        position="top-center"
        style={
          {
            "--normal-bg": "#ffffff",
            "--normal-text": "#0f172a",
            "--normal-border": "#e2e8f0",
            "--border-radius": "0.75rem",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
