import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/config";

/** Shape @supabase/ssr hands to `setAll`; see the note in lib/supabase/server.ts. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Routes reachable without a session. Everything else requires auth. */
const PUBLIC_ROUTES = ["/", "/login", "/signup", "/auth/callback", "/auth/error"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function redirectTo(request: NextRequest, pathname: string, keepNext?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (keepNext) url.searchParams.set("next", keepNext);
  return url;
}

/**
 * Refreshes the auth session and enforces route access.
 *
 * Note this only answers "is there a session?". Whether onboarding is finished
 * is checked in app/(app)/layout.tsx instead — that lookup needs the database,
 * and middleware runs on the Edge runtime where a query per request would tax
 * every navigation.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Must be getUser(), not getSession(). getUser() revalidates the token with
  // Supabase; getSession() only reads the cookie and will happily report a user
  // from a forged or expired one.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    // Copy cookies onto the redirect — dropping them logs the user out on the
    // next navigation in a way that looks like a random session bug.
    return copyCookies(
      supabaseResponse,
      NextResponse.redirect(redirectTo(request, "/login", pathname)),
    );
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    return copyCookies(
      supabaseResponse,
      NextResponse.redirect(redirectTo(request, "/dashboard")),
    );
  }

  return supabaseResponse;
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
