"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { OctagonXIcon, RefreshCwIcon, LayoutDashboardIcon } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
            <OctagonXIcon className="size-8" />
          </div>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {process.env.NODE_ENV === "development" ? (
          <p className="numeric mt-4 rounded-lg border border-border bg-muted/50 p-3 text-left text-xs text-muted-foreground">
            {error.message}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>
            <RefreshCwIcon className="size-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/dashboard")}
          >
            <LayoutDashboardIcon className="size-4" />
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
