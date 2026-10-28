
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAuthStorage } from "./supabase-storage";

function requirePublicSetting(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      `[Supabase] Missing ${name}. Add it to .env.local and restart Expo. Use a publishable key in the app, never a secret or service-role key.`,
    );
  }

  return value;
}

const supabaseUrl = requirePublicSetting(
  "EXPO_PUBLIC_SUPABASE_URL",
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);
const supabasePublishableKey = requirePublicSetting(
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// This is intentionally public client configuration. Never put a Supabase
// secret/service-role key in this app bundle.
export const supabasePublicConfig = {
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
};

const authStorage = getSupabaseAuthStorage();

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(authStorage ? { storage: authStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
