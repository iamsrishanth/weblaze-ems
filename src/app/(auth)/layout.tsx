import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Weblaze EMS — Authentication",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo placeholder */}
        <div className="mb-8 text-center">
          <Image
            src="/logo_light.png"
            alt="Weblaze"
            width={560}
            height={136}
            className="mx-auto mb-3 h-10 w-auto"
            priority
          />
          <h1 className="text-xl font-semibold text-slate-800">
            Weblaze EMS
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Employee Management System
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
