/**
 * Environment access.
 *
 * Supabase is now the only backend. The previous local-JSON dev mode and its
 * `isSupabaseConfigured()` switch are gone: a silent fallback to a file on disk
 * is far more dangerous than a loud startup error, because a typo'd env var
 * looks like a working app right up until you notice nothing was ever saved.
 *
 * The two NEXT_PUBLIC_ values are inlined into the browser bundle at build
 * time, so these helpers are safe to call from client components. Note that
 * Next.js only substitutes *statically analysable* references — always call
 * these accessors rather than indexing process.env dynamically.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.local.example to .env.local and fill it in, ` +
        `then restart the dev server — Next.js only reads env files at startup.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Server-only. Absent in most setups — the AI features surface a "not
 * configured" message rather than crashing the page that renders them.
 *
 * Powers all three AI features: the workout generator, the diet generator and
 * the coach. A key from Google AI Studio works on the free tier.
 */
export function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}
