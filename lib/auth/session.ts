/**
 * The one place server components ask "who is signed in?".
 *
 * Data reads live in lib/db/* — this module is only about identity. Keeping the
 * split means a page that needs the profile imports it from lib/db/profile.ts
 * alongside everything else it queries, rather than reaching through auth.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
}

/**
 * The signed-in user, or null.
 *
 * getUser() rather than getSession(): getUser() revalidates the token with
 * Supabase, while getSession() only reads the cookie and will happily report a
 * user from a forged or expired one.
 */
export async function getAuthedUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

/**
 * The signed-in user, or a redirect to /login.
 *
 * The return type is non-nullable, so callers get a `SessionUser` without a
 * null check — `redirect()` throws, so this never falls through.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  return user;
}
