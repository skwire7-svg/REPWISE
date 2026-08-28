/**
 * Profile reads and writes.
 *
 * Every function here goes through the cookie-scoped anon client, so Row Level
 * Security decides what comes back — there is deliberately no `userId`
 * parameter on the write paths that would let a caller aim at another user.
 */

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();

  // maybeSingle(), not single(): single() treats "no row" as an error, and a
  // brand-new user between signup and the trigger firing legitimately has none.
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();

  return data ?? null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
