import "expo-sqlite/localStorage/install";

import type { SupportedStorage } from "@supabase/supabase-js";

export function getSupabaseAuthStorage(): SupportedStorage {
  return globalThis.localStorage;
}
