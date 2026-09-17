"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2Icon,
  LogInIcon,
  EyeIcon,
  EyeOffIcon,
  KeyboardIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

/** localStorage key for the remembered email (client-only convenience). */
const REMEMBER_EMAIL_KEY = "weblaze-ems:remember-email";

function readRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function LoginPage() {
  // Lazy init from localStorage — hydration-safe because the form is not
  // rendered during SSR/hydration (the `checking` skeleton is), and this
  // avoids a synchronous setState inside the mount effect.
  const [email, setEmail] = useState(readRememberedEmail);
  // Whether a remembered email was restored — captured once so the two
  // autoFocus props stay stable (autoFocus only applies at mount anyway).
  const [rememberedEmailPresent] = useState(() => readRememberedEmail() !== "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => readRememberedEmail() !== "");
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if already logged in (restoring the remembered email happened in
  // the state initialisers above, while the skeleton card was showing).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        window.location.href = "/dashboard";
      } else {
        setChecking(false);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Persist (or clear) the remembered email before the attempt so it
    // survives a failed sign-in — it remembers the email, not the session.
    try {
      if (remember && email) {
        window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
      } else {
        window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch {
      // Private browsing / storage disabled — non-fatal.
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Signed in successfully!");
      // Force cookie sync with full page navigation
      window.location.href = "/dashboard";
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /** Track Caps Lock while the user is in the password field. */
  const handleCapsLockKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  };

  if (checking) {
    return (
      // Skeleton mirrors the final form footprint (header, two fields with
      // labels, footer button) so there is no layout shift when it swaps in.
      <Card className="shadow-sm">
        <CardHeader className="space-y-1">
          <div className="mx-auto h-7 w-40 animate-pulse rounded-md bg-slate-200" />
          <div className="mx-auto mt-1 h-4 w-56 animate-pulse rounded bg-slate-100" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="size-4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        </CardContent>
        <CardFooter className="mt-6">
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in-up relative overflow-hidden shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5">
      {/* Brand accent hairline — echoes the backdrop glows (emerald → sky). */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400"
      />
      <CardHeader className="space-y-1">
        <CardTitle className="text-center text-2xl font-semibold tracking-tight">
          Welcome back
        </CardTitle>
        <CardDescription className="text-center">
          Sign in to your Weblaze EMS account
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@weblaze.co.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              // Smart focus: with a remembered email the password is the
              // only thing left to type — focus it instead (see below).
              autoFocus={!rememberedEmailPresent}
              className="h-10 bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={handleCapsLockKey}
                onKeyDown={handleCapsLockKey}
                onBlur={() => setCapsLockOn(false)}
                required
                autoComplete="current-password"
                aria-describedby={capsLockOn ? "caps-lock-hint" : undefined}
                autoFocus={rememberedEmailPresent}
                className="h-10 bg-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            <p
              id="caps-lock-hint"
              aria-live="polite"
              className={
                capsLockOn
                  ? "flex items-center gap-1.5 text-xs font-medium text-status-warning"
                  : "sr-only"
              }
            >
              <KeyboardIcon className="size-3.5 shrink-0" />
              Caps Lock is on
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="remember-email"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 cursor-pointer rounded accent-primary"
            />
            <Label
              htmlFor="remember-email"
              className="cursor-pointer text-[13px] font-normal text-slate-600"
            >
              Remember my email
            </Label>
          </div>
        </CardContent>
        <CardFooter className="mt-6">
          <Button
            type="submit"
            size="lg"
            className="h-10 w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <LogInIcon className="size-4" />
                Sign in
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
