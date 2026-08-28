import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/config";

/**
 * Shape @supabase/ssr hands to `setAll`. Annotated explicitly because the
 * callback parameter is not inferred without a Database generic on the client,
 * which would otherwise leave these as implicit `any` under `strict`.
 */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * `cookies()` is async in Next.js 15, so this function is too — always await it.
 * Still the anon key, so RLS remains in force; this is the client that should
 * handle essentially all application data access.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. That is fine here: the
            // middleware refreshes the session on every request, so the write
            // this call would have made has already happened upstream.
          }
        },
      },
    },
  );
}

/**
 * Admin client — bypasses Row Level Security entirely.
 *
 * Reserved for seeding and trusted maintenance scripts. Do NOT reach for this
 * to "fix" a query that returns nothing: an empty result under the anon client
 * almost always means an RLS policy is doing its job, and swapping in this
 * client to get data back would delete the app's only access-control layer.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createServerClient(supabaseUrl(), serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
