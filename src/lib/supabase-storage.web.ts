import type { SupportedStorage } from "@supabase/supabase-js";

export function getSupabaseAuthStorage(): SupportedStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    // Browser storage can be unavailable in restricted/private contexts.
    return undefined;
  }
}
