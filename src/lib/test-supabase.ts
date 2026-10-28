
import { supabasePublicConfig } from "./supabase";

export type SupabaseConnectionTestResult = {
  success: boolean;
  message: string;
};

const requestTimeoutMs = 10_000;

/**
 * Checks the read-only Supabase Auth health endpoint. This verifies project
 * URL/key reachability without requiring a user session, table, or policy.
 * It does not verify access to the database or any app data.
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionTestResult> {
  const healthUrl = `${supabasePublicConfig.url.replace(/\/+$/, "")}/auth/v1/health`;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { apikey: supabasePublicConfig.publishableKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Supabase Auth responded with HTTP ${response.status}. Check the project URL and publishable key.`,
      };
    }

    return {
      success: true,
      message: "Supabase Auth is reachable. This check does not test database access.",
    };
  } catch {
    return {
      success: false,
      message: "Could not reach Supabase Auth. Check the network and project URL.",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
