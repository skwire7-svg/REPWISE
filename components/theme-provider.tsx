"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin client wrapper so the root layout can stay a server component.
 *
 * next-themes writes the theme class onto <html> from an inline script that
 * runs before paint, which is what stops a dark-mode user seeing a white flash
 * on first load. That also means <html> markup differs between server and
 * client, so the layout sets suppressHydrationWarning on it.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
