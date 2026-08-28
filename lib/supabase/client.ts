"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/config";

/**
 * Supabase client for Client Components.
 *
 * Uses the anon/publishable key, which is public by design — every query it
 * makes is filtered by the Row Level Security policies in supabase/schema.sql.
 * The service-role key must never appear in a file that ships to the browser.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
