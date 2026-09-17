"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
  KeyRoundIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  CheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const setupSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Password strength — purely presentational heuristic (0–4). The actual
// gate stays the zod schema above (min 8 chars); this only nudges better
// passwords and must never block submission on its own.
// ---------------------------------------------------------------------------

function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;

const STRENGTH_TONE = [
  "negative",
  "negative",
  "warning",
  "partial",
  "positive",
] as const;

function requirementMet(req: string, pw: string): boolean {
  switch (req) {
    case "length":
      return pw.length >= 8;
    case "case":
      return /[a-z]/.test(pw) && /[A-Z]/.test(pw);
    case "number":
      return /\d/.test(pw);
    case "symbol":
      return /[^A-Za-z0-9]/.test(pw);
    default:
      return false;
  }
}

const REQUIREMENTS: { key: string; label: string }[] = [
  { key: "length", label: "8+ characters" },
  { key: "case", label: "Upper & lower case" },
  { key: "number", label: "A number" },
  { key: "symbol", label: "A symbol" },
];

export default function SetupPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Check if user needs password setup
  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      // Check the must_change_pw flag from app_user table
      const { data: profile, error } = await supabase
        .from("app_user")
        .select("must_change_pw")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking user profile:", error);
        toast.error("Could not verify account status.");
        return;
      }

      if (profile?.must_change_pw) {
        setNeedsSetup(true);
      } else {
        // User doesn't need setup, redirect
        window.location.href = "/dashboard";
        return;
      }

      setChecking(false);
    }

    checkUser();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const result = setupSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0] as keyof typeof errors;
        if (!fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Session expired. Please sign in again.");
        window.location.href = "/login";
        return;
      }

      // Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      // Update must_change_pw flag
      const { error: profileError } = await supabase
        .from("app_user")
        .update({ must_change_pw: false })
        .eq("id", user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
        // Password was updated, proceed anyway
      }

      toast.success("Password set successfully!");
      window.location.href = "/dashboard";
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      // Skeleton mirrors the final form footprint (header, two fields,
      // footer button) to avoid layout shift.
      <Card className="shadow-sm">
        <CardHeader className="space-y-1">
          <div className="mx-auto size-12 animate-pulse rounded-full bg-slate-200" />
          <div className="mx-auto mt-2 h-7 w-44 animate-pulse rounded-md bg-slate-200" />
          <div className="mx-auto mt-1 h-4 w-64 animate-pulse rounded bg-slate-100" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
        </CardContent>
        <CardFooter className="mt-6">
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
        </CardFooter>
      </Card>
    );
  }

  if (!needsSetup) {
    return null; // redirect will happen
  }

  const score = passwordScore(password);
  const strengthTone = STRENGTH_TONE[score];

  return (
    <Card className="animate-fade-in-up relative overflow-hidden shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5">
      {/* Brand accent hairline — echoes the backdrop glows (emerald → sky). */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400"
      />
      <CardHeader className="space-y-1">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheckIcon className="size-6" />
        </div>
        <CardTitle className="text-center text-2xl font-semibold tracking-tight">
          Set your password
        </CardTitle>
        <CardDescription className="mx-auto max-w-sm text-center">
          Your account requires a new password before continuing. Choose a
          strong password with at least 8 characters.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password)
                    setErrors((p) => ({ ...p, password: undefined }));
                }}
                required
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                aria-describedby="password-strength"
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

            {/* Strength meter — presentation only; the gate is the zod rule. */}
            {password ? (
              <div id="password-strength" aria-live="polite">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Password strength
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      strengthTone === "positive" && "text-status-positive",
                      strengthTone === "partial" && "text-status-partial",
                      strengthTone === "warning" && "text-status-warning",
                      strengthTone === "negative" && "text-status-negative"
                    )}
                  >
                    {STRENGTH_LABELS[score]}
                  </span>
                </div>
                <div
                  className="mt-1.5 flex gap-1"
                  role="img"
                  aria-label={`Password strength: ${STRENGTH_LABELS[score]}`}
                >
                  {[1, 2, 3, 4].map((seg) => (
                    <span
                      key={seg}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors duration-200",
                        seg <= score
                          ? strengthTone === "positive"
                            ? "bg-status-positive"
                            : strengthTone === "partial"
                              ? "bg-status-partial"
                              : strengthTone === "warning"
                                ? "bg-status-warning"
                                : "bg-status-negative"
                          : "bg-slate-200"
                      )}
                    />
                  ))}
                </div>
                <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                  {REQUIREMENTS.map((req) => {
                    const met = requirementMet(req.key, password);
                    return (
                      <li
                        key={req.key}
                        className={cn(
                          "flex items-center gap-1.5 text-xs transition-colors duration-200",
                          met ? "text-status-positive" : "text-slate-500"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-3.5 items-center justify-center rounded-full",
                            met
                              ? "bg-status-positive/15"
                              : "bg-slate-200/70"
                          )}
                        >
                          {met ? (
                            <CheckIcon className="size-2.5" />
                          ) : (
                            <span className="size-1 rounded-full bg-slate-400" />
                          )}
                        </span>
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {errors.password ? (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircleIcon className="size-3.5 shrink-0" />
                {errors.password}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword)
                    setErrors((p) => ({ ...p, confirmPassword: undefined }));
                }}
                required
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                className="h-10 bg-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                {showConfirm ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword ? (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircleIcon className="size-3.5 shrink-0" />
                {errors.confirmPassword}
              </p>
            ) : null}
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
                Setting password…
              </>
            ) : (
              <>
                <KeyRoundIcon className="size-4" />
                Set password &amp; continue
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
