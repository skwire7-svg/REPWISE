import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repwise — AI fitness & nutrition coach",
  description:
    "Personalised workout and diet plans, workout logging, and an AI coach that knows your numbers.",
};

export const viewport: Viewport = {
  // One entry per theme so the browser chrome follows the toggle rather than
  // staying dark on a light page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#08090b" },
  ],
  width: "device-width",
  initialScale: 1,
  // The workout logger is used one-handed in a gym; allow zoom for
  // accessibility but keep the default scale sane.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // next-themes writes the theme class onto <html> before paint, so the
    // server and client markup differ here by design.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-ink text-content">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
