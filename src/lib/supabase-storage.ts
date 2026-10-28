import type { SupportedStorage } from "@supabase/supabase-js";

// Metro replaces this module with .native.ts or .web.ts where available.
// Keeping the fallback server-safe also covers non-browser renderers.
export function getSupabaseAuthStorage(): SupportedStorage | undefined {
  return undefined;
}
