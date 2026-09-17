import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import CommandPalette from "@/components/command-palette";
import ConnectivityToast from "@/components/connectivity-toast";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile from app_user table
  const { data: profile } = await supabase
    .from("app_user")
    .select("name, role, department_id")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profile?.name || user.email?.split("@")[0] || "User";
  const userRole = profile?.role || "employee";

  // Fetch department name if user has a department
  let userDepartment: string | null = null;
  if (profile?.department_id) {
    const { data: dept } = await supabase
      .from("department")
      .select("name")
      .eq("id", profile.department_id)
      .maybeSingle();
    userDepartment = dept?.name ?? null;
  }

  return (
    <div className="min-h-screen">
      {/* Skip-to-content — hidden until focused (a11y keyboard shortcut).
          Uses the app (dark) tokens so it fits whichever surface it lands on. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-xl focus:ring-2 focus:ring-ring/60 focus:outline-none print:hidden"
      >
        Skip to main content
      </a>
      <Sidebar
        user={{
          id: user.id,
          email: user.email,
          name: userName,
          role: userRole,
          department: userDepartment,
        }}
      />
      {/* Content column — offset for the fixed sidebar (rail at md, full at lg).
          Offsets reset in print (sidebar is print:hidden). */}
      <div className="flex min-h-screen flex-col md:pl-[72px] lg:pl-64 md:print:pl-0 lg:print:pl-0">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 outline-none md:px-6 md:py-8 lg:px-8 print:px-0 print:py-0"
        >
          {children}
        </main>
      </div>
      {/* Command palette (Ctrl/Cmd+K) — global quick nav, role-aware */}
      <CommandPalette role={userRole} />
      {/* Offline/online transition toasts (renders nothing) */}
      <ConnectivityToast />
      {/* Toasts portal to <body> — follows the active theme (dark default,
          light when the user picks it via the sidebar toggle). */}
      <Toaster />
    </div>
  );
}
