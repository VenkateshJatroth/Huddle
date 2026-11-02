import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { GormatiProfile } from "./gormati-profiles";
import { supabase } from "./supabase";

export type MissingProfileField = {
  id:
    | "avatar"
    | "display_name"
    | "bio"
    | "location"
    | "interests"
    | "voice_intro"
    | "prompts";
  label: string;
  shortLabel: string;
};

export type ProfileCompletion = {
  completionPercentage: number;
  isCoreComplete: boolean;
  isFullyComplete: boolean;
  missingFields: string[];
  missingFieldDetails: MissingProfileField[];
  completedCount: number;
  totalCount: number;
};

// Alias for backwards compatibility
export type ProfileCompletionResult = ProfileCompletion;

function isRunningInExpoGo(): boolean {
  try {
    return (
      Constants.appOwnership === "expo" ||
      (Constants as { executionEnvironment?: string }).executionEnvironment === "storeClient"
    );
  } catch {
    return false;
  }
}

/**
 * Calculates profile completion status.
 * Evaluates core mandatory fields:
 * - display_name (non-empty, >= 2 chars, not default placeholder)
 * - bio (at least 15 chars)
 * - location / city (non-empty)
 * - interests (at least 3 selected)
 * - avatar_url (or gallery photo)
 *
 * Plus optional enrichment fields:
 * - voice intro
 * - prompt answers
 */
export function getProfileCompletion(
  profile?: Partial<GormatiProfile> | null,
): ProfileCompletion {
  const missingFieldDetails: MissingProfileField[] = [];
  const missingFields: string[] = [];
  let completionPercentage = 0;
  let completedCount = 0;
  const totalCount = 7;

  // 1. Profile Photo / Avatar (20% - Core)
  const hasAvatar = Boolean(
    (profile?.avatar_url && profile.avatar_url.trim().length > 0) ||
      (Array.isArray(profile?.gallery_urls) && profile.gallery_urls.length > 0),
  );
  if (hasAvatar) {
    completionPercentage += 20;
    completedCount += 1;
  } else {
    missingFields.push("Upload a profile photo");
    missingFieldDetails.push({
      id: "avatar",
      label: "Upload a profile photo",
      shortLabel: "Photo",
    });
  }

  // 2. Display Name (15% - Core)
  const displayName = profile?.display_name?.trim();
  const lowerName = displayName?.toLowerCase() ?? "";
  const hasDisplayName = Boolean(
    displayName &&
      displayName.length >= 2 &&
      lowerName !== "member" &&
      lowerName !== "gormati member" &&
      !lowerName.startsWith("user_"),
  );
  if (hasDisplayName) {
    completionPercentage += 15;
    completedCount += 1;
  } else {
    missingFields.push("Set your display name");
    missingFieldDetails.push({
      id: "display_name",
      label: "Set your display name",
      shortLabel: "Name",
    });
  }

  // 3. Bio - at least 15 characters (20% - Core)
  const bio = profile?.bio?.trim();
  const hasBio = Boolean(bio && bio.length >= 15);
  if (hasBio) {
    completionPercentage += 20;
    completedCount += 1;
  } else {
    missingFields.push("Add a bio (15+ chars)");
    missingFieldDetails.push({
      id: "bio",
      label: "Add a bio (15+ chars)",
      shortLabel: "Bio",
    });
  }

  // 4. Location / City (15% - Core)
  const location = profile?.location?.trim();
  const hasLocation = Boolean(location && location.length >= 2);
  if (hasLocation) {
    completionPercentage += 15;
    completedCount += 1;
  } else {
    missingFields.push("Set your city / location");
    missingFieldDetails.push({
      id: "location",
      label: "Set your city / location",
      shortLabel: "City",
    });
  }

  // 5. Interests - at least 3 selected (10% - Core)
  const interests = Array.isArray(profile?.interests) ? profile.interests : [];
  const hasInterests = interests.length >= 3;
  if (hasInterests) {
    completionPercentage += 10;
    completedCount += 1;
  } else {
    missingFields.push("Select 3+ interests");
    missingFieldDetails.push({
      id: "interests",
      label: "Select 3+ interests",
      shortLabel: "3+ Interests",
    });
  }

  // 6. 15-Second Voice Intro (10% - Enrichment)
  const hasVoice = Boolean(profile?.voice_intro_url && profile.voice_intro_url.trim().length > 0);
  if (hasVoice) {
    completionPercentage += 10;
    completedCount += 1;
  } else {
    missingFields.push("Record a voice intro");
    missingFieldDetails.push({
      id: "voice_intro",
      label: "Record a voice intro",
      shortLabel: "Voice Intro",
    });
  }

  // 7. Profile Prompts (10% - Enrichment)
  const hasPrompts = Boolean(
    Array.isArray(profile?.prompts) &&
      profile.prompts.some(
        (p) => p && typeof p.answer === "string" && p.answer.trim().length >= 5,
      ),
  );
  if (hasPrompts) {
    completionPercentage += 10;
    completedCount += 1;
  } else {
    missingFields.push("Answer a profile prompt");
    missingFieldDetails.push({
      id: "prompts",
      label: "Answer a profile prompt",
      shortLabel: "Prompt",
    });
  }

  // All 5 core fields are mandatory
  const isCoreComplete = hasDisplayName && hasAvatar && hasBio && hasLocation && hasInterests;
  const clampedPercentage = Math.min(100, completionPercentage);
  const isFullyComplete = clampedPercentage >= 100;

  return {
    completionPercentage: clampedPercentage,
    isCoreComplete,
    isFullyComplete,
    missingFields,
    missingFieldDetails,
    completedCount,
    totalCount,
  };
}

/** Alias wrapper for backwards compatibility */
export function checkProfileCompletion(
  profile?: Partial<GormatiProfile> | null,
): ProfileCompletion {
  return getProfileCompletion(profile);
}

/**
 * Automated reminder for incomplete profiles.
 * Triggers at most once every 24 hours on app launch/session load.
 * Inserts an in-app notification in public.notifications and schedules a local push notification.
 */
export async function checkAndTriggerProfileCompletionReminder(
  userId: string,
  profile?: Partial<GormatiProfile> | null,
): Promise<void> {
  if (!userId) return;

  const completion = getProfileCompletion(profile);
  if (completion.isFullyComplete) return;

  const storageKey = `gormati_last_completion_reminder_${userId}`;
  try {
    const lastReminder = globalThis.localStorage?.getItem(storageKey);
    if (lastReminder) {
      const elapsed = Date.now() - Number(lastReminder);
      // Throttle to once every 24 hours
      if (elapsed < 24 * 60 * 60 * 1000) {
        return;
      }
    }
  } catch {
    // Storage guard
  }

  try {
    // 1. In-app notification
    await (supabase as any).from("notifications").insert({
      user_id: userId,
      actor_name: "GorMati Community",
      type: "message",
      content:
        "Complete your GorMati profile so other members can discover all your details! ✨",
      reference_id: "profile",
      is_read: false,
    });

    // 2. Native push notification
    if (Platform.OS !== "web" && !isRunningInExpoGo()) {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Complete Your GorMati Profile ✨",
              body: "Complete your GorMati profile so other members can discover all your details!",
              data: { url: "/(tabs)/profile" },
            },
            trigger: null,
          });
        }
      } catch {
        // Notification schedule guard
      }
    }

    globalThis.localStorage?.setItem(storageKey, String(Date.now()));
  } catch {
    // Non-blocking
  }
}
