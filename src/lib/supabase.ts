import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseAuthStorage } from "./supabase-storage";

const fallbackUrl = "https://fknckdbrdeatgpbhaqbi.supabase.co";
const fallbackKey = "sb_publishable_EbhCdhg4H0tot9sqUUqWFA_9fkCztG_";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || fallbackUrl;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || fallbackKey;

// This is intentionally public client configuration. Never put a Supabase
// secret/service-role key in this app bundle.
export const supabasePublicConfig = {
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
};

const authStorage = getSupabaseAuthStorage();

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(authStorage ? { storage: authStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
