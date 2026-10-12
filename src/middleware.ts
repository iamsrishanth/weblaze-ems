import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── CRON endpoints: verify CRON_SECRET header ──────────────
  if (pathname.startsWith("/api/cron/")) {
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  // Mobile API handlers verify bearer tokens themselves. Never run the browser
  // cookie refresh/redirect path for these JSON endpoints.
  if (pathname.startsWith("/api/mobile/")) {
    return NextResponse.next();
  }

  // ── Auth check for protected /app/* routes ─────────────────
  // (app) route group maps to /dashboard, /attendance, /tasks, etc.
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/attendance") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/departments") ||
    pathname.startsWith("/admin")
  ) {
    const { supabaseResponse, user } = await updateSession(request);

    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  }

  // ── Refresh session for all other routes ───────────────────
  const { supabaseResponse } = await updateSession(request);
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
