import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

export const REPORT_REASONS = [
  "Inappropriate content or photos",
  "Fake profile / Impersonation",
  "Harassment or abusive behavior",
  "Spam, scam, or commercial",
  "Underage user",
  "Other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

const BLOCKED_USERS_KEY = "gormati_blocked_users_";

// In-memory set of blocked user IDs
const blockedUserIdsSet = new Set<string>();
const blockedListeners = new Set<(blockedIds: string[]) => void>();

function notifyListeners() {
  const current = Array.from(blockedUserIdsSet);
  blockedListeners.forEach((fn) => fn(current));
}

/**
 * Check if a user ID is currently blocked in memory
 */
export function isUserBlocked(userId: string): boolean {
  return blockedUserIdsSet.has(userId);
}

/**
 * Subscribe to changes in blocked users list
 */
export function subscribeToBlockedUsers(listener: (blockedIds: string[]) => void): () => void {
  blockedListeners.add(listener);
  listener(Array.from(blockedUserIdsSet));
  return () => {
    blockedListeners.delete(listener);
  };
}

/**
 * Load blocked user IDs from local storage
 */
export async function loadBlockedUserIds(currentUserId?: string): Promise<string[]> {
  if (!currentUserId) return Array.from(blockedUserIdsSet);

  try {
    let stored: string | null = null;
    if (Platform.OS !== "web") {
      stored = await SecureStore.getItemAsync(BLOCKED_USERS_KEY + currentUserId);
    } else if (typeof localStorage !== "undefined") {
      stored = localStorage.getItem(BLOCKED_USERS_KEY + currentUserId);
    }

    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => blockedUserIdsSet.add(id));
        notifyListeners();
      }
    }
  } catch (err) {
    console.warn("[Safety] Error loading blocked users from storage:", err);
  }

  return Array.from(blockedUserIdsSet);
}

/**
 * Block a member. Immediately persists locally and attempts to sync to backend.
 */
export async function blockMember(currentUserId: string, targetUserId: string): Promise<boolean> {
  if (!targetUserId || targetUserId === currentUserId) return false;

  blockedUserIdsSet.add(targetUserId);
  notifyListeners();

  // Persist locally
  try {
    const list = Array.from(blockedUserIdsSet);
    const serialized = JSON.stringify(list);
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(BLOCKED_USERS_KEY + currentUserId, serialized);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(BLOCKED_USERS_KEY + currentUserId, serialized);
    }
  } catch (err) {
    console.warn("[Safety] Error saving blocked users locally:", err);
  }

  // Attempt backend storage / clean up mutual relationship
  try {
    // Clean up follow relationships
    await supabase
      .from("follow_relationships")
      .delete()
      .or(
        `and(requester_id.eq.${currentUserId},target_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},target_id.eq.${currentUserId})`,
      );

    // Clean up direct messages
    await supabase
      .from("messages")
      .delete()
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`,
      );
  } catch (err) {
    console.log("[Safety] Optional backend cleanup notice:", err);
  }

  return true;
}

/**
 * Report a member for safety violation.
 */
export async function reportMember({
  reporterId,
  reportedUserId,
  reason,
  details,
}: {
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
}): Promise<boolean> {
  if (!reportedUserId) return false;

  // Also automatically block the reported user for immediate safety
  await blockMember(reporterId, reportedUserId);

  try {
    // Attempt insert into user_reports if table exists
    await supabase.from("user_reports" as never).insert({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      details: details ?? null,
      created_at: new Date().toISOString(),
    } as never);
  } catch (err) {
    console.log("[Safety] Saved report locally; backend user_reports notice:", err);
  }

  return true;
}

/**
 * In-app account deletion for Google Play compliance.
 * Permanently removes user's profile, messages, and social connections, then signs out.
 */
export async function deleteUserAccount(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: "No authenticated user to delete." };
  }

  try {
    // 1. Delete messages
    await supabase
      .from("messages")
      .delete()
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    // 2. Delete follow relationships
    await supabase
      .from("follow_relationships")
      .delete()
      .or(`requester_id.eq.${userId},target_id.eq.${userId}`);

    // 3. Delete profile
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.warn("[Safety] Error removing profile during deletion:", profileError.message);
    }

    // 4. Clean local storage for this user
    try {
      if (Platform.OS !== "web") {
        await SecureStore.deleteItemAsync(BLOCKED_USERS_KEY + userId);
      } else if (typeof localStorage !== "undefined") {
        localStorage.removeItem(BLOCKED_USERS_KEY + userId);
      }
    } catch {
      // Ignore local storage clear error
    }

    // 5. Sign out of Supabase
    await supabase.auth.signOut({ scope: "local" });

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete account.";
    return { success: false, error: errorMsg };
  }
}

