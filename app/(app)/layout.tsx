import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Dumbbell,
  Home,
  LineChart,
  MessageSquareText,
  Salad,
  User,
} from "lucide-react";
import { getAuthedUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/profile";

/**
 * Six destinations, all in the bottom bar at every breakpoint — the app is used
 * standing in a gym far more than at a desk, so navigation stays within thumb
 * reach rather than moving to a desktop header on wide screens.
 */
const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/plans", label: "Plan", icon: Dumbbell },
  { href: "/diet", label: "Diet", icon: Salad },
  { href: "/coach", label: "Coach", icon: MessageSquareText },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/profile", label: "Profile", icon: User },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The middleware already guards these routes, but it can only check that a
  // session cookie exists. This is the authoritative check: it resolves the
  // cookie to a real user, so a stale or forged one lands on /login.
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  // Onboarding gate lives here rather than in middleware, which runs on the
  // Edge runtime where a database round trip would tax every navigation.
  // Without it, pages render against a profile with null height and weight.
  const profile = await getProfile(user.id);
  if (!profile?.onboarding_completed) redirect("/onboarding");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/dashboard" className="text-base font-bold tracking-tight">
            Rep<span className="text-accent">wise</span>
          </Link>
          <span className="truncate text-xs text-faint">{user.email}</span>
        </div>
      </header>

      {/* pb-24 clears the fixed bottom bar so the last element is never hidden
          behind it. max-w-3xl keeps line lengths readable and removes the wide
          empty gutters a 5xl container leaves on a desktop monitor. */}
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-5">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-3xl items-stretch">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium text-muted transition-colors hover:text-accent active:text-accent sm:text-[11px]"
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
        {/* Keeps the bar clear of the iOS home indicator. */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
