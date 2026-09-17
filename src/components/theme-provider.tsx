"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Class-based dual theming. Dark is the app default (DESIGN.md §3); the
 * light variant reuses the `.light` token set that the auth screens
 * pioneered. next-themes writes the resolved class onto <html> before
 * first paint (no flash) and persists the choice in localStorage.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
