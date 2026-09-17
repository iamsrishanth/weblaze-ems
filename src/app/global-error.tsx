"use client";

/**
 * Global error boundary — the last resort when the ROOT layout itself throws.
 * It replaces the root layout entirely, so it renders its own <html>/<body>
 * and uses inline styles only (Tailwind/global CSS may not have loaded).
 * Kept on-brand: dark app palette (#020617 / #1E293B / green CTA).
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Global error:", error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#020617",
          color: "#F8FAFC",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 20px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontSize: "28px",
              lineHeight: 1,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F87171"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#94A3B8",
            }}
          >
            The application hit an unexpected error. Please try again — if it
            keeps happening, contact your administrator.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: "12px",
                color: "#64748B",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                height: "40px",
                padding: "0 18px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "#22C55E",
                color: "#052E16",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                height: "40px",
                padding: "0 18px",
                borderRadius: "10px",
                border: "1px solid #334155",
                backgroundColor: "transparent",
                color: "#F8FAFC",
                fontSize: "14px",
                fontWeight: 500,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              Go to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
